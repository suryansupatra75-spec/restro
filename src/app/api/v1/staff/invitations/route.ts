import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember, logStaffAudit } from "@/lib/auth-guard";
import { inviteStaffSchema } from "@/lib/validations/staff";
import { canAssignRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { notifyStaffAccessChanged } from "@/lib/notifications/service";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";
import { recordAuditLog } from "@/lib/audit/service";

export async function POST(req: NextRequest) {
  try {
    let rawBody = "";
    try {
      rawBody = await req.text();
    } catch {
      // Stream drain safe
    }

    const { errorResponse, context } = await requireAuthMember(req, "staff.invite");
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role: actorRole } = context;

    let body: any = {};
    if (rawBody && rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }
    }

    const parsed = inviteStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid invitation payload" },
        { status: 400 }
      );
    }

    const { email, role: targetRole } = parsed.data;

    // Security Check: Role assignment hierarchy (Owner Protection & Manager boundary)
    if (!canAssignRole(actorRole, targetRole)) {
      return NextResponse.json(
        { error: `Your role (${actorRole}) cannot assign or invite a ${targetRole}` },
        { status: 403 }
      );
    }

    // Check if email is already an active member in this restaurant
    const existingMember = await prisma.restaurantUser.findFirst({
      where: {
        restaurantId,
        user: { email },
      },
      include: { user: true },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: `User with email ${email} is already a ${existingMember.role} in this restaurant` },
        { status: 400 }
      );
    }

    // Cancel any previous pending unexpired invitations for this email in this restaurant
    await prisma.staffInvitation.updateMany({
      where: {
        restaurantId,
        email,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Server-side SaaS Plan Limit & Subscription Status Enforcement
    await assertEntitlement(restaurantId, "ADD_STAFF_INVITE");

    // Generate cryptographic token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.staffInvitation.create({
      data: {
        restaurantId,
        email,
        role: targetRole,
        token,
        status: "PENDING",
        invitedById: user.id,
        expiresAt,
      },
    });

    // Write audit log
    await logStaffAudit({
      restaurantId,
      actorId: user.id,
      action: "STAFF_INVITED",
      details: {
        invitedEmail: email,
        assignedRole: targetRole,
        invitationId: invitation.id,
      },
    });

    await recordAuditLog({
      restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole,
      action: "STAFF_INVITED",
      resourceType: "STAFF",
      resourceId: invitation.id,
      resourceName: email,
      outcome: "SUCCESS",
      metadata: {
        invitedEmail: email,
        assignedRole: targetRole,
      },
      req,
    });

    await notifyStaffAccessChanged({
      restaurantId,
      action: "STAFF_INVITED",
      targetIdentifier: email,
      role: targetRole,
      entityId: invitation.id,
      dedupeSuffix: invitation.id,
    });

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const inviteUrl = `${protocol}://${host}/invite/${token}`;

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
      inviteUrl,
    });
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST_INVITATION_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
