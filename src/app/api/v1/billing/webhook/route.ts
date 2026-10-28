import { NextRequest, NextResponse } from "next/server";
import { verifySubscriptionWebhookSignature } from "@/lib/billing/provider";
import { subscriptionWebhookPayloadSchema } from "@/lib/validations/billing";
import {
  BillingRuleError,
  processVerifiedSubscriptionWebhook,
} from "@/lib/billing/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get("x-saas-webhook-signature") ||
      req.headers.get("x-razorpay-signature");

    const verification = verifySubscriptionWebhookSignature(
      rawBody,
      signatureHeader
    );

    if (!verification.valid) {
      return NextResponse.json(
        {
          error: verification.reason || "Invalid webhook signature",
          code: "INVALID_WEBHOOK_SIGNATURE",
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid webhook JSON body", code: "INVALID_WEBHOOK_JSON" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = subscriptionWebhookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid webhook event payload",
          code: "INVALID_WEBHOOK_PAYLOAD",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await processVerifiedSubscriptionWebhook({
      eventId: parsed.data.eventId,
      eventType: parsed.data.eventType,
      createdAt: parsed.data.createdAt,
      rawPayload: rawBody,
      data: parsed.data.data,
    });

    return NextResponse.json(
      {
        received: true,
        ...result,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[BILLING_WEBHOOK_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
