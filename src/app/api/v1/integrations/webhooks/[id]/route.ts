import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import {
  updateTenantWebhookSubscription,
  deleteTenantWebhookSubscription,
} from "@/lib/integrations/webhooks";
import { updateWebhookSchema } from "@/lib/validations/integrations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "integrations.manage");
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const parsed = updateWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const updated = await updateTenantWebhookSubscription({
      restaurantId: context.restaurantId,
      id,
      name: parsed.data.name,
      url: parsed.data.url,
      events: parsed.data.events,
      isActive: parsed.data.isActive,
    });

    return NextResponse.json({ success: true, webhook: updated });
  } catch (error: any) {
    console.error("PATCH /api/v1/integrations/webhooks/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update webhook subscription" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "integrations.manage");
    if (errorResponse) return errorResponse;

    await deleteTenantWebhookSubscription(context.restaurantId, id);
    return NextResponse.json({ success: true, message: "Webhook subscription deleted" });
  } catch (error: any) {
    console.error("DELETE /api/v1/integrations/webhooks/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete webhook subscription" },
      { status: 404 }
    );
  }
}
