import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { getAuditLogById } from "@/lib/audit/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/audit-logs/[id]
 * Retrieves single audit event detail for the tenant.
 * Strictly prevents IDOR/BOLA attacks by verifying tenant ownership.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "audit.view");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Audit event ID is required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const log = await getAuditLogById(id, restaurantId);

    if (!log) {
      return NextResponse.json(
        { error: "Audit event not found or access denied" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        log,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[GET_AUDIT_LOG_DETAIL_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
