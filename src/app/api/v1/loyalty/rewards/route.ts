import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { loyaltyRewardSchema } from "@/lib/validations/loyalty";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role } = auth.context;

    if (!hasPermission(role, "loyalty.view")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to view loyalty rewards" },
        { status: 403 }
      );
    }

    const rewards = await prisma.loyaltyReward.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: "desc" }, { pointsCost: "asc" }],
      include: {
        freeMenuItem: { select: { id: true, name: true, price: true } },
      },
    });

    return NextResponse.json({
      rewards: rewards.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pointsCost: r.pointsCost,
        rewardType: r.rewardType,
        discountType: r.discountType,
        discountValue: Number(r.discountValue),
        freeMenuItemId: r.freeMenuItemId,
        freeMenuItem: r.freeMenuItem
          ? { id: r.freeMenuItem.id, name: r.freeMenuItem.name, price: Number(r.freeMenuItem.price) }
          : null,
        minOrderSubtotal: Number(r.minOrderSubtotal),
        maxRedemptionsTotal: r.maxRedemptionsTotal,
        currentRedemptions: r.currentRedemptions,
        maxRedemptionsPerCustomer: r.maxRedemptionsPerCustomer,
        isActive: r.isActive,
        startsAt: r.startsAt?.toISOString() || null,
        endsAt: r.endsAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error("GET /api/v1/loyalty/rewards error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role, user } = auth.context;

    if (!hasPermission(role, "loyalty.manage")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to create loyalty rewards" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = loyaltyRewardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      pointsCost,
      rewardType,
      discountType,
      discountValue,
      freeMenuItemId,
      minOrderSubtotal,
      maxRedemptionsTotal,
      maxRedemptionsPerCustomer,
      isActive,
      startsAt,
      endsAt,
    } = parsed.data;

    // Verify freeMenuItem belongs to same restaurant (Anti-IDOR)
    if (freeMenuItemId) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: freeMenuItemId, restaurantId },
      });
      if (!menuItem) {
        return NextResponse.json(
          { error: "Free menu item not found in this restaurant", code: "INVALID_MENU_ITEM_SCOPE" },
          { status: 400 }
        );
      }
    }

    const reward = await prisma.loyaltyReward.create({
      data: {
        restaurantId,
        name,
        description: description || null,
        pointsCost,
        rewardType,
        discountType,
        discountValue,
        freeMenuItemId: freeMenuItemId || null,
        minOrderSubtotal,
        maxRedemptionsTotal: maxRedemptionsTotal ?? null,
        maxRedemptionsPerCustomer: maxRedemptionsPerCustomer ?? null,
        isActive: isActive !== false,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
      },
    });

    await prisma.staffAuditLog.create({
      data: {
        restaurantId,
        actorId: user.id,
        action: "LOYALTY_REWARD_CREATED",
        details: JSON.stringify({ rewardId: reward.id, name: reward.name, pointsCost }),
      },
    }).catch(() => {});

    return NextResponse.json({ reward }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/v1/loyalty/rewards error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
