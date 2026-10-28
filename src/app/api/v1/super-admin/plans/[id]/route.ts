import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  SUPER_ADMIN_NO_STORE_HEADERS,
} from "@/lib/super-admin-guard";
import { updatePlanSchema } from "@/lib/validations/billing";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const { id } = await context.params;

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subscriptions: {
              where: {
                isCurrent: true,
                status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
              },
            },
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json(
        { error: "Subscription plan not found" },
        { status: 404, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        plan: {
          ...plan,
          activeSubscribersCount: plan._count.subscriptions,
        },
      },
      { status: 200, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[SUPER_ADMIN_PLAN_DETAIL_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to load plan details" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const { id } = await context.params;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const parsed = updatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid plan update payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Subscription plan not found" },
        { status: 404, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const activeSubscriberCount = await prisma.restaurantSubscription.count({
      where: {
        planId: id,
        isCurrent: true,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      },
    });

    // Guard: Prevent archiving or deactivating a plan that has active/trialing subscribers
    const wantsArchive = parsed.data.isArchived === true;
    const wantsDeactivate = parsed.data.isActive === false;

    if ((wantsArchive || wantsDeactivate) && activeSubscriberCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot archive or deactivate plan "${existing.name}" because ${activeSubscriberCount} restaurant(s) currently have an active or trialing subscription on this plan. Transition those restaurants to another plan first.`,
          code: "PLAN_HAS_ACTIVE_SUBSCRIBERS",
          activeSubscriberCount,
        },
        { status: 409, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.update({
        where: { id },
        data: {
          ...parsed.data,
          // If archiving, also mark isActive false
          ...(wantsArchive ? { isActive: false } : {}),
        },
      });

      await tx.platformAuditLog.create({
        data: {
          actorId: auth.actor.id,
          actorEmail: auth.actor.email,
          action: wantsArchive ? "PLAN_ARCHIVED" : "PLAN_UPDATED",
          targetType: "SUBSCRIPTION_PLAN",
          targetId: plan.id,
          reason: wantsArchive
            ? `Archived plan ${plan.name} (${plan.key})`
            : `Updated plan ${plan.name} (${plan.key})`,
          metadata: JSON.stringify({
            changes: parsed.data,
          }),
        },
      });

      return plan;
    });

    return NextResponse.json(
      { plan: updated },
      { status: 200, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[SUPER_ADMIN_PLAN_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to update subscription plan" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}
