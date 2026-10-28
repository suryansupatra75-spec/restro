import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin-guard";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET() {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalRestaurants,
      activeRestaurants,
      suspendedRestaurants,
      inactiveRestaurants,
      totalUsers,
      activeUsers,
      disabledUsers,
      superAdminUsers,
      restaurantOwnersCount,
      staffMembershipsCount,
      totalCustomersCount,
      totalOrders,
      completedOrders,
      activeOrders,
      cancelledOrRejectedOrders,
      paidOrdersAggregate,
      ordersLast24h,
      ordersLast7d,
      recentRestaurantsRaw,
      recentUsersRaw,
      recentAuditLogsRaw,
    ] = await Promise.all([
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: { status: "ACTIVE" } }),
      prisma.restaurant.count({ where: { status: "SUSPENDED" } }),
      prisma.restaurant.count({ where: { status: "INACTIVE" } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { isSuperAdmin: true } }),
      prisma.restaurantUser.count({ where: { role: "OWNER" } }),
      prisma.restaurantUser.count(),
      prisma.customer.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: "COMPLETED" } }),
      prisma.order.count({
        where: { status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] } },
      }),
      prisma.order.count({
        where: { status: { in: ["CANCELLED", "REJECTED"] } },
      }),
      prisma.order.aggregate({
        where: { paymentStatus: "PAID" },
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.order.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.order.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.restaurant.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          suspendedReason: true,
          city: true,
          currency: true,
          isOrderingEnabled: true,
          createdAt: true,
          users: {
            where: { role: "OWNER" },
            take: 1,
            select: {
              user: {
                select: { id: true, name: true, email: true, isActive: true },
              },
            },
          },
          _count: {
            select: {
              orders: true,
              menuItems: true,
              tables: true,
              users: true,
            },
          },
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          isSuperAdmin: true,
          createdAt: true,
          restaurants: {
            select: {
              role: true,
              status: true,
              restaurant: {
                select: { id: true, name: true, slug: true, status: true },
              },
            },
          },
        },
      }),
      prisma.platformAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const recentRestaurants = recentRestaurantsRaw.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      suspendedReason: r.suspendedReason,
      city: r.city,
      currency: r.currency,
      isOrderingEnabled: r.isOrderingEnabled,
      createdAt: r.createdAt.toISOString(),
      owner: r.users[0]?.user ?? null,
      counts: {
        orders: r._count.orders,
        menuItems: r._count.menuItems,
        tables: r._count.tables,
        staff: r._count.users,
      },
    }));

    const recentUsers = recentUsersRaw.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      isSuperAdmin: u.isSuperAdmin,
      createdAt: u.createdAt.toISOString(),
      memberships: u.restaurants.map((m) => ({
        role: m.role,
        status: m.status,
        restaurantId: m.restaurant.id,
        restaurantName: m.restaurant.name,
        restaurantSlug: m.restaurant.slug,
        restaurantStatus: m.restaurant.status,
      })),
    }));

    const recentAuditLogs = recentAuditLogsRaw.map((log) => ({
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
    }));

    return NextResponse.json(
      {
        metrics: {
          restaurants: {
            total: totalRestaurants,
            active: activeRestaurants,
            suspended: suspendedRestaurants,
            inactive: inactiveRestaurants,
          },
          users: {
            total: totalUsers,
            active: activeUsers,
            disabled: disabledUsers,
            superAdmins: superAdminUsers,
            restaurantOwners: restaurantOwnersCount,
            totalStaffMemberships: staffMembershipsCount,
            totalCustomers: totalCustomersCount,
          },
          orders: {
            total: totalOrders,
            completed: completedOrders,
            active: activeOrders,
            cancelledOrRejected: cancelledOrRejectedOrders,
            paidOrdersCount: paidOrdersAggregate._count.id || 0,
            paidGrossVolume: Number(paidOrdersAggregate._sum.total ?? 0),
            last24h: ordersLast24h,
            last7d: ordersLast7d,
          },
        },
        recentRestaurants,
        recentUsers,
        recentAuditLogs,
        systemStatus: {
          databaseConnected: true,
          timestamp: now.toISOString(),
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/super-admin/overview error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
