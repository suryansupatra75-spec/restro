import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { ownerCancelSubscriptionSchema } from "@/lib/validations/billing";
import {
  BillingRuleError,
  getRestaurantEntitlements,
  requestOwnerSubscriptionCancellation,
} from "@/lib/billing/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function POST(req: NextRequest) {
  try {
    let rawBody = "";
    try {
      rawBody = await req.text();
    } catch {
      // Safe stream drain
    }

    const { errorResponse, context } = await requireAuthMember(
      req,
      "billing.manage"
    );
    if (errorResponse) return errorResponse;

    let body: unknown = {};
    if (rawBody && rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON payload" },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const parsed = ownerCancelSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Invalid cancellation request payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const subscription = await requestOwnerSubscriptionCancellation({
      restaurantId: context.restaurantId,
      immediate: parsed.data.immediate,
      reason: parsed.data.reason,
    });

    const entitlements = await getRestaurantEntitlements(context.restaurantId);

    return NextResponse.json(
      {
        subscription,
        entitlements,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[BILLING_CANCEL_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to process subscription cancellation" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
