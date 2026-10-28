import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { loyaltyManualAdjustmentSchema } from "@/lib/validations/loyalty";
import {
  performManualLoyaltyAdjustment,
  LoyaltyRuleError,
} from "@/lib/loyalty/service";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role, user } = auth.context;

    if (!hasPermission(role, "loyalty.adjust")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to adjust loyalty points (loyalty.adjust required)" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = loyaltyManualAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await performManualLoyaltyAdjustment(
      restaurantId,
      parsed.data,
      user.id,
      user.name
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof LoyaltyRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }

    console.error("POST /api/v1/loyalty/adjust error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
