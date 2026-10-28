import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit/service";
import { checkLoginRateLimit, resetRateLimit } from "@/lib/rate-limiter";
import { extractClientContext, getSafeRedirectUrl } from "@/lib/security";

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
  callbackUrl: z.string().optional(),
});

export async function POST(req: Request) {
  const clientCtx = extractClientContext(req);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password, callbackUrl } = result.data;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Rate Limiting Protection (Brute-force prevention)
    const rateCheck = checkLoginRateLimit(normalizedEmail);
    if (!rateCheck.allowed) {
      await recordAuditLog({
        actorEmail: normalizedEmail,
        action: "RATE_LIMIT_EXCEEDED",
        resourceType: "AUTH",
        resourceName: normalizedEmail,
        outcome: "DENIED",
        reason: `Login rate limit exceeded. Retry after ${rateCheck.retryAfterSeconds}s`,
        req,
      });

      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
          retryAfter: rateCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // 2. Lookup user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        restaurants: {
          take: 1,
          select: { restaurantId: true, role: true },
        },
      },
    });

    // Check account status: if deactivated or suspended
    if (user && (!user.isActive || user.suspendedAt)) {
      await recordAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        action: "AUTH_LOGIN_FAILED",
        resourceType: "AUTH",
        resourceId: user.id,
        resourceName: user.email,
        outcome: "DENIED",
        reason: user.suspendedReason || "User account is suspended or inactive",
        req,
      });

      return NextResponse.json(
        {
          error: "Your user account is suspended or deactivated. Please contact support.",
          code: "USER_SUSPENDED",
          reason: user.suspendedReason || "Account suspended",
        },
        { status: 403 }
      );
    }

    // 3. Verify password
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await recordAuditLog({
        actorEmail: normalizedEmail,
        action: "AUTH_LOGIN_FAILED",
        resourceType: "AUTH",
        resourceName: normalizedEmail,
        outcome: "FAILURE",
        reason: "Invalid email or password",
        req,
      });

      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Reset rate limiter upon successful authentication
    resetRateLimit(`login:${normalizedEmail}`);

    // Create secure HTTP-only session
    await createSession({ userId: user.id, email: user.email });

    const primaryMembership = user.restaurants[0];
    const defaultTarget = user.isSuperAdmin ? "/super-admin" : "/dashboard";
    const finalRedirect = callbackUrl
      ? getSafeRedirectUrl(callbackUrl, defaultTarget)
      : defaultTarget;

    // Record Audit Event for Successful Login
    await recordAuditLog({
      restaurantId: primaryMembership?.restaurantId || null,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole: user.isSuperAdmin ? "SUPER_ADMIN" : primaryMembership?.role || "USER",
      action: "AUTH_LOGIN_SUCCESS",
      resourceType: "AUTH",
      resourceId: user.id,
      resourceName: user.email,
      outcome: "SUCCESS",
      metadata: {
        isSuperAdmin: user.isSuperAdmin,
        redirectTo: finalRedirect,
      },
      req,
    });

    return NextResponse.json(
      {
        message: "Login successful.",
        redirectTo: finalRedirect,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error. Please try again later." },
      { status: 500 }
    );
  }
}
