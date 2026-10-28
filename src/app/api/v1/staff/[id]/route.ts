import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember, logStaffAudit } from "@/lib/auth-guard";
import { updateStaffSchema } from "@/lib/validations/staff";
import { canAssignRole, canManageTargetRole } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { notifyStaffAccessChanged } from "@/lib/notifications/service";
import { recordAuditLog } from "@/lib/audit/service";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    let rawBody = "";
    try {
      rawBody = await req.text();
    } catch {
      // Stream drain safe
    }

    const { errorResponse, context } = await requireAuthMember(req, "staff.update");
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role: actorRole } = context;
    const { id: targetMembershipId } = await props.params;

    // Multi-tenant check: Target must belong to caller's restaurant
    const targetMember = await prisma.restaurantUser.findFirst({
      where: {
        id: targetMembershipId,
        restaurantId,
      },
      include: { user: true },
    });

    if (!targetMember) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    // Owner Protection: Owner cannot be modified or disabled
    if (targetMember.role === "OWNER") {
      return NextResponse.json(
        { error: "Restaurant owner cannot be modified or disabled" },
        { status: 403 }
      );
    }

    // Self-Escalation Protection: Caller cannot modify their own role or status
    if (targetMember.userId === user.id) {
      return NextResponse.json(
        { error: "You cannot modify your own staff membership or permissions" },
        { status: 403 }
      );
    }

    let body: any = {};
    if (rawBody && rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }
    }

    const parsed = updateStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    const { role: newRole, status: newStatus } = parsed.data;

    // Hierarchy Enforcement: Can actor manage this target?
    if (!canManageTargetRole(actorRole, targetMember.role)) {
      return NextResponse.json(
        { error: `Your role (${actorRole}) cannot modify a ${targetMember.role}` },
        { status: 403 }
      );
    }

    // If changing role: verify actor is authorized to assign this new role
    if (newRole && newRole !== targetMember.role) {
      if (!canAssignRole(actorRole, newRole)) {
        return NextResponse.json(
          { error: `Your role (${actorRole}) cannot assign the ${newRole} role` },
          { status: 403 }
        );
      }
    }

    // Perform database update
    const updateData: { role?: string; status?: string } = {};
    if (newRole) updateData.role = newRole;
    if (newStatus) updateData.status = newStatus;

    const updated = await prisma.restaurantUser.update({
      where: { id: targetMember.id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Write audit logs
    if (newRole && newRole !== targetMember.role) {
      await logStaffAudit({
        restaurantId,
        actorId: user.id,
        targetUserId: targetMember.userId,
        action: "ROLE_CHANGED",
        details: {
          previousRole: targetMember.role,
          newRole: updated.role,
        },
      });

      await notifyStaffAccessChanged({
        restaurantId,
        action: "ROLE_CHANGED",
        targetIdentifier: targetMember.user.name || targetMember.user.email,
        role: updated.role,
        entityId: targetMember.id,
        dedupeSuffix: `${targetMember.role}_to_${updated.role}_${Date.now()}`,
      });

      await recordAuditLog({
        restaurantId,
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        actorRole,
        action: "ROLE_CHANGED",
        resourceType: "STAFF",
        resourceId: targetMember.userId,
        resourceName: targetMember.user.name || targetMember.user.email,
        outcome: "SUCCESS",
        metadata: {
          previousRole: targetMember.role,
          newRole: updated.role,
        },
        req,
      });
    }

    if (newStatus && newStatus !== targetMember.status) {
      const statusAction = newStatus === "DISABLED" ? "STAFF_DISABLED" : "STAFF_ENABLED";
      await logStaffAudit({
        restaurantId,
        actorId: user.id,
        targetUserId: targetMember.userId,
        action: statusAction,
        details: {
          previousStatus: targetMember.status,
          newStatus: updated.status,
        },
      });

      await notifyStaffAccessChanged({
        restaurantId,
        action: statusAction,
        targetIdentifier: targetMember.user.name || targetMember.user.email,
        role: updated.role,
        entityId: targetMember.id,
        dedupeSuffix: `${statusAction}_${Date.now()}`,
      });

      await recordAuditLog({
        restaurantId,
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        actorRole,
        action: statusAction,
        resourceType: "STAFF",
        resourceId: targetMember.userId,
        resourceName: targetMember.user.name || targetMember.user.email,
        outcome: "SUCCESS",
        metadata: {
          previousStatus: targetMember.status,
          newStatus: updated.status,
        },
        req,
      });
    }

    return NextResponse.json({
      success: true,
      member: updated,
    });
  } catch (error) {
    console.error("PATCH_STAFF_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    try { await req.text(); } catch {}

    const { errorResponse, context } = await requireAuthMember(req, "staff.remove");
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role: actorRole } = context;
    const { id: targetMembershipId } = await props.params;

    // Multi-tenant check: Target must belong to caller's restaurant
    const targetMember = await prisma.restaurantUser.findFirst({
      where: {
        id: targetMembershipId,
        restaurantId,
      },
      include: { user: true },
    });

    if (!targetMember) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    // Owner Protection: Owner cannot be removed
    if (targetMember.role === "OWNER") {
      return NextResponse.json(
        { error: "Restaurant owner cannot be removed" },
        { status: 403 }
      );
    }

    // Self-Removal Protection: Cannot remove self via staff management
    if (targetMember.userId === user.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself from staff management" },
        { status: 400 }
      );
    }

    // Hierarchy Enforcement: Manager cannot remove Manager or Owner
    if (!canManageTargetRole(actorRole, targetMember.role)) {
      return NextResponse.json(
        { error: `Your role (${actorRole}) cannot remove a ${targetMember.role}` },
        { status: 403 }
      );
    }

    // Safe membership deletion (User account remains preserved)
    await prisma.restaurantUser.delete({
      where: { id: targetMember.id },
    });

    // Write audit log
    await logStaffAudit({
      restaurantId,
      actorId: user.id,
      targetUserId: targetMember.userId,
      action: "STAFF_REMOVED",
      details: {
        removedUserEmail: targetMember.user.email,
        removedRole: targetMember.role,
      },
    });

    await recordAuditLog({
      restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole,
      action: "STAFF_REMOVED",
      resourceType: "STAFF",
      resourceId: targetMember.userId,
      resourceName: targetMember.user.name || targetMember.user.email,
      outcome: "SUCCESS",
      metadata: {
        removedUserEmail: targetMember.user.email,
        removedRole: targetMember.role,
      },
      req,
    });

    await notifyStaffAccessChanged({
      restaurantId,
      action: "STAFF_REMOVED",
      targetIdentifier: targetMember.user.name || targetMember.user.email,
      role: targetMember.role,
      entityId: targetMember.id,
      dedupeSuffix: `removed_${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      message: `Staff member ${targetMember.user.name} removed successfully`,
    });
  } catch (error) {
    console.error("DELETE_STAFF_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
