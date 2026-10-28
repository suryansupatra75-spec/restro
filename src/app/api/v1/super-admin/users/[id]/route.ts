import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin-guard";
import {
  uuidParamSchema,
  updatePlatformUserSchema,
} from "@/lib/validations/super-admin";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const { id } = await props.params;
    const idCheck = uuidParamSchema.safeParse(id);
    if (!idCheck.success) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Strictly select safe fields — NEVER select passwordHash
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        isSuperAdmin: true,
        suspendedReason: true,
        suspendedAt: true,
        createdAt: true,
        updatedAt: true,
        restaurants: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            restaurant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                city: true,
                currency: true,
                isOrderingEnabled: true,
                createdAt: true,
                _count: {
                  select: {
                    orders: true,
                    menuItems: true,
                    tables: true,
                    users: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const [platformAuditLogsRaw, staffAuditLogsRaw, activeSuperAdminCount] =
      await Promise.all([
        prisma.platformAuditLog.findMany({
          where: {
            OR: [
              { targetType: "USER", targetId: id },
              { actorId: id },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.staffAuditLog.findMany({
          where: {
            OR: [{ actorId: id }, { targetUserId: id }],
          },
          orderBy: { createdAt: "desc" },
          take: 15,
          include: {
            restaurant: {
              select: { id: true, name: true, slug: true },
            },
          },
        }),
        prisma.user.count({
          where: { isSuperAdmin: true, isActive: true },
        }),
      ]);

    const isLastActiveSuperAdmin =
      user.isSuperAdmin && user.isActive && activeSuperAdminCount <= 1;

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          isSuperAdmin: user.isSuperAdmin,
          isLastActiveSuperAdmin,
          suspendedReason: user.suspendedReason,
          suspendedAt: user.suspendedAt
            ? user.suspendedAt.toISOString()
            : null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          memberships: user.restaurants.map((m) => ({
            membershipId: m.id,
            role: m.role,
            membershipStatus: m.status,
            joinedAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
            restaurant: {
              id: m.restaurant.id,
              name: m.restaurant.name,
              slug: m.restaurant.slug,
              status: m.restaurant.status,
              city: m.restaurant.city,
              currency: m.restaurant.currency,
              isOrderingEnabled: m.restaurant.isOrderingEnabled,
              createdAt: m.restaurant.createdAt.toISOString(),
              counts: {
                orders: m.restaurant._count.orders,
                menuItems: m.restaurant._count.menuItems,
                tables: m.restaurant._count.tables,
                staff: m.restaurant._count.users,
              },
            },
          })),
          platformAuditLogs: platformAuditLogsRaw.map((log) => ({
            id: log.id,
            actorId: log.actorId,
            actorEmail: log.actorEmail,
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            targetLabel: log.targetLabel,
            reason: log.reason,
            metadata: log.metadata ? JSON.parse(log.metadata) : null,
            createdAt: log.createdAt.toISOString(),
          })),
          staffAuditLogs: staffAuditLogsRaw.map((log) => ({
            id: log.id,
            restaurantId: log.restaurantId,
            restaurantName: log.restaurant.name,
            actorId: log.actorId,
            targetUserId: log.targetUserId,
            action: log.action,
            details: log.details,
            createdAt: log.createdAt.toISOString(),
          })),
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/super-admin/users/[id] error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;
    const actor = auth.actor;

    const { id } = await props.params;
    const idCheck = uuidParamSchema.safeParse(id);
    if (!idCheck.success) {
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = updatePlatformUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid request payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { isActive, isSuperAdmin, reason } = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSuperAdmin: true,
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const nextIsActive = isActive !== undefined ? isActive : target.isActive;
    const nextIsSuperAdmin =
      isSuperAdmin !== undefined ? isSuperAdmin : target.isSuperAdmin;

    // 1. Self-lockout protection: a Super Admin cannot disable themselves or revoke their own Super Admin access
    if (target.id === actor.id) {
      if (!nextIsActive) {
        return NextResponse.json(
          {
            error: "You cannot deactivate your own Super Admin account.",
            code: "SELF_LOCKOUT_PREVENTED",
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (!nextIsSuperAdmin) {
        return NextResponse.json(
          {
            error: "You cannot revoke Super Admin privileges from your own account.",
            code: "SELF_LOCKOUT_PREVENTED",
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    // 2. Last-Super-Admin protection: ensure at least 1 active Super Admin remains on the platform
    const wasActiveSuperAdmin = target.isSuperAdmin && target.isActive;
    const willBeActiveSuperAdmin = nextIsSuperAdmin && nextIsActive;

    if (wasActiveSuperAdmin && !willBeActiveSuperAdmin) {
      const remainingActiveSuperAdmins = await prisma.user.count({
        where: {
          isSuperAdmin: true,
          isActive: true,
          id: { not: target.id },
        },
      });

      if (remainingActiveSuperAdmins < 1) {
        return NextResponse.json(
          {
            error:
              "Cannot remove or deactivate the last active Super Admin account on the platform.",
            code: "LAST_SUPER_ADMIN_PROTECTED",
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const now = new Date();
    let actionLabel = "USER_PLATFORM_UPDATED";
    if (isActive !== undefined && isActive !== target.isActive) {
      actionLabel = isActive ? "USER_ACCOUNT_ENABLED" : "USER_ACCOUNT_DISABLED";
    } else if (
      isSuperAdmin !== undefined &&
      isSuperAdmin !== target.isSuperAdmin
    ) {
      actionLabel = isSuperAdmin
        ? "SUPER_ADMIN_GRANTED"
        : "SUPER_ADMIN_REVOKED";
    }

    const [updatedUser, auditEntry] = await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: {
          isActive: nextIsActive,
          isSuperAdmin: nextIsSuperAdmin,
          suspendedReason: nextIsActive ? null : reason,
          suspendedAt: nextIsActive ? null : now,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          isSuperAdmin: true,
          suspendedReason: true,
          suspendedAt: true,
          updatedAt: true,
        },
      }),
      prisma.platformAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: actionLabel,
          targetType: "USER",
          targetId: target.id,
          targetLabel: target.email,
          reason,
          metadata: JSON.stringify({
            previousIsActive: target.isActive,
            newIsActive: nextIsActive,
            previousIsSuperAdmin: target.isSuperAdmin,
            newIsSuperAdmin: nextIsSuperAdmin,
          }),
        },
      }),
    ]);

    return NextResponse.json(
      {
        message: "User account updated successfully",
        user: {
          ...updatedUser,
          suspendedAt: updatedUser.suspendedAt
            ? updatedUser.suspendedAt.toISOString()
            : null,
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
        auditLog: {
          id: auditEntry.id,
          action: auditEntry.action,
          reason: auditEntry.reason,
          createdAt: auditEntry.createdAt.toISOString(),
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("PATCH /api/v1/super-admin/users/[id] error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
