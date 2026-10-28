import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  ensureDefaultPlans,
  getRestaurantEntitlements,
} from "@/lib/billing/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(
      req,
      "billing.view"
    );
    if (errorResponse) return errorResponse;

    const { restaurantId, role, restaurant } = context;

    await ensureDefaultPlans();

    const [entitlements, availablePlans, invoices, history] = await Promise.all([
      getRestaurantEntitlements(restaurantId),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true, isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { priceMinor: "asc" }],
      }),
      prisma.subscriptionInvoice.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          invoiceNumber: true,
          planKeySnapshot: true,
          planNameSnapshot: true,
          billingIntervalSnapshot: true,
          amountMinor: true,
          currency: true,
          invoiceStatus: true,
          paymentStatus: true,
          provider: true,
          providerOrderId: true,
          providerPaymentId: true,
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          failureReason: true,
          verifiedBySource: true,
          notes: true,
          createdAt: true,
        },
      }),
      prisma.restaurantSubscription.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          planId: true,
          isCurrent: true,
          status: true,
          planKeySnapshot: true,
          planNameSnapshot: true,
          billingIntervalSnapshot: true,
          priceMinorSnapshot: true,
          currencySnapshot: true,
          trialStartsAt: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelRequestedAt: true,
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
        },
        role,
        canManageBilling: hasPermission(role, "billing.manage"),
        entitlements,
        availablePlans,
        invoices,
        history,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[BILLING_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to load billing overview" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
