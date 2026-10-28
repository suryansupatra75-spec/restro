import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { maskEmail, maskPhone } from "@/lib/validations/receipts";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "receipts.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    const receipt = await prisma.digitalReceipt.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            table: { select: { id: true, name: true, number: true } },
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        deliveryLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json({ error: "Digital receipt not found" }, { status: 404 });
    }

    const canViewContact = hasPermission(role, "customers.viewContact");

    let snapshot = null;
    try {
      snapshot = JSON.parse(receipt.snapshotData);
    } catch {
      snapshot = null;
    }

    let refundDetails = null;
    if (receipt.refundData) {
      try {
        refundDetails = JSON.parse(receipt.refundData);
      } catch {
        refundDetails = null;
      }
    }

    // Mask customer contact in snapshot if staff lacks permission
    if (snapshot?.customer && !canViewContact) {
      snapshot.customer.phone = maskPhone(snapshot.customer.phone);
      snapshot.customer.email = maskEmail(snapshot.customer.email);
    }

    return NextResponse.json({
      success: true,
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receiptToken: receipt.receiptToken,
        orderId: receipt.orderId,
        orderNumber: receipt.order.orderNumber,
        orderStatus: receipt.order.status,
        tableName: receipt.order.table?.name || "Table",
        currency: receipt.currency,
        subtotal: Number(receipt.subtotal),
        discountAmount: Number(receipt.discountAmount),
        tax: Number(receipt.tax),
        appliedTaxPercentage: receipt.appliedTaxPercentage,
        finalTotal: Number(receipt.finalTotal),
        paymentMethod: receipt.paymentMethod,
        paymentStatus: receipt.paymentStatus,
        isTaxInvoice: receipt.isTaxInvoice,
        issueDate: receipt.issueDate,
        createdAt: receipt.createdAt,
        snapshot,
        refundDetails,
        deliveryLogs: receipt.deliveryLogs,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/v1/receipts/[id] error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
