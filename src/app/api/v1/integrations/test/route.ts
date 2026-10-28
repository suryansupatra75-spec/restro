import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { testTenantIntegration } from "@/lib/integrations/service";
import { integrationTestSchema } from "@/lib/validations/integrations";

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.test");
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const parsed = integrationTestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const result = await testTenantIntegration({
      restaurantId: context.restaurantId,
      providerType: parsed.data.providerType,
      testTarget: parsed.data.testTarget,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("POST /api/v1/integrations/test error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute connection test" },
      { status: 500 }
    );
  }
}
