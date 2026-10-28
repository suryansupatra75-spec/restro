import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin-guard";
import { userDirectoryQuerySchema } from "@/lib/validations/super-admin";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = userDirectoryQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { search, role, status, sortBy, sortOrder, page, limit } =
      parsed.data;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (status === "ACTIVE") {
      where.isActive = true;
    } else if (status === "DISABLED") {
      where.isActive = false;
    }

    if (role === "SUPER_ADMIN") {
      where.isSuperAdmin = true;
    } else if (role === "NO_RESTAURANT") {
      where.restaurants = { none: {} };
    } else if (role !== "ALL") {
      where.restaurants = {
        some: { role },
      };
    }

    if (search.length > 0) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        {
          restaurants: {
            some: {
              restaurant: {
                OR: [
                  { name: { contains: search } },
                  { slug: { contains: search } },
                ],
              },
            },
          },
        },
      ];
    }

    let orderBy: Prisma.UserOrderByWithRelationInput = {
      createdAt: sortOrder,
    };
    if (sortBy === "name") {
      orderBy = { name: sortOrder };
    } else if (sortBy === "email") {
      orderBy = { email: sortOrder };
    }

    const [
      totalMatching,
      usersRaw,
      totalAll,
      activeCount,
      disabledCount,
      superAdminsCount,
    ] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        // Strictly select safe fields — NEVER select passwordHash
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
              restaurant: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true,
                  city: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { isSuperAdmin: true } }),
    ]);

    const users = usersRaw.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      isSuperAdmin: u.isSuperAdmin,
      suspendedReason: u.suspendedReason,
      suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      memberships: u.restaurants.map((m) => ({
        membershipId: m.id,
        role: m.role,
        membershipStatus: m.status,
        joinedAt: m.createdAt.toISOString(),
        restaurantId: m.restaurant.id,
        restaurantName: m.restaurant.name,
        restaurantSlug: m.restaurant.slug,
        restaurantStatus: m.restaurant.status,
        restaurantCity: m.restaurant.city,
      })),
    }));

    return NextResponse.json(
      {
        users,
        pagination: {
          page,
          limit,
          total: totalMatching,
          totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
        },
        summary: {
          total: totalAll,
          active: activeCount,
          disabled: disabledCount,
          superAdmins: superAdminsCount,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/super-admin/users error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
