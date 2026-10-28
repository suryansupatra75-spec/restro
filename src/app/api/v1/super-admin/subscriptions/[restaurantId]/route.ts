import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  SUPER_ADMIN_NO_STORE_HEADERS,
} from "@/lib/super-admin-guard";
import { superAdminUpdateSubscriptionSchema } from "@/lib/validations/billing";
import {
  BillingRuleError,
  getRestaurantEntitlements,
  superAdminAssignOrUpdateSubscription,
} from "@/lib/billing/service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> }
) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const { restaurantId } = await context.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true, status: true, email: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const entitlements = await getRestaurantEntitlements(restaurantId);

    const [history, invoices] = await Promise.all([
      prisma.restaurantSubscription.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.subscriptionInvoice.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json(
      {
        restaurant,
        entitlements,
        history,
        invoices,
      },
      { status: 200, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[SUPER_ADMIN_RESTAURANT_SUBSCRIPTION_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to load restaurant subscription details" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ restaurantId: string }> }
) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const { restaurantId } = await context.params;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const parsed = superAdminUpdateSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Invalid subscription update payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const result = await superAdminAssignOrUpdateSubscription({
      restaurantId,
      ...parsed.data,
      actorUserId: auth.actor.id,
    });

    await prisma.platformAuditLog.create({
      data: {
        actorId: auth.actor.id,
        actorEmail: auth.actor.email,
        action: "SUBSCRIPTION_UPDATED",
        targetType: "RESTAURANT",
        targetId: restaurantId,
        reason:
          parsed.data.notes ||
          `Updated subscription to ${result.subscription.planNameSnapshot} (${result.subscription.status})`,
        metadata: JSON.stringify({
          subscriptionId: result.subscription.id,
          planKey: result.subscription.planKeySnapshot,
          status: result.subscription.status,
          manualInvoiceId: result.manualInvoice?.id ?? null,
        }),
      },
    });

    const entitlements = await getRestaurantEntitlements(restaurantId);

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
    console.error("[SUPER_ADMIN_RESTAURANT_SUBSCRIPTION_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to update restaurant subscription" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}
