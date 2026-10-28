import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { loyaltyRewardSchema } from "@/lib/validations/loyalty";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role, user } = auth.context;

    if (!hasPermission(role, "loyalty.manage")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to manage loyalty rewards" },
        { status: 403 }
      );
    }

    const { id } = await props.params;

    // Verify ownership (Anti-IDOR)
    const existing = await prisma.loyaltyReward.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Reward not found" }, { status: 404 });
    }

    const body = await req.json();
    const partialSchema = loyaltyRewardSchema.partial();
    const parsed = partialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify freeMenuItemId if provided
    if (data.freeMenuItemId) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: data.freeMenuItemId, restaurantId },
      });
      if (!menuItem) {
        return NextResponse.json(
          { error: "Free menu item not found in this restaurant", code: "INVALID_MENU_ITEM_SCOPE" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.loyaltyReward.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.pointsCost !== undefined ? { pointsCost: data.pointsCost } : {}),
        ...(data.rewardType !== undefined ? { rewardType: data.rewardType } : {}),
        ...(data.discountType !== undefined ? { discountType: data.discountType } : {}),
        ...(data.discountValue !== undefined ? { discountValue: data.discountValue } : {}),
        ...(data.freeMenuItemId !== undefined ? { freeMenuItemId: data.freeMenuItemId } : {}),
        ...(data.minOrderSubtotal !== undefined ? { minOrderSubtotal: data.minOrderSubtotal } : {}),
        ...(data.maxRedemptionsTotal !== undefined ? { maxRedemptionsTotal: data.maxRedemptionsTotal } : {}),
        ...(data.maxRedemptionsPerCustomer !== undefined ? { maxRedemptionsPerCustomer: data.maxRedemptionsPerCustomer } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt ? new Date(data.endsAt) : null } : {}),
      },
    });

    await prisma.staffAuditLog.create({
      data: {
        restaurantId,
        actorId: user.id,
        action: "LOYALTY_REWARD_UPDATED",
        details: JSON.stringify({ rewardId: id, updates: data }),
      },
    }).catch(() => {});

    return NextResponse.json({ reward: updated });
  } catch (error: unknown) {
    console.error("PATCH /api/v1/loyalty/rewards/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId, role, user } = auth.context;

    if (!hasPermission(role, "loyalty.manage")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to archive loyalty rewards" },
        { status: 403 }
      );
    }

    const { id } = await props.params;

    const existing = await prisma.loyaltyReward.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Reward not found" }, { status: 404 });
    }

    // Soft-archive by marking inactive
    const archived = await prisma.loyaltyReward.update({
      where: { id },
      data: { isActive: false },
    });

    await prisma.staffAuditLog.create({
      data: {
        restaurantId,
        actorId: user.id,
        action: "LOYALTY_REWARD_ARCHIVED",
        details: JSON.stringify({ rewardId: id, name: existing.name }),
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, reward: archived });
  } catch (error: unknown) {
    console.error("DELETE /api/v1/loyalty/rewards/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
