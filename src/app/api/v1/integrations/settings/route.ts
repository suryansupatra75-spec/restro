import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import {
  getTenantIntegrationsSummary,
  updateTenantIntegration,
} from "@/lib/integrations/service";
import { integrationUpdateSchema } from "@/lib/validations/integrations";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.view");
    if (errorResponse) return errorResponse;

    const summary = await getTenantIntegrationsSummary(context.restaurantId);
    return NextResponse.json({ integrations: summary });
  } catch (error: any) {
    console.error("GET /api/v1/integrations/settings error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve integration settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.manage");
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const parsed = integrationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const updated = await updateTenantIntegration({
      restaurantId: context.restaurantId,
      providerType: parsed.data.providerType,
      isEnabled: parsed.data.isEnabled,
      config: parsed.data.config,
    });

    return NextResponse.json({
      success: true,
      integration: updated,
    });
  } catch (error: any) {
    console.error("PATCH /api/v1/integrations/settings error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update integration settings" },
      { status: 400 }
    );
  }
}
