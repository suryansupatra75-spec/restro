import { NextRequest, NextResponse } from "next/server";
import { processPaymentWebhook } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing webhook signature header" },
        { status: 400 }
      );
    }

    // Read raw body as text for HMAC verification
    const rawBody = await req.text();

    if (!rawBody) {
      return NextResponse.json(
        { error: "Empty webhook payload" },
        { status: 400 }
      );
    }

    const result = await processPaymentWebhook({
      rawBody,
      signature,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      status: "ok",
      message: result.message,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/payments/webhook error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
