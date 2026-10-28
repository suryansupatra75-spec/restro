import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOrderPayment } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      const text = await req.text().catch(() => "");
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
        }
      }
    }

    const { orderId, token, method = "ONLINE", idempotencyKey } = body as {
      orderId?: string;
      token?: string;
      method?: "ONLINE" | "CASH";
      idempotencyKey?: string;
    };

    if (!orderId || !token) {
      return NextResponse.json(
        { error: "orderId and token are required" },
        { status: 400 }
      );
    }

    // 1. Resolve QR token to verify customer context and table/restaurant authorization
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      include: {
        table: true,
        restaurant: true,
      },
    });

    if (!qr || qr.status !== "ACTIVE" || qr.table.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "Invalid or inactive QR context" },
        { status: 403 }
      );
    }

    // 2. Fetch order to verify tenant context and matching table
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Strict Tenant Isolation & Context Check
    if (order.restaurantId !== qr.restaurantId || order.tableId !== qr.tableId) {
      return NextResponse.json(
        { error: "Forbidden: Order does not match table/restaurant context" },
        { status: 403 }
      );
    }

    if (order.paymentStatus === "PAID") {
      return NextResponse.json(
        { error: "Order has already been paid" },
        { status: 400 }
      );
    }

    // 3. Create payment via service (validates trusted amount from DB)
    const paymentResult = await createOrderPayment({
      orderId: order.id,
      restaurantId: qr.restaurantId,
      tableId: qr.tableId,
      currency: qr.restaurant.currency || "USD",
      method: method === "CASH" ? "CASH" : "ONLINE",
      idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      payment: paymentResult,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/payments/create error:", error);
    const message = error instanceof Error ? error.message : "Failed to initiate payment";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
