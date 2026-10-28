import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { getRestaurantLoyaltyLedger } from "@/lib/loyalty/service";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role } = auth.context;

    if (!hasPermission(role, "loyalty.view")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to view loyalty ledger" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const type = searchParams.get("type") || undefined;
    const customerId = searchParams.get("customerId") || undefined;

    const data = await getRestaurantLoyaltyLedger({
      restaurantId,
      page,
      limit,
      type,
      customerId,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("GET /api/v1/loyalty/ledger error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
