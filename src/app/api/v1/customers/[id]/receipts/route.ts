import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "customers.view");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    // Verify customer exists and belongs to this tenant
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const receipts = await prisma.digitalReceipt.findMany({
      where: {
        customerId: id,
        restaurantId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            table: { select: { name: true } },
          },
        },
        deliveryLogs: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            channel: true,
            status: true,
            recipient: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      customerId: id,
      customerName: customer.name,
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        receiptToken: r.receiptToken,
        orderId: r.orderId,
        orderNumber: r.order.orderNumber,
        tableName: r.order.table?.name || "Table",
        currency: r.currency,
        subtotal: Number(r.subtotal),
        discountAmount: Number(r.discountAmount),
        tax: Number(r.tax),
        finalTotal: Number(r.finalTotal),
        paymentMethod: r.paymentMethod,
        paymentStatus: r.paymentStatus,
        isTaxInvoice: r.isTaxInvoice,
        issueDate: r.issueDate,
        createdAt: r.createdAt,
        deliveryLogs: r.deliveryLogs,
      })),
    });
  } catch (error: unknown) {
    console.error("GET /api/v1/customers/[id]/receipts error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
