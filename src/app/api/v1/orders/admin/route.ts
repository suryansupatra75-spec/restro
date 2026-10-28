import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req, "orders.view");
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId } = auth.context;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || "";
    
    // Basic list constraint fetching up to 100 recent orders.
    
    const whereClause: Prisma.OrderWhereInput = {
      restaurantId,
    };

    if (status) {
      if (status === "ACTIVE") {
        whereClause.status = { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] };
      } else if (status === "HISTORY") {
        whereClause.status = { in: ["COMPLETED", "REJECTED", "CANCELLED"] };
      } else {
        whereClause.status = status;
      }
    }

    if (search) {
      whereClause.OR = [
        { orderNumber: { contains: search } },
        { table: { name: { contains: search } } }
      ];
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        table: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        items: {
          include: {
            selectedVariant: true,
            selectedAddons: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    return NextResponse.json(
      { orders },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/v1/orders/admin error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
