import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { ownerCheckoutRequestSchema } from "@/lib/validations/billing";
import {
  BillingRuleError,
  getRestaurantEntitlements,
  initiateOwnerPlanCheckout,
} from "@/lib/billing/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

/**
 * Browser return / redirect verification endpoint.
 * Never activates a subscription or marks an invoice paid merely because the browser returns to a success URL.
 */
export async function GET(req: NextRequest) {
  const { errorResponse, context } = await requireAuthMember(req, "billing.view");
  if (errorResponse) return errorResponse;

  const entitlements = await getRestaurantEntitlements(context.restaurantId);

  return NextResponse.json(
    {
      paymentConfirmedByRedirect: false,
      subscriptionStatus: entitlements.subscription.status,
      notice:
        "Browser return redirect never confirms payment. Subscription activation requires a signature-verified server-side provider webhook.",
      entitlements,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

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

    // Explicitly reject any forged payment/status/tenant fields before or during strict schema parse
    if (
      typeof body === "object" &&
      body !== null &&
      ("status" in body ||
        "paid" in body ||
        "priceMinor" in body ||
        "amountMinor" in body ||
        "restaurantId" in body ||
        "invoiceStatus" in body ||
        "paymentStatus" in body)
    ) {
      return NextResponse.json(
        {
          error:
            "Security violation: Client-supplied status, price, paid flag, or tenant ID are forbidden.",
          code: "FORBIDDEN_BILLING_FIELDS",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = ownerCheckoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid checkout request payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const simulateTimeout =
      process.env.NODE_ENV !== "production" &&
      req.headers.get("x-test-simulate-provider-timeout") === "true";

    const result = await initiateOwnerPlanCheckout({
      restaurantId: context.restaurantId,
      planId: parsed.data.planId,
      action: parsed.data.action,
      simulateTimeout,
    });

    const entitlements = await getRestaurantEntitlements(context.restaurantId);

    return NextResponse.json(
      {
        ...result,
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
    console.error("[BILLING_CHECKOUT_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to initiate subscription checkout" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
