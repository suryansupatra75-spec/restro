import { NextRequest, NextResponse } from "next/server";
import { authenticateExternalApiKey } from "@/lib/integrations/api-keys";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateExternalApiKey(req.headers.get("authorization"));
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired API key" },
        { status: 401 }
      );
    }

    if (!auth.scopes.includes("orders:read")) {
      return NextResponse.json(
        { error: "Forbidden: API key lacks 'orders:read' scope" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = isNaN(limitParam) ? 50 : Math.min(100, Math.max(1, limitParam));
    const status = url.searchParams.get("status") || undefined;

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: auth.restaurantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        table: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            name: true,
            price: true,
            quantity: true,
            specialInstructions: true,
          },
        },
        payments: {
          select: {
            id: true,
            status: true,
            amount: true,
            provider: true,
            paymentMethod: true,
            paidAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      restaurantId: auth.restaurantId,
      totalOrders: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount),
        loyaltyDiscountAmount: Number(o.loyaltyDiscountAmount),
        tax: Number(o.tax),
        total: Number(o.total),
        specialInstructions: o.specialInstructions,
        createdAt: o.createdAt.toISOString(),
        table: o.table,
        items: o.items.map((i) => ({
          ...i,
          price: Number(i.price),
        })),
        payments: o.payments.map((p) => ({
          ...p,
          amount: Number(p.amount),
        })),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/v1/external/orders error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
