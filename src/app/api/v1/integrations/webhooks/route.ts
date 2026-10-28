import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import {
  createTenantWebhookSubscription,
  listTenantWebhookSubscriptions,
} from "@/lib/integrations/webhooks";
import { createWebhookSchema } from "@/lib/validations/integrations";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.view");
    if (errorResponse) return errorResponse;

    const webhooks = await listTenantWebhookSubscriptions(context.restaurantId);
    return NextResponse.json({ webhooks });
  } catch (error: any) {
    console.error("GET /api/v1/integrations/webhooks error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve webhook subscriptions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.manage");
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const parsed = createWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const created = await createTenantWebhookSubscription({
      restaurantId: context.restaurantId,
      name: parsed.data.name,
      url: parsed.data.url,
      events: parsed.data.events,
      isActive: parsed.data.isActive,
    });

    return NextResponse.json({
      success: true,
      webhook: created,
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/v1/integrations/webhooks error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create webhook subscription" },
      { status: 400 }
    );
  }
}
