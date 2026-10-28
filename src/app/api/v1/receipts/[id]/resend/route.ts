import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { resendReceiptSchema } from "@/lib/validations/receipts";
import { resendReceipt } from "@/lib/receipts/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "receipts.send");
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parseResult = resendReceiptSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid resend parameters" },
        { status: 400 }
      );
    }

    const { channel, recipient } = parseResult.data;

    const result = await resendReceipt({
      receiptId: id,
      channel,
      overrideRecipient: recipient,
      restaurantId,
      actorId: user.id,
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      recipient: result.recipient,
      error: result.error || null,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/receipts/[id]/resend error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Rate limit")
      ? 429
      : message.includes("Forbidden")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
