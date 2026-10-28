import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, getCurrentUser } from "@/lib/auth";
import { logStaffAudit } from "@/lib/auth-guard";
import { acceptInvitationSchema } from "@/lib/validations/staff";
import bcrypt from "bcryptjs";
import { notifyStaffAccessChanged } from "@/lib/notifications/service";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = acceptInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { token, name, password } = parsed.data;

    // Retrieve invitation
    const invitation = await prisma.staffInvitation.findUnique({
      where: { token },
      include: { restaurant: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
    }

    if (invitation.status === "ACCEPTED") {
      return NextResponse.json({ error: "This invitation has already been accepted" }, { status: 400 });
    }

    if (invitation.status === "CANCELLED") {
      return NextResponse.json({ error: "This invitation was cancelled by the restaurant" }, { status: 400 });
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 400 });
    }

    // Server-side SaaS Plan Limit & Subscription Status Enforcement
    await assertEntitlement(invitation.restaurantId, "ACCEPT_STAFF_INVITE");

    // Resolve or create user account
    let targetUser = await getCurrentUser();

    if (!targetUser) {
      // Not logged in: check if account exists with invitation email
      const existingUser = await prisma.user.findUnique({
        where: { email: invitation.email },
      });

      if (existingUser) {
        if (!password) {
          return NextResponse.json(
            { error: "Account exists. Please provide your password to accept this invitation." },
            { status: 400 }
          );
        }
        const isValid = await bcrypt.compare(password, existingUser.passwordHash);
        if (!isValid) {
          return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
        }
        targetUser = existingUser as unknown as typeof targetUser;
      } else {
        // Create new account
        if (!name || name.trim().length < 2) {
          return NextResponse.json({ error: "Name is required (at least 2 characters)" }, { status: 400 });
        }
        if (!password || password.length < 6) {
          return NextResponse.json({ error: "Password is required (at least 6 characters)" }, { status: 400 });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
          data: {
            name: name.trim(),
            email: invitation.email,
            passwordHash,
          },
        });
        targetUser = newUser as unknown as typeof targetUser;
      }
    }

    if (!targetUser) {
      return NextResponse.json({ error: "Failed to resolve user account" }, { status: 500 });
    }

    // Check if membership already exists in this restaurant
    const existingMembership = await prisma.restaurantUser.findFirst({
      where: {
        restaurantId: invitation.restaurantId,
        userId: targetUser.id,
      },
    });

    if (existingMembership) {
      // If already owner, do not downgrade
      if (existingMembership.role === "OWNER") {
        return NextResponse.json(
          { error: "You are already the owner of this restaurant" },
          { status: 400 }
        );
      }
      // Update role and activate
      await prisma.restaurantUser.update({
        where: { id: existingMembership.id },
        data: {
          role: invitation.role,
          status: "ACTIVE",
        },
      });
    } else {
      // Create new membership
      await prisma.restaurantUser.create({
        data: {
          restaurantId: invitation.restaurantId,
          userId: targetUser.id,
          role: invitation.role,
          status: "ACTIVE",
        },
      });
    }

    // Invalidate single-use invitation
    await prisma.staffInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });

    // Establish authenticated session
    await createSession({ userId: targetUser.id, email: targetUser.email });

    // Write audit log
    await logStaffAudit({
      restaurantId: invitation.restaurantId,
      actorId: targetUser.id,
      targetUserId: targetUser.id,
      action: "INVITATION_ACCEPTED",
      details: {
        acceptedEmail: targetUser.email,
        assignedRole: invitation.role,
        invitationId: invitation.id,
      },
    });

    await notifyStaffAccessChanged({
      restaurantId: invitation.restaurantId,
      action: "INVITATION_ACCEPTED",
      targetIdentifier: targetUser.name || targetUser.email,
      role: invitation.role,
      entityId: invitation.id,
      dedupeSuffix: "accepted",
    });

    return NextResponse.json({
      success: true,
      message: `Welcome to ${invitation.restaurant.name}!`,
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("ACCEPT_INVITATION_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
