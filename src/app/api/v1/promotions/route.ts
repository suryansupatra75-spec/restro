import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createPromotionSchema } from "@/lib/validations/promotion";
import { serializePromotion } from "@/lib/promotions/service";
import {
  assertEntitlement,
  BillingRuleError,
  getRestaurantEntitlements,
} from "@/lib/billing/service";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedRestaurantId = req.nextUrl.searchParams.get("restaurantId");
    const membership = requestedRestaurantId
      ? user.restaurants.find((r) => r.restaurantId === requestedRestaurantId)
      : user.restaurants[0];

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this restaurant." },
        { status: 403 }
      );
    }

    if (!hasPermission(membership.role, "promotions.view")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to view promotions." },
        { status: 403 }
      );
    }

    const restaurantId = membership.restaurantId;
    const statusFilter = req.nextUrl.searchParams.get("status") || "ALL";
    const search = (req.nextUrl.searchParams.get("search") || "").trim();

    const whereClause: Record<string, unknown> = {
      restaurantId,
      ...(statusFilter !== "ALL"
        ? { status: statusFilter }
        : { status: { not: "ARCHIVED" } }),
    };

    if (search) {
      whereClause.OR = [
        { code: { contains: search.toUpperCase() } },
        { name: { contains: search } },
      ];
    }

    const [
      promotions,
      redemptionStats,
      allNonArchivedCount,
      activeCount,
      categories,
      menuItems,
      entitlements,
      restaurant,
    ] = await Promise.all([
      prisma.promotion.findMany({
        where: whereClause,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      prisma.promotionRedemption.groupBy({
        by: ["promotionId"],
        where: {
          restaurantId,
          status: "APPLIED",
        },
        _count: { id: true },
        _sum: { discountAmount: true },
      }),
      prisma.promotion.count({
        where: { restaurantId, status: { not: "ARCHIVED" } },
      }),
      prisma.promotion.count({
        where: { restaurantId, status: "ACTIVE" },
      }),
      prisma.menuCategory.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId, status: "ACTIVE" },
        select: { id: true, name: true, price: true, categoryId: true },
        orderBy: { name: "asc" },
      }),
      getRestaurantEntitlements(restaurantId),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { currency: true },
      }),
    ]);

    const statsMap = new Map(
      redemptionStats.map((r) => [
        r.promotionId,
        {
          appliedRedemptions: r._count.id,
          totalDiscountGranted: Number(r._sum.discountAmount || 0),
        },
      ])
    );

    let totalRedemptions = 0;
    let totalDiscountGranted = 0;
    for (const row of redemptionStats) {
      totalRedemptions += row._count.id;
      totalDiscountGranted += Number(row._sum.discountAmount || 0);
    }

    const serialized = promotions.map((p) => {
      const base = serializePromotion(p);
      const stat = statsMap.get(p.id) || {
        appliedRedemptions: 0,
        totalDiscountGranted: 0,
      };
      return {
        ...base,
        appliedRedemptions: stat.appliedRedemptions,
        totalDiscountGranted: Number(stat.totalDiscountGranted.toFixed(2)),
      };
    });

    return NextResponse.json({
      promotions: serialized,
      summary: {
        activeCount,
        totalPromotions: allNonArchivedCount,
        totalRedemptions,
        totalDiscountGranted: Number(totalDiscountGranted.toFixed(2)),
        maxPromotions: entitlements.limits.maxPromotions,
        planName: entitlements.subscription.planName,
        currency: restaurant?.currency || "USD",
        canManage: hasPermission(membership.role, "promotions.manage"),
      },
      categories,
      menuItems: menuItems.map((m) => ({
        id: m.id,
        name: m.name,
        price: Number(m.price),
        categoryId: m.categoryId,
      })),
    });
  } catch (error) {
    console.error("GET /api/v1/promotions error:", error);
    return NextResponse.json(
      { error: "Failed to load promotions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedRestaurantId = req.nextUrl.searchParams.get("restaurantId");
    const membership = requestedRestaurantId
      ? user.restaurants.find((r) => r.restaurantId === requestedRestaurantId)
      : user.restaurants[0];

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to this restaurant." },
        { status: 403 }
      );
    }

    if (!hasPermission(membership.role, "promotions.manage")) {
      return NextResponse.json(
        { error: "Forbidden: Only Owners and Managers can create promotions." },
        { status: 403 }
      );
    }

    const restaurantId = membership.restaurantId;
    const body = await req.json();
    const parsed = createPromotionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Validation failed",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Enforce SaaS subscription active state & plan limits when creating an ACTIVE promotion
    try {
      if (data.status === "ACTIVE") {
        await assertEntitlement(restaurantId, "ADD_PROMOTION");
      } else {
        const ent = await getRestaurantEntitlements(restaurantId);
        if (!ent.subscription.isOperational) {
          return NextResponse.json(
            {
              error: `Your restaurant subscription is currently ${ent.subscription.status}. Creating new promotions requires an active plan.`,
              code: "SUBSCRIPTION_INACTIVE",
            },
            { status: 403 }
          );
        }
      }
    } catch (err) {
      if (err instanceof BillingRuleError) {
        return NextResponse.json(
          { error: err.message, code: err.code, details: err.details },
          { status: err.status }
        );
      }
      throw err;
    }

    // Verify uniqueness of coupon code within the restaurant
    const existingCode = await prisma.promotion.findUnique({
      where: {
        restaurantId_code: {
          restaurantId,
          code: data.code,
        },
      },
    });

    if (existingCode) {
      return NextResponse.json(
        {
          error: `A promotion with code "${data.code}" already exists in your restaurant.`,
          code: "COUPON_CODE_EXISTS",
        },
        { status: 409 }
      );
    }

    // Verify category or item scoping strictly belongs to this restaurant (anti-IDOR)
    let validCategoryIds: string[] = [];
    let validItemIds: string[] = [];

    if (data.appliesTo === "CATEGORIES") {
      const dbCats = await prisma.menuCategory.findMany({
        where: {
          restaurantId,
          id: { in: data.eligibleCategoryIds },
        },
        select: { id: true },
      });
      if (dbCats.length !== new Set(data.eligibleCategoryIds).size) {
        return NextResponse.json(
          {
            error: "One or more selected categories do not belong to your restaurant.",
            code: "INVALID_CATEGORY_SCOPE",
          },
          { status: 400 }
        );
      }
      validCategoryIds = dbCats.map((c) => c.id);
    } else if (data.appliesTo === "ITEMS") {
      const dbItems = await prisma.menuItem.findMany({
        where: {
          restaurantId,
          id: { in: data.eligibleItemIds },
        },
        select: { id: true },
      });
      if (dbItems.length !== new Set(data.eligibleItemIds).size) {
        return NextResponse.json(
          {
            error: "One or more selected menu items do not belong to your restaurant.",
            code: "INVALID_ITEM_SCOPE",
          },
          { status: 400 }
        );
      }
      validItemIds = dbItems.map((i) => i.id);
    }

    const created = await prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.create({
        data: {
          restaurantId,
          code: data.code,
          name: data.name,
          description: data.description,
          discountType: data.discountType,
          discountValue: data.discountValue,
          minOrderSubtotal: data.minOrderSubtotal,
          maxDiscountAmount: data.maxDiscountAmount,
          appliesTo: data.appliesTo,
          eligibleCategoryIds: JSON.stringify(validCategoryIds),
          eligibleItemIds: JSON.stringify(validItemIds),
          firstOrderOnly: data.firstOrderOnly,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          maxUsesTotal: data.maxUsesTotal,
          maxUsesPerCustomer: data.maxUsesPerCustomer,
          status: data.status,
          createdByUserId: user.id,
        },
      });

      await tx.staffAuditLog.create({
        data: {
          restaurantId,
          actorId: user.id,
          action: "PROMOTION_CREATED",
          details: JSON.stringify({
            promotionId: promo.id,
            code: promo.code,
            discountType: promo.discountType,
            discountValue: Number(promo.discountValue),
            status: promo.status,
          }),
        },
      });

      return promo;
    });

    return NextResponse.json(
      {
        promotion: {
          ...serializePromotion(created),
          appliedRedemptions: 0,
          totalDiscountGranted: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/v1/promotions error:", error);
    return NextResponse.json(
      { error: "Failed to create promotion" },
      { status: 500 }
    );
  }
}
