import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin-guard";
import {
  uuidParamSchema,
  updateRestaurantStatusSchema,
} from "@/lib/validations/super-admin";
import { parseClosedDays } from "@/lib/validations/settings";

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
        { error: "Invalid restaurant ID format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: {
        users: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isActive: true,
                isSuperAdmin: true,
                createdAt: true,
              },
            },
          },
        },
        _count: {
          select: {
            categories: true,
            menuItems: true,
            tables: true,
            qrCodes: true,
            orders: true,
            customers: true,
            inventoryItems: true,
          },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const [
      completedOrdersCount,
      activeOrdersCount,
      cancelledOrRejectedOrdersCount,
      paidRevenueAgg,
      availableItemsCount,
      activeQrCodesCount,
      lowStockItemsCount,
      recentOrdersRaw,
      auditLogsRaw,
    ] = await Promise.all([
      prisma.order.count({
        where: { restaurantId: id, status: "COMPLETED" },
      }),
      prisma.order.count({
        where: {
          restaurantId: id,
          status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] },
        },
      }),
      prisma.order.count({
        where: {
          restaurantId: id,
          status: { in: ["CANCELLED", "REJECTED"] },
        },
      }),
      prisma.order.aggregate({
        where: { restaurantId: id, paymentStatus: "PAID" },
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.menuItem.count({
        where: { restaurantId: id, status: "ACTIVE", isAvailable: true },
      }),
      prisma.qRCode.count({
        where: { restaurantId: id, status: "ACTIVE" },
      }),
      prisma.inventoryItem.count({
        where: {
          restaurantId: id,
          isActive: true,
          currentStock: { lte: 5 },
        },
      }),
      prisma.order.findMany({
        where: { restaurantId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          subtotal: true,
          tax: true,
          total: true,
          createdAt: true,
          table: {
            select: { id: true, name: true, number: true },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      prisma.platformAuditLog.findMany({
        where: { targetType: "RESTAURANT", targetId: id },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    const ownerMember =
      restaurant.users.find((m) => m.role === "OWNER") ?? null;

    return NextResponse.json(
      {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          description: restaurant.description,
          logoUrl: restaurant.logoUrl,
          coverImageUrl: restaurant.coverImageUrl,
          phone: restaurant.phone,
          email: restaurant.email,
          address: restaurant.address,
          city: restaurant.city,
          country: restaurant.country,
          currency: restaurant.currency,
          taxPercentage: Number(restaurant.taxPercentage ?? 0),
          accentColor: restaurant.accentColor,
          isOrderingEnabled: restaurant.isOrderingEnabled,
          allowSpecialInstructions: restaurant.allowSpecialInstructions,
          customerNotice: restaurant.customerNotice,
          openingTime: restaurant.openingTime,
          closingTime: restaurant.closingTime,
          closedDays: parseClosedDays(restaurant.closedDays),
          status: restaurant.status,
          suspendedReason: restaurant.suspendedReason,
          suspendedAt: restaurant.suspendedAt
            ? restaurant.suspendedAt.toISOString()
            : null,
          createdAt: restaurant.createdAt.toISOString(),
          updatedAt: restaurant.updatedAt.toISOString(),
          owner: ownerMember ? ownerMember.user : null,
          members: restaurant.users.map((m) => ({
            membershipId: m.id,
            role: m.role,
            status: m.status,
            joinedAt: m.createdAt.toISOString(),
            user: {
              id: m.user.id,
              name: m.user.name,
              email: m.user.email,
              phone: m.user.phone,
              isActive: m.user.isActive,
              isSuperAdmin: m.user.isSuperAdmin,
              createdAt: m.user.createdAt.toISOString(),
            },
          })),
          metrics: {
            totalOrders: restaurant._count.orders,
            completedOrders: completedOrdersCount,
            activeOrders: activeOrdersCount,
            cancelledOrRejectedOrders: cancelledOrRejectedOrdersCount,
            paidOrdersCount: paidRevenueAgg._count.id || 0,
            paidRevenue: Number(paidRevenueAgg._sum.total ?? 0),
            categoriesCount: restaurant._count.categories,
            menuItemsCount: restaurant._count.menuItems,
            availableItemsCount,
            tablesCount: restaurant._count.tables,
            qrCodesCount: restaurant._count.qrCodes,
            activeQrCodesCount,
            customersCount: restaurant._count.customers,
            inventoryItemsCount: restaurant._count.inventoryItems,
            lowStockItemsCount,
            staffCount: restaurant.users.length,
          },
          recentOrders: recentOrdersRaw.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            paymentStatus: o.paymentStatus,
            subtotal: Number(o.subtotal),
            tax: Number(o.tax),
            total: Number(o.total),
            itemCount: o._count.items,
            tableName: o.table?.name ?? `Table #${o.table?.number ?? "?"}`,
            createdAt: o.createdAt.toISOString(),
          })),
          auditLogs: auditLogsRaw.map((log) => ({
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
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/super-admin/restaurants/[id] error:", error);
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
        { error: "Invalid restaurant ID format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = updateRestaurantStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid request payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { status: newStatus, reason } = parsed.data;

    const existing = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        suspendedReason: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const isActivating = newStatus === "ACTIVE";
    const now = new Date();

    const [updatedRestaurant, auditEntry] = await prisma.$transaction([
      prisma.restaurant.update({
        where: { id },
        data: {
          status: newStatus,
          suspendedReason: isActivating ? null : reason,
          suspendedAt: isActivating ? null : now,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          suspendedReason: true,
          suspendedAt: true,
          updatedAt: true,
        },
      }),
      prisma.platformAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action: "RESTAURANT_STATUS_CHANGED",
          targetType: "RESTAURANT",
          targetId: existing.id,
          targetLabel: existing.name,
          reason,
          metadata: JSON.stringify({
            previousStatus: existing.status,
            newStatus,
            slug: existing.slug,
          }),
        },
      }),
    ]);

    return NextResponse.json(
      {
        message: `Restaurant status updated to ${newStatus}`,
        restaurant: {
          ...updatedRestaurant,
          suspendedAt: updatedRestaurant.suspendedAt
            ? updatedRestaurant.suspendedAt.toISOString()
            : null,
          updatedAt: updatedRestaurant.updatedAt.toISOString(),
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
    console.error("PATCH /api/v1/super-admin/restaurants/[id] error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
