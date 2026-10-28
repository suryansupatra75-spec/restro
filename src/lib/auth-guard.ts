import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, Permission, StaffRole } from "@/lib/permissions";
import { Restaurant, RestaurantUser, User } from "@prisma/client";

export interface AuthenticatedContext {
  user: User;
  membership: RestaurantUser;
  restaurant: Restaurant;
  restaurantId: string;
  role: StaffRole;
}

/**
 * Robust server-side authorization guard.
 * Extracts authenticated user, resolves target restaurant, verifies tenant membership,
 * checks account status (blocking DISABLED staff), and validates role permissions.
 */
export async function requireAuthMember(
  req?: NextRequest,
  requiredPermission?: Permission
): Promise<
  | { errorResponse: NextResponse; context: null }
  | { errorResponse: null; context: AuthenticatedContext }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      context: null,
    };
  }

  // Account Security: Block DEACTIVATED or SUSPENDED user accounts
  if (!user.isActive || user.suspendedAt) {
    return {
      errorResponse: NextResponse.json(
        {
          error: "Your user account is suspended or inactive. Please contact platform support.",
          code: "USER_SUSPENDED",
          reason: user.suspendedReason || "Account suspended",
        },
        { status: 403 }
      ),
      context: null,
    };
  }

  if (!user.restaurants || user.restaurants.length === 0) {
    return {
      errorResponse: NextResponse.json(
        { error: "No restaurant membership found" },
        { status: 403 }
      ),
      context: null,
    };
  }

  // Determine target restaurantId
  let targetRestaurantId: string | null = null;
  if (req) {
    const url = new URL(req.url);
    targetRestaurantId = url.searchParams.get("restaurantId") || req.headers.get("x-restaurant-id");
  }

  const membership = targetRestaurantId
    ? user.restaurants.find((r) => r.restaurantId === targetRestaurantId)
    : user.restaurants[0];

  if (!membership) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: You are not a member of this restaurant" },
        { status: 403 }
      ),
      context: null,
    };
  }

  // Session Security: Block DISABLED staff accounts
  if (membership.status === "DISABLED") {
    return {
      errorResponse: NextResponse.json(
        { error: "Your staff membership is disabled. Please contact your restaurant administrator." },
        { status: 403 }
      ),
      context: null,
    };
  }

  // Tenant Status Security: Block SUSPENDED or INACTIVE restaurants
  if (membership.restaurant.status === "SUSPENDED" || membership.restaurant.status === "INACTIVE") {
    return {
      errorResponse: NextResponse.json(
        {
          error: "This restaurant account is currently suspended or inactive. Please contact platform support.",
          code: "RESTAURANT_SUSPENDED",
        },
        { status: 403 }
      ),
      context: null,
    };
  }

  // Permission Check
  if (requiredPermission && !hasPermission(membership.role, requiredPermission)) {
    return {
      errorResponse: NextResponse.json(
        { error: `Forbidden: Insufficient permissions (${requiredPermission})` },
        { status: 403 }
      ),
      context: null,
    };
  }

  return {
    errorResponse: null,
    context: {
      user: user as unknown as User,
      membership: membership as unknown as RestaurantUser,
      restaurant: membership.restaurant as unknown as Restaurant,
      restaurantId: membership.restaurantId,
      role: membership.role as StaffRole,
    },
  };
}

/**
 * Record a security & operational staff audit event.
 */
export async function logStaffAudit({
  restaurantId,
  actorId,
  targetUserId,
  action,
  details,
}: {
  restaurantId: string;
  actorId: string;
  targetUserId?: string | null;
  action: string;
  details?: Record<string, unknown> | string;
}) {
  try {
    await prisma.staffAuditLog.create({
      data: {
        restaurantId,
        actorId,
        targetUserId: targetUserId || null,
        action,
        details: typeof details === "object" ? JSON.stringify(details) : details || null,
      },
    });
  } catch (err) {
    console.error("Failed to record staff audit log:", err);
  }
}
