import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const token = searchParams.get("token");

    if (!orderId || !token) {
      return NextResponse.json(
        { error: "orderId and token are required" },
        { status: 400 }
      );
    }

    // Resolve QR token
    const qr = await prisma.qRCode.findUnique({
      where: { token },
    });

    if (!qr || qr.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Invalid QR context" },
        { status: 403 }
      );
    }

    // Fetch order with payments
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!order || order.restaurantId !== qr.restaurantId || order.tableId !== qr.tableId) {
      return NextResponse.json(
        { error: "Order not found or forbidden" },
        { status: 404 }
      );
    }

    const latestPayment = order.payments[0] || null;

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      total: Number(order.total),
      latestPayment: latestPayment
        ? {
            id: latestPayment.id,
            status: latestPayment.status,
            method: latestPayment.paymentMethod,
            provider: latestPayment.provider,
            amount: Number(latestPayment.amount),
            paidAt: latestPayment.paidAt,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error("GET /api/v1/payments/status error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
