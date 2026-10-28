import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { getTenantPrintLedger } from "@/lib/integrations/service";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.view");
    if (errorResponse) return errorResponse;

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = isNaN(limitParam) ? 50 : Math.min(100, Math.max(1, limitParam));

    const jobs = await getTenantPrintLedger(context.restaurantId, limit);
    return NextResponse.json({ printJobs: jobs });
  } catch (error: any) {
    console.error("GET /api/v1/integrations/print/history error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve print history" },
      { status: 500 }
    );
  }
}
