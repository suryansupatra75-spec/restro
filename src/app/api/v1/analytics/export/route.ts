import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { analyticsQuerySchema, resolveDateRange } from "@/lib/validations/analytics";
import { getAnalyticsSummary, buildAnalyticsCsvString } from "@/lib/analytics/service";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";
import { recordAuditLog } from "@/lib/audit/service";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "analytics.export");
    if (errorResponse) return errorResponse;

    const { restaurantId, restaurant, user, role } = context;

    // Server-side SaaS Plan Feature Entitlement Enforcement
    await assertEntitlement(restaurantId, "USE_ANALYTICS_EXPORT");

    const url = new URL(req.url);

    const queryParse = analyticsQuerySchema.safeParse({
      period: url.searchParams.get("period") || "7d",
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      exportFormat: "csv",
    });

    if (!queryParse.success) {
      return NextResponse.json(
        { error: queryParse.error.issues[0]?.message || "Invalid export parameters" },
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
    const csvContent = buildAnalyticsCsvString(restaurant.name, summary);

    const filename = `analytics_${restaurant.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${summary.startDate}_to_${summary.endDate}.csv`;

    await recordAuditLog({
      restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole: role,
      action: "DATA_EXPORTED",
      resourceType: "EXPORT",
      resourceName: "Analytics CSV Export",
      outcome: "SUCCESS",
      metadata: {
        period,
        startDate: summary.startDate,
        endDate: summary.endDate,
      },
      req,
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (err: any) {
    if (err instanceof BillingRuleError) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.status }
      );
    }
    console.error("[ANALYTICS_EXPORT_API_ERROR]", err);
    return NextResponse.json(
      { error: "Internal server error while exporting analytics" },
      { status: 500 }
    );
  }
}
