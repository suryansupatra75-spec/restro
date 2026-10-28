import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { markReceiptRefunded } from "@/lib/receipts/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "receipts.manage");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { reason = "Customer requested refund", amount = 0 } = body || {};

    const receipt = await prisma.digitalReceipt.findFirst({
      where: { id, restaurantId },
    });

    if (!receipt) {
      return NextResponse.json({ error: "Digital receipt not found" }, { status: 404 });
    }

    const updated = await markReceiptRefunded({
      orderId: receipt.orderId,
      restaurantId,
      reason,
      amount: Number(amount) || Number(receipt.finalTotal),
    });

    return NextResponse.json({
      success: true,
      receipt: updated,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/receipts/[id]/refund error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
