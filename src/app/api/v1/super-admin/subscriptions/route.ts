import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  SUPER_ADMIN_NO_STORE_HEADERS,
} from "@/lib/super-admin-guard";
import { superAdminAssignSubscriptionSchema } from "@/lib/validations/billing";
import {
  BillingRuleError,
  ensureDefaultPlans,
  getRestaurantEntitlements,
  superAdminAssignOrUpdateSubscription,
} from "@/lib/billing/service";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    await ensureDefaultPlans();

    const search = req.nextUrl.searchParams.get("search")?.trim() || "";
    const statusFilter = req.nextUrl.searchParams.get("status")?.trim() || "ALL";

    const restaurants = await prisma.restaurant.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { slug: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        email: true,
        city: true,
        createdAt: true,
      },
    });

    const items = [];
    for (const r of restaurants) {
      const ent = await getRestaurantEntitlements(r.id);
      if (statusFilter !== "ALL" && ent.subscription.status !== statusFilter) {
        continue;
      }
      items.push({
        restaurant: r,
        subscription: ent.subscription,
        limits: ent.limits,
        usage: ent.usage,
        overLimit: ent.overLimit,
        features: ent.features,
      });
    }

    // Verified SaaS subscription revenue summary (strictly from SubscriptionInvoice, never food orders)
    const paidInvoicesAgg = await prisma.subscriptionInvoice.aggregate({
      where: {
        invoiceStatus: "PAID",
        paymentStatus: "SUCCEEDED",
      },
      _sum: { amountMinor: true },
      _count: { id: true },
    });

    const statusCountsRaw = await prisma.restaurantSubscription.groupBy({
      by: ["status"],
      where: { isCurrent: true },
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {
      TRIALING: 0,
      ACTIVE: 0,
      PAST_DUE: 0,
      CANCELLED: 0,
      EXPIRED: 0,
      INCOMPLETE: 0,
    };
    for (const row of statusCountsRaw) {
      statusCounts[row.status] = row._count.id;
    }

    return NextResponse.json(
      {
        items,
        summary: {
          statusCounts,
          verifiedSaasRevenueMinor: paidInvoicesAgg._sum.amountMinor ?? 0,
          verifiedPaidInvoicesCount: paidInvoicesAgg._count.id ?? 0,
          currency: "INR",
        },
      },
      { status: 200, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[SUPER_ADMIN_SUBSCRIPTIONS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to load tenant subscriptions" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const parsed = superAdminAssignSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Invalid subscription assignment payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const result = await superAdminAssignOrUpdateSubscription({
      ...parsed.data,
      actorUserId: auth.actor.id,
    });

    await prisma.platformAuditLog.create({
      data: {
        actorId: auth.actor.id,
        actorEmail: auth.actor.email,
        action: "SUBSCRIPTION_ASSIGNED",
        targetType: "RESTAURANT",
        targetId: parsed.data.restaurantId,
        reason:
          parsed.data.notes ||
          `Assigned plan ${result.subscription.planNameSnapshot} (${result.subscription.status})`,
        metadata: JSON.stringify({
          subscriptionId: result.subscription.id,
          planKey: result.subscription.planKeySnapshot,
          status: result.subscription.status,
          manualInvoiceId: result.manualInvoice?.id ?? null,
        }),
      },
    });

    const entitlements = await getRestaurantEntitlements(
      parsed.data.restaurantId
    );

    return NextResponse.json(
      {
        subscription: result.subscription,
        manualInvoice: result.manualInvoice,
        entitlements,
      },
      { status: 200, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }
    console.error("[SUPER_ADMIN_SUBSCRIPTIONS_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to assign subscription" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}
