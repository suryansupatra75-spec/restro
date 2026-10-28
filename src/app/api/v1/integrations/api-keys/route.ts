import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import {
  generateTenantApiKey,
  listTenantApiKeys,
} from "@/lib/integrations/api-keys";
import { createApiKeySchema } from "@/lib/validations/integrations";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.view");
    if (errorResponse) return errorResponse;

    const keys = await listTenantApiKeys(context.restaurantId);
    return NextResponse.json({ apiKeys: keys });
  } catch (error: any) {
    console.error("GET /api/v1/integrations/api-keys error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve API keys" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "api_keys.manage");
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const created = await generateTenantApiKey({
      restaurantId: context.restaurantId,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresInDays: parsed.data.expiresInDays,
      createdByUserId: context.user.id,
    });

    return NextResponse.json({
      success: true,
      apiKey: created,
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/v1/integrations/api-keys error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate API key" },
      { status: 500 }
    );
  }
}
