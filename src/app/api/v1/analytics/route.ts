import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { analyticsQuerySchema, resolveDateRange } from "@/lib/validations/analytics";
import { getAnalyticsSummary } from "@/lib/analytics/service";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "analytics.view");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    // Server-side SaaS Plan Feature Entitlement Enforcement
    await assertEntitlement(restaurantId, "USE_ANALYTICS");

    const url = new URL(req.url);

    const queryParse = analyticsQuerySchema.safeParse({
      period: url.searchParams.get("period") || "7d",
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
    });

    if (!queryParse.success) {
      return NextResponse.json(
        { error: queryParse.error.issues[0]?.message || "Invalid analytics parameters" },
        { status: 400 }
      );
    }

    const { period, startDate, endDate } = queryParse.data;

    let dateCtx;
    try {
      dateCtx = resolveDateRange(period, startDate, endDate);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const summary = await getAnalyticsSummary(restaurantId, dateCtx);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    if (err instanceof BillingRuleError) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.status }
      );
    }
    console.error("[ANALYTICS_API_GET_ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error while retrieving analytics" },
      { status: 500 }
    );
  }
}
