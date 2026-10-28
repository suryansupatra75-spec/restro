import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOrderPayment } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    let body: Record<string, unknown>;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const {
      orderId,
      paymentId,
      token,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body as {
      orderId?: string;
      paymentId?: string;
      token?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    if (!orderId || !paymentId || !token) {
      return NextResponse.json(
        { error: "orderId, paymentId and token are required" },
        { status: 400 }
      );
    }

    if (!razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing payment verification parameters" },
        { status: 400 }
      );
    }

    // 1. Validate QR Token Context
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      include: { table: true },
    });

    if (!qr || qr.status !== "ACTIVE" || qr.table.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "Invalid or inactive QR context" },
        { status: 403 }
      );
    }

    // 2. Validate Order Context
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.restaurantId !== qr.restaurantId || order.tableId !== qr.tableId) {
      return NextResponse.json(
        { error: "Forbidden: Order does not match table/restaurant context" },
        { status: 403 }
      );
    }

    // 3. Cryptographically Verify with Server
    const result = await verifyOrderPayment({
      paymentId,
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Payment verification failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      orderNumber: result.orderNumber,
      amount: result.amount,
      paymentId: result.paymentId,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/payments/verify error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
