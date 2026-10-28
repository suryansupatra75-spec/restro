import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tableSchema } from "@/lib/validations/tables";
import { z } from "zod";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const queryRestaurantId =
      req.nextUrl.searchParams.get("restaurantId") ||
      req.headers.get("x-restaurant-id");
    const restaurantId = queryRestaurantId || user.restaurants[0].restaurantId;

    const hasAccess = user.restaurants.some((r) => r.restaurantId === restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tables = await prisma.table.findMany({
      where: {
        restaurantId,
        status: {
          not: "ARCHIVED",
        },
      },
      include: {
        qrCodes: {
          where: { status: "ACTIVE" },
          select: { token: true },
          take: 1,
        },
        orders: {
          where: {
            status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] },
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    return NextResponse.json(tables);
  } catch (error) {
    console.error("GET /api/v1/tables error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const queryRestaurantId =
      req.nextUrl.searchParams.get("restaurantId") ||
      req.headers.get("x-restaurant-id");
    const restaurantId = queryRestaurantId || user.restaurants[0].restaurantId;

    const hasAccess = user.restaurants.some((r) => r.restaurantId === restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data = tableSchema.parse(body);

    const existingTable = await prisma.table.findFirst({
      where: {
        restaurantId,
        name: data.name,
      },
    });

    if (existingTable) {
      return NextResponse.json({ error: "Table name already exists" }, { status: 400 });
    }

    // Server-side SaaS Plan Limit & Subscription Status Enforcement
    await assertEntitlement(restaurantId, "ADD_TABLE");

    const table = await prisma.table.create({
      data: {
        ...data,
        restaurantId,
      },
    });

    return NextResponse.json(table, { status: 201 });
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/v1/tables error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    // Also support checking error.name in case instanceof isn't perfectly matching across versions
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
