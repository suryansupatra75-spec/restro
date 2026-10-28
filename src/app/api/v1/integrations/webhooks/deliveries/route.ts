import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { getTenantWebhookDeliveryLogs } from "@/lib/integrations/webhooks";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.view");
    if (errorResponse) return errorResponse;

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = isNaN(limitParam) ? 50 : Math.min(100, Math.max(1, limitParam));

    const deliveries = await getTenantWebhookDeliveryLogs(context.restaurantId, limit);
    return NextResponse.json({ deliveries });
  } catch (error: any) {
    console.error("GET /api/v1/integrations/webhooks/deliveries error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve webhook delivery history" },
      { status: 500 }
    );
  }
}
