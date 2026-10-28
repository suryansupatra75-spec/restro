import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { revokeTenantApiKey } from "@/lib/integrations/api-keys";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "api_keys.manage");
    if (errorResponse) return errorResponse;

    const success = await revokeTenantApiKey(context.restaurantId, id);
    if (!success) {
      return NextResponse.json(
        { error: "API key not found or already revoked" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "API key revoked successfully" });
  } catch (error: any) {
    console.error("DELETE /api/v1/integrations/api-keys/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 }
    );
  }
}
