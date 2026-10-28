import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STALE_TERMINAL_ORDER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// GET /api/v1/orders/track?token=xxx&orderId=yyy
// Public endpoint — validated by QR token ownership, active restaurant/table status, and recent session window
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    const orderId = req.nextUrl.searchParams.get("orderId")?.trim();

    if (!token || !orderId) {
      return NextResponse.json(
        { error: "Missing token or orderId" },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format" },
        { status: 400 }
      );
    }

    // Validate QR token and ensure QR, table, and restaurant are active
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      select: {
        status: true,
        restaurantId: true,
        tableId: true,
        table: { select: { status: true } },
        restaurant: { select: { status: true } },
      },
    });

    if (
      !qr ||
      qr.status !== "ACTIVE" ||
      qr.table.status === "ARCHIVED" ||
      qr.restaurant.status !== "ACTIVE"
    ) {
      return NextResponse.json(
        { error: "Invalid or inactive QR token" },
        { status: 404 }
      );
    }

    // Fetch order — must belong to the same restaurant + table
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId: qr.restaurantId,
        tableId: qr.tableId,
      },
      include: {
        items: {
          include: {
            selectedVariant: true,
            selectedAddons: true,
          },
        },
        receipts: {
          select: { receiptToken: true },
          take: 1,
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Prevent subsequent table guests from viewing old completed/cancelled/rejected orders
    const isTerminal =
      order.status === "COMPLETED" ||
      order.status === "CANCELLED" ||
      order.status === "REJECTED";
    if (
      isTerminal &&
      Date.now() - order.updatedAt.getTime() > STALE_TERMINAL_ORDER_WINDOW_MS
    ) {
      return NextResponse.json(
        { error: "Order tracking session has expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          receiptToken: order.receipts[0]?.receiptToken || null,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotal: Number(order.subtotal),
          couponCode: order.couponCode,
          promotionName: order.promotionNameSnapshot,
          discountAmount: Number(order.discountAmount),
          loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
          loyaltyDiscountAmount: Number(order.loyaltyDiscountAmount || 0),
          loyaltyPointsEarned: order.loyaltyPointsEarned,
          tax: Number(order.tax),
          total: Number(order.total),
          specialInstructions: order.specialInstructions,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
          items: order.items.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: item.quantity,
            specialInstructions: item.specialInstructions,
            variant: item.selectedVariant
              ? {
                  name: item.selectedVariant.name,
                  price: Number(item.selectedVariant.price),
                }
              : null,
            addons: item.selectedAddons.map((a) => ({
              name: a.name,
              price: Number(a.price),
            })),
          })),
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: unknown) {
    console.error("GET /api/v1/orders/track error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
