import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin-guard";
import { restaurantDirectoryQuerySchema } from "@/lib/validations/super-admin";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = restaurantDirectoryQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { search, status, sortBy, sortOrder, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where: Prisma.RestaurantWhereInput = {};

    if (status !== "ALL") {
      where.status = status;
    }

    if (search.length > 0) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { city: { contains: search } },
        {
          users: {
            some: {
              user: {
                OR: [
                  { name: { contains: search } },
                  { email: { contains: search } },
                ],
              },
            },
          },
        },
      ];
    }

    let orderBy: Prisma.RestaurantOrderByWithRelationInput = {
      createdAt: sortOrder,
    };
    if (sortBy === "name") {
      orderBy = { name: sortOrder };
    } else if (sortBy === "status") {
      orderBy = { status: sortOrder };
    } else if (sortBy === "ordersCount") {
      orderBy = { orders: { _count: sortOrder } };
    }

    const [
      totalMatching,
      restaurantsRaw,
      totalAll,
      activeCount,
      suspendedCount,
      inactiveCount,
    ] = await Promise.all([
      prisma.restaurant.count({ where }),
      prisma.restaurant.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          suspendedReason: true,
          suspendedAt: true,
          email: true,
          phone: true,
          city: true,
          country: true,
          currency: true,
          isOrderingEnabled: true,
          createdAt: true,
          updatedAt: true,
          users: {
            where: { role: "OWNER" },
            take: 1,
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: {
              orders: true,
              menuItems: true,
              tables: true,
              users: true,
              customers: true,
            },
          },
        },
      }),
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: { status: "ACTIVE" } }),
      prisma.restaurant.count({ where: { status: "SUSPENDED" } }),
      prisma.restaurant.count({ where: { status: "INACTIVE" } }),
    ]);

    // Aggregate paid revenue for returned restaurants in a single groupBy query
    const restaurantIds = restaurantsRaw.map((r) => r.id);
    const revenueByRestaurant =
      restaurantIds.length > 0
        ? await prisma.order.groupBy({
            by: ["restaurantId"],
            where: {
              restaurantId: { in: restaurantIds },
              paymentStatus: "PAID",
            },
            _sum: { total: true },
          })
        : [];

    const revenueMap = new Map<string, number>();
    for (const row of revenueByRestaurant) {
      revenueMap.set(row.restaurantId, Number(row._sum.total ?? 0));
    }

    const restaurants = restaurantsRaw.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      suspendedReason: r.suspendedReason,
      suspendedAt: r.suspendedAt ? r.suspendedAt.toISOString() : null,
      email: r.email,
      phone: r.phone,
      city: r.city,
      country: r.country,
      currency: r.currency,
      isOrderingEnabled: r.isOrderingEnabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      owner: r.users[0]?.user ?? null,
      counts: {
        orders: r._count.orders,
        menuItems: r._count.menuItems,
        tables: r._count.tables,
        staff: r._count.users,
        customers: r._count.customers,
      },
      paidRevenue: revenueMap.get(r.id) ?? 0,
    }));

    return NextResponse.json(
      {
        restaurants,
        pagination: {
          page,
          limit,
          total: totalMatching,
          totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
        },
        summary: {
          total: totalAll,
          active: activeCount,
          suspended: suspendedCount,
          inactive: inactiveCount,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/super-admin/restaurants error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
