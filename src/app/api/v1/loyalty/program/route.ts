import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { loyaltyProgramSchema } from "@/lib/validations/loyalty";
import {
  getOrCreateLoyaltyProgram,
  updateLoyaltyProgram,
} from "@/lib/loyalty/service";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role } = auth.context;

    if (!hasPermission(role, "loyalty.view")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to view loyalty program" },
        { status: 403 }
      );
    }

    const program = await getOrCreateLoyaltyProgram(restaurantId);
    return NextResponse.json({ program });
  } catch (error: unknown) {
    console.error("GET /api/v1/loyalty/program error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role, user } = auth.context;

    if (!hasPermission(role, "loyalty.manage")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to manage loyalty program" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = loyaltyProgramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const updated = await updateLoyaltyProgram(restaurantId, parsed.data, user.id);
    return NextResponse.json({ program: updated });
  } catch (error: unknown) {
    console.error("PATCH /api/v1/loyalty/program error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
