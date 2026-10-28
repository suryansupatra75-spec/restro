import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { pingTenantWebhookSubscription } from "@/lib/integrations/webhooks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "integrations.test");
    if (errorResponse) return errorResponse;

    const result = await pingTenantWebhookSubscription(context.restaurantId, id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("POST /api/v1/integrations/webhooks/[id]/ping error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to ping webhook" },
      { status: 500 }
    );
  }
}
