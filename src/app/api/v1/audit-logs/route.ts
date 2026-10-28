import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { auditLogQuerySchema } from "@/lib/validations/audit";
import { queryAuditLogs } from "@/lib/audit/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

/**
 * GET /api/v1/audit-logs
 * Tenant-scoped audit ledger list endpoint.
 * Protected by server-side authorization: requires `audit.view` permission.
 */
export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "audit.view");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;
    const url = new URL(req.url);

    const parseResult = auditLogQuerySchema.safeParse({
      page: url.searchParams.get("page") || 1,
      limit: url.searchParams.get("limit") || 20,
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
          error: "Invalid query parameters",
          details: parseResult.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await queryAuditLogs(restaurantId, parseResult.data);

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[GET_AUDIT_LOGS_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error while fetching audit logs" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Audit logs are strictly append-only and server-generated.
 * Direct modification or client-forged creation is forbidden.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs are server-generated and cannot be created via client API." },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs are immutable." },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs cannot be deleted." },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
