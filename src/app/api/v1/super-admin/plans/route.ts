import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireSuperAdmin,
  SUPER_ADMIN_NO_STORE_HEADERS,
} from "@/lib/super-admin-guard";
import { createPlanSchema } from "@/lib/validations/billing";
import { ensureDefaultPlans } from "@/lib/billing/service";

export async function GET() {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    await ensureDefaultPlans();

    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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

    const formatted = plans.map((p) => ({
      ...p,
      activeSubscribersCount: p._count.subscriptions,
    }));

    return NextResponse.json(
      { plans: formatted },
      { status: 200, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[SUPER_ADMIN_PLANS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to load subscription plans" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    await ensureDefaultPlans();

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid plan payload",
          details: parsed.error.issues,
        },
        { status: 400, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const existing = await prisma.subscriptionPlan.findUnique({
      where: { key: parsed.data.key },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A plan with key "${parsed.data.key}" already exists` },
        { status: 409, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.create({
        data: parsed.data,
      });

      await tx.platformAuditLog.create({
        data: {
          actorId: auth.actor.id,
          actorEmail: auth.actor.email,
          action: "PLAN_CREATED",
          targetType: "SUBSCRIPTION_PLAN",
          targetId: plan.id,
          reason: `Created plan ${plan.name} (${plan.key})`,
          metadata: JSON.stringify({
            key: plan.key,
            priceMinor: plan.priceMinor,
            currency: plan.currency,
            billingInterval: plan.billingInterval,
            maxStaff: plan.maxStaff,
            maxMenuItems: plan.maxMenuItems,
            maxTables: plan.maxTables,
          }),
        },
      });

      return plan;
    });

    return NextResponse.json(
      { plan: created },
      { status: 201, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[SUPER_ADMIN_PLANS_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to create subscription plan" },
      { status: 500, headers: SUPER_ADMIN_NO_STORE_HEADERS }
    );
  }
}
