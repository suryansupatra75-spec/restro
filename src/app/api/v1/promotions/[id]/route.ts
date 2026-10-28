import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { updatePromotionSchema } from "@/lib/validations/promotion";
import {
  parseStringArrayJson,
  serializePromotion,
} from "@/lib/promotions/service";
import {
  assertEntitlement,
  BillingRuleError,
} from "@/lib/billing/service";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
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

    const promotion = await prisma.promotion.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        redemptions: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentStatus: true,
                subtotal: true,
                discountAmount: true,
                tax: true,
                total: true,
                createdAt: true,
                table: {
                  select: { name: true, number: true },
                },
              },
            },
          },
        },
      },
    });

    if (!promotion) {
      return NextResponse.json(
        { error: "Promotion not found" },
        { status: 404 }
      );
    }

    const appliedRedemptions = promotion.redemptions.filter(
      (r) => r.status === "APPLIED"
    );
    const totalDiscountGranted = appliedRedemptions.reduce(
      (sum, r) => sum + Number(r.discountAmount),
      0
    );

    return NextResponse.json({
      promotion: {
        ...serializePromotion(promotion),
        appliedRedemptions: appliedRedemptions.length,
        totalDiscountGranted: Number(totalDiscountGranted.toFixed(2)),
      },
      redemptions: promotion.redemptions.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        orderNumber: r.order?.orderNumber || "Unknown",
        orderStatus: r.order?.status || "UNKNOWN",
        paymentStatus: r.order?.paymentStatus || "UNKNOWN",
        tableName: r.order?.table?.name || "Table",
        codeSnapshot: r.codeSnapshot,
        nameSnapshot: r.nameSnapshot,
        discountTypeSnapshot: r.discountTypeSnapshot,
        discountValueSnapshot: Number(r.discountValueSnapshot),
        eligibleSubtotal: Number(r.eligibleSubtotal),
        discountAmount: Number(r.discountAmount),
        orderTotal: r.order ? Number(r.order.total) : 0,
        status: r.status,
        releasedReason: r.releasedReason,
        releasedAt: r.releasedAt ? r.releasedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/v1/promotions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load promotion details" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
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
        { error: "Forbidden: Only Owners and Managers can update promotions." },
        { status: 403 }
      );
    }

    const restaurantId = membership.restaurantId;

    const existing = await prisma.promotion.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Promotion not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updatePromotionSchema.safeParse(body);

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

    // If re-enabling a DISABLED or ARCHIVED promotion to ACTIVE, enforce plan limit & active subscription
    if (data.status === "ACTIVE" && existing.status !== "ACTIVE") {
      try {
        await assertEntitlement(restaurantId, "ADD_PROMOTION");
      } catch (err) {
        if (err instanceof BillingRuleError) {
          return NextResponse.json(
            { error: err.message, code: err.code, details: err.details },
            { status: err.status }
          );
        }
        throw err;
      }
    }

    const nextDiscountType = (data.discountType ?? existing.discountType) as
      | "PERCENTAGE"
      | "FIXED";
    const nextDiscountValue =
      data.discountValue !== undefined
        ? data.discountValue
        : Number(existing.discountValue);

    if (nextDiscountType === "PERCENTAGE" && nextDiscountValue > 100) {
      return NextResponse.json(
        {
          error: "Percentage discount cannot exceed 100%.",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const nextStartsAt =
      data.startsAt !== undefined ? data.startsAt : existing.startsAt;
    const nextEndsAt =
      data.endsAt !== undefined ? data.endsAt : existing.endsAt;

    if (
      nextStartsAt &&
      nextEndsAt &&
      nextEndsAt.getTime() <= nextStartsAt.getTime()
    ) {
      return NextResponse.json(
        {
          error: "End date/time must be after start date/time.",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const nextAppliesTo = (data.appliesTo ?? existing.appliesTo) as
      | "ALL"
      | "CATEGORIES"
      | "ITEMS";
    const nextCatIds =
      data.eligibleCategoryIds !== undefined
        ? data.eligibleCategoryIds
        : parseStringArrayJson(existing.eligibleCategoryIds);
    const nextItemIds =
      data.eligibleItemIds !== undefined
        ? data.eligibleItemIds
        : parseStringArrayJson(existing.eligibleItemIds);

    let validCategoryIds: string[] = [];
    let validItemIds: string[] = [];

    if (nextAppliesTo === "CATEGORIES") {
      if (nextCatIds.length === 0) {
        return NextResponse.json(
          {
            error: "Select at least one eligible menu category.",
            code: "VALIDATION_ERROR",
          },
          { status: 400 }
        );
      }
      const dbCats = await prisma.menuCategory.findMany({
        where: {
          restaurantId,
          id: { in: nextCatIds },
        },
        select: { id: true },
      });
      if (dbCats.length !== new Set(nextCatIds).size) {
        return NextResponse.json(
          {
            error: "One or more selected categories do not belong to your restaurant.",
            code: "INVALID_CATEGORY_SCOPE",
          },
          { status: 400 }
        );
      }
      validCategoryIds = dbCats.map((c) => c.id);
    } else if (nextAppliesTo === "ITEMS") {
      if (nextItemIds.length === 0) {
        return NextResponse.json(
          {
            error: "Select at least one eligible menu item.",
            code: "VALIDATION_ERROR",
          },
          { status: 400 }
        );
      }
      const dbItems = await prisma.menuItem.findMany({
        where: {
          restaurantId,
          id: { in: nextItemIds },
        },
        select: { id: true },
      });
      if (dbItems.length !== new Set(nextItemIds).size) {
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

    if (data.code && data.code !== existing.code) {
      const duplicate = await prisma.promotion.findUnique({
        where: {
          restaurantId_code: {
            restaurantId,
            code: data.code,
          },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            error: `A promotion with code "${data.code}" already exists in your restaurant.`,
            code: "COUPON_CODE_EXISTS",
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.update({
        where: { id: existing.id },
        data: {
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.discountType !== undefined
            ? { discountType: data.discountType }
            : {}),
          ...(data.discountValue !== undefined
            ? { discountValue: data.discountValue }
            : {}),
          ...(data.minOrderSubtotal !== undefined
            ? { minOrderSubtotal: data.minOrderSubtotal }
            : {}),
          ...(data.maxDiscountAmount !== undefined
            ? { maxDiscountAmount: data.maxDiscountAmount }
            : {}),
          appliesTo: nextAppliesTo,
          eligibleCategoryIds: JSON.stringify(validCategoryIds),
          eligibleItemIds: JSON.stringify(validItemIds),
          ...(data.firstOrderOnly !== undefined
            ? { firstOrderOnly: data.firstOrderOnly }
            : {}),
          ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
          ...(data.maxUsesTotal !== undefined
            ? { maxUsesTotal: data.maxUsesTotal }
            : {}),
          ...(data.maxUsesPerCustomer !== undefined
            ? { maxUsesPerCustomer: data.maxUsesPerCustomer }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      });

      await tx.staffAuditLog.create({
        data: {
          restaurantId,
          actorId: user.id,
          action: "PROMOTION_UPDATED",
          details: JSON.stringify({
            promotionId: promo.id,
            code: promo.code,
            status: promo.status,
          }),
        },
      });

      return promo;
    });

    return NextResponse.json({
      promotion: serializePromotion(updated),
    });
  } catch (error) {
    console.error("PATCH /api/v1/promotions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update promotion" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.restaurants.length === 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
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
        { error: "Forbidden: Only Owners and Managers can archive promotions." },
        { status: 403 }
      );
    }

    const restaurantId = membership.restaurantId;

    const existing = await prisma.promotion.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Promotion not found" },
        { status: 404 }
      );
    }

    const archived = await prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.update({
        where: { id: existing.id },
        data: { status: "ARCHIVED" },
      });

      await tx.staffAuditLog.create({
        data: {
          restaurantId,
          actorId: user.id,
          action: "PROMOTION_ARCHIVED",
          details: JSON.stringify({
            promotionId: promo.id,
            code: promo.code,
          }),
        },
      });

      return promo;
    });

    return NextResponse.json({
      promotion: serializePromotion(archived),
    });
  } catch (error) {
    console.error("DELETE /api/v1/promotions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to archive promotion" },
      { status: 500 }
    );
  }
}
