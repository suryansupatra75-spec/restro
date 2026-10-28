import { NextRequest, NextResponse } from "next/server";
import { getPublicReceiptByToken } from "@/lib/receipts/service";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id || id.trim().length === 0) {
      return NextResponse.json({ error: "Receipt token or ID is required" }, { status: 400 });
    }

    const trimmed = id.trim();

    // 1. Try lookup by public cryptographic receiptToken
    let receipt = await getPublicReceiptByToken(trimmed);

    // 2. Fallback: If caller passed receipt UUID, resolve token
    if (!receipt) {
      const byId = await prisma.digitalReceipt.findUnique({
        where: { id: trimmed },
        select: { receiptToken: true },
      });
      if (byId) {
        receipt = await getPublicReceiptByToken(byId.receiptToken);
      }
    }

    if (!receipt) {
      return NextResponse.json({ error: "Digital receipt not found or expired" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      receipt,
    });
  } catch (error: unknown) {
    console.error("GET /api/v1/receipts/[id]/public error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
