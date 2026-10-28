import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getCustomerLoyaltySummary } from "@/lib/loyalty/service";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ customerId: string }> }
) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role } = auth.context;

    if (!hasPermission(role, "customers.view") && !hasPermission(role, "loyalty.view")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to view customer loyalty" },
        { status: 403 }
      );
    }

    const { customerId } = await props.params;

    // Verify customer belongs to restaurant (Anti-IDOR)
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const summary = await getCustomerLoyaltySummary({
      restaurantId,
      customerId,
    });

    return NextResponse.json({ summary });
  } catch (error: unknown) {
    console.error("GET /api/v1/loyalty/customers/[customerId] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
