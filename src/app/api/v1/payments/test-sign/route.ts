import { NextRequest, NextResponse } from "next/server";
import { generateTestPaymentSignature, isRealRazorpayConfigured } from "@/lib/payments/razorpay";

export async function POST(req: NextRequest) {
  // Only allowed when real production keys are not enforcing live checkout
  if (isRealRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Test signature endpoint is disabled in production" },
      { status: 403 }
    );
  }

  try {
    const raw = await req.text();
    let body: Record<string, unknown>;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const { razorpayOrderId, razorpayPaymentId } = body as {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
    };

    if (!razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json(
        { error: "razorpayOrderId and razorpayPaymentId are required" },
        { status: 400 }
      );
    }

    const signature = generateTestPaymentSignature(razorpayOrderId, razorpayPaymentId);

    return NextResponse.json({ signature });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error generating signature";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
