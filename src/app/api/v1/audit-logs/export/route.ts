import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { auditLogQuerySchema } from "@/lib/validations/audit";
import { buildAuditLogCsvString, recordAuditLog } from "@/lib/audit/service";
import { checkExportRateLimit } from "@/lib/rate-limiter";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

/**
 * GET /api/v1/audit-logs/export
 * Exports tenant-scoped audit logs as a formula-injection-safe CSV file.
 * Requires `audit.export` permission and is protected by a rate limiter.
 */
export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "audit.export");
    if (errorResponse) return errorResponse;

    const { restaurantId, restaurant, user, role } = context;

    // Rate Limiting: Max 10 exports per 10 minutes per restaurant
    const rateCheck = checkExportRateLimit(restaurantId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Export rate limit exceeded. Please wait ${rateCheck.retryAfterSeconds} seconds before exporting again.`,
          retryAfter: rateCheck.retryAfterSeconds,
        },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }

    const url = new URL(req.url);
    const parseResult = auditLogQuerySchema.safeParse({
      page: 1,
      limit: 1000,
      search: url.searchParams.get("search") || undefined,
      action: url.searchParams.get("action") || "ALL",
      resourceType: url.searchParams.get("resourceType") || "ALL",
      outcome: url.searchParams.get("outcome") || "ALL",
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      actorId: url.searchParams.get("actorId") || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid export query parameters",
          details: parseResult.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const csvContent = await buildAuditLogCsvString(
      restaurant.name,
      restaurantId,
      parseResult.data
    );

    // Audit log the export itself
    await recordAuditLog({
      restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      actorRole: role,
      action: "DATA_EXPORTED",
      resourceType: "EXPORT",
      resourceName: "Audit Logs CSV Export",
      outcome: "SUCCESS",
      metadata: {
        filterAction: parseResult.data.action,
        filterResource: parseResult.data.resourceType,
        filterOutcome: parseResult.data.outcome,
      },
      req,
    });

    const safeSlug = restaurant.slug.replace(/[^a-z0-9_-]/gi, "_");
    const dateStamp = new Date().toISOString().split("T")[0];
    const filename = `audit_logs_${safeSlug}_${dateStamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[AUDIT_LOG_EXPORT_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error while exporting audit logs" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
