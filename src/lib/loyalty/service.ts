import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  LoyaltyProgramInput,
  LoyaltyRewardInput,
  LoyaltyManualAdjustmentInput,
} from "@/lib/validations/loyalty";

export class LoyaltyRuleError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LoyaltyRuleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Retrieves the restaurant's loyalty program configuration,
 * or lazily initializes a default program if one does not exist.
 */
export async function getOrCreateLoyaltyProgram(restaurantId: string) {
  let program = await prisma.loyaltyProgram.findUnique({
    where: { restaurantId },
  });

  if (!program) {
    program = await prisma.loyaltyProgram.create({
      data: {
        restaurantId,
        isEnabled: true,
        pointsPerCurrencyUnit: 1.0,
        minOrderSubtotalForEarning: 0.0,
        redemptionRate: 0.05,
        minRedemptionPoints: 50,
        redemptionStepPoints: 10,
        maxBillPercentagePayable: 50,
        pointsExpiryDays: null,
        eligibleOrderState: "COMPLETED",
      },
    });
  }

  return program;
}

/**
 * Updates a restaurant's loyalty program settings.
 */
export async function updateLoyaltyProgram(
  restaurantId: string,
  input: LoyaltyProgramInput,
  actorUserId: string
) {
  const existing = await getOrCreateLoyaltyProgram(restaurantId);

  const updated = await prisma.loyaltyProgram.update({
    where: { id: existing.id },
    data: {
      isEnabled: input.isEnabled,
      pointsPerCurrencyUnit: input.pointsPerCurrencyUnit,
      minOrderSubtotalForEarning: input.minOrderSubtotalForEarning,
      redemptionRate: input.redemptionRate,
      minRedemptionPoints: input.minRedemptionPoints,
      redemptionStepPoints: input.redemptionStepPoints,
      maxBillPercentagePayable: input.maxBillPercentagePayable,
      pointsExpiryDays: input.pointsExpiryDays ?? null,
      eligibleOrderState: input.eligibleOrderState,
    },
  });

  // Record audit log
  await prisma.staffAuditLog.create({
    data: {
      restaurantId,
      actorId: actorUserId,
      action: "LOYALTY_PROGRAM_UPDATED",
      details: JSON.stringify({
        isEnabled: updated.isEnabled,
        pointsPerCurrencyUnit: updated.pointsPerCurrencyUnit,
        redemptionRate: Number(updated.redemptionRate),
      }),
    },
  }).catch(() => {});

  return updated;
}

/**
 * Atomically retrieves or creates a customer's loyalty account.
 */
export async function getOrCreateCustomerLoyaltyAccount(
  restaurantId: string,
  customerId: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx || prisma;
  let account = await db.customerLoyaltyAccount.findUnique({
    where: { customerId },
  });

  if (!account) {
    account = await db.customerLoyaltyAccount.create({
      data: {
        restaurantId,
        customerId,
        pointsBalance: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
      },
    });
  }

  return account;
}

/**
 * Public lookup or CRM view for a customer's loyalty summary.
 */
export async function getCustomerLoyaltySummary(params: {
  restaurantId: string;
  customerId?: string;
  phone?: string;
  email?: string;
}) {
  const { restaurantId, customerId, phone, email } = params;
  const program = await getOrCreateLoyaltyProgram(restaurantId);

  let customer = null;
  if (customerId) {
    customer = await prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
    });
  } else if (phone || email) {
    const orConditions: Prisma.CustomerWhereInput[] = [];
    if (phone) orConditions.push({ phone: phone.trim() });
    if (email) orConditions.push({ email: email.trim().toLowerCase() });
    customer = await prisma.customer.findFirst({
      where: { restaurantId, OR: orConditions },
    });
  }

  if (!customer) {
    return {
      isEnrolled: false,
      programEnabled: program.isEnabled,
      customer: null,
      account: null,
      pointsBalance: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
      monetaryValue: 0,
      program: {
        pointsPerCurrencyUnit: program.pointsPerCurrencyUnit,
        redemptionRate: Number(program.redemptionRate),
        minRedemptionPoints: program.minRedemptionPoints,
        redemptionStepPoints: program.redemptionStepPoints,
        maxBillPercentagePayable: program.maxBillPercentagePayable,
      },
      availableRewards: [],
      recentLedger: [],
    };
  }

  const account = await getOrCreateCustomerLoyaltyAccount(restaurantId, customer.id);
  const monetaryValue = Math.round(account.pointsBalance * Number(program.redemptionRate) * 100) / 100;

  const now = new Date();
  const availableRewards = await prisma.loyaltyReward.findMany({
    where: {
      restaurantId,
      isActive: true,
      pointsCost: { lte: account.pointsBalance },
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    take: 10,
    orderBy: { pointsCost: "asc" },
  });

  const recentLedger = await prisma.loyaltyLedgerEntry.findMany({
    where: { restaurantId, customerId: customer.id },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  return {
    isEnrolled: true,
    programEnabled: program.isEnabled,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    },
    account: {
      id: account.id,
      pointsBalance: account.pointsBalance,
      lifetimeEarned: account.lifetimeEarned,
      lifetimeRedeemed: account.lifetimeRedeemed,
    },
    pointsBalance: account.pointsBalance,
    lifetimeEarned: account.lifetimeEarned,
    lifetimeRedeemed: account.lifetimeRedeemed,
    monetaryValue,
    program: {
      pointsPerCurrencyUnit: program.pointsPerCurrencyUnit,
      redemptionRate: Number(program.redemptionRate),
      minRedemptionPoints: program.minRedemptionPoints,
      redemptionStepPoints: program.redemptionStepPoints,
      maxBillPercentagePayable: program.maxBillPercentagePayable,
    },
    availableRewards: availableRewards.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      pointsCost: r.pointsCost,
      rewardType: r.rewardType,
      discountType: r.discountType,
      discountValue: Number(r.discountValue),
      minOrderSubtotal: Number(r.minOrderSubtotal),
    })),
    recentLedger: recentLedger.map((l) => ({
      id: l.id,
      type: l.type,
      points: l.points,
      balanceAfter: l.balanceAfter,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

/**
 * Server-authoritative calculation of loyalty discount at checkout,
 * correctly stacked with Phase 18 coupons to prevent negative totals or double-discounting.
 */
export async function evaluateLoyaltyRedemption(params: {
  restaurantId: string;
  customerId: string;
  cartSubtotal: number; // Raw item subtotal before any discounts
  couponDiscountAmount?: number; // Pre-calculated discount from coupon if any
  pointsToRedeem?: number;
  rewardId?: string;
}) {
  const {
    restaurantId,
    customerId,
    cartSubtotal,
    couponDiscountAmount = 0,
    pointsToRedeem = 0,
    rewardId,
  } = params;

  const program = await getOrCreateLoyaltyProgram(restaurantId);

  // If program is disabled or no loyalty redemption requested
  if (!program.isEnabled || (!pointsToRedeem && !rewardId)) {
    return {
      loyaltyApplied: false,
      loyaltyPointsRedeemed: 0,
      loyaltyDiscountAmount: 0,
      rewardId: null,
      rewardName: null,
      reason: !program.isEnabled ? "Loyalty program is currently disabled." : null,
    };
  }

  const account = await getOrCreateCustomerLoyaltyAccount(restaurantId, customerId);

  // Post-coupon food subtotal available for further discount
  const netSubtotal = Math.max(0, Math.round((cartSubtotal - couponDiscountAmount) * 100) / 100);

  if (netSubtotal <= 0) {
    return {
      loyaltyApplied: false,
      loyaltyPointsRedeemed: 0,
      loyaltyDiscountAmount: 0,
      rewardId: null,
      rewardName: null,
      reason: "Cart is fully covered by coupon discount.",
    };
  }

  // 1. Reward-based redemption
  if (rewardId) {
    const reward = await prisma.loyaltyReward.findFirst({
      where: { id: rewardId, restaurantId, isActive: true },
    });

    if (!reward) {
      throw new LoyaltyRuleError("REWARD_INVALID", "Selected loyalty reward is not valid or no longer active.", 400);
    }

    const now = new Date();
    if (reward.startsAt && now < reward.startsAt) {
      throw new LoyaltyRuleError("REWARD_NOT_STARTED", "Selected loyalty reward is not active yet.", 400);
    }
    if (reward.endsAt && now > reward.endsAt) {
      throw new LoyaltyRuleError("REWARD_EXPIRED", "Selected loyalty reward has expired.", 400);
    }

    if (reward.maxRedemptionsTotal !== null && reward.currentRedemptions >= reward.maxRedemptionsTotal) {
      throw new LoyaltyRuleError("REWARD_LIMIT_REACHED", "Selected loyalty reward has reached its maximum total redemptions.", 400);
    }

    if (Number(reward.minOrderSubtotal) > 0 && cartSubtotal < Number(reward.minOrderSubtotal)) {
      throw new LoyaltyRuleError(
        "REWARD_MIN_SUBTOTAL_NOT_MET",
        `Order subtotal must be at least $${Number(reward.minOrderSubtotal).toFixed(2)} to use this reward.`,
        400
      );
    }

    if (account.pointsBalance < reward.pointsCost) {
      throw new LoyaltyRuleError(
        "INSUFFICIENT_LOYALTY_POINTS",
        `You have ${account.pointsBalance} points, but this reward requires ${reward.pointsCost} points.`,
        400
      );
    }

    let calculatedDiscount = 0;
    if (reward.discountType === "PERCENTAGE") {
      calculatedDiscount = Math.round((netSubtotal * Number(reward.discountValue)) / 100 * 100) / 100;
    } else {
      // FIXED discount
      calculatedDiscount = Number(reward.discountValue);
    }

    const finalLoyaltyDiscount = Math.min(calculatedDiscount, netSubtotal);

    return {
      loyaltyApplied: true,
      loyaltyPointsRedeemed: reward.pointsCost,
      loyaltyDiscountAmount: Math.round(finalLoyaltyDiscount * 100) / 100,
      rewardId: reward.id,
      rewardName: reward.name,
      reason: null,
    };
  }

  // 2. Points-based redemption
  if (pointsToRedeem > 0) {
    if (account.pointsBalance < pointsToRedeem) {
      throw new LoyaltyRuleError(
        "INSUFFICIENT_LOYALTY_POINTS",
        `You requested to redeem ${pointsToRedeem} points, but your current balance is ${account.pointsBalance} points.`,
        400
      );
    }

    if (pointsToRedeem < program.minRedemptionPoints) {
      throw new LoyaltyRuleError(
        "MIN_REDEMPTION_POINTS_NOT_MET",
        `Minimum redemption is ${program.minRedemptionPoints} points.`,
        400
      );
    }

    const step = program.redemptionStepPoints;
    if (step > 1 && pointsToRedeem % step !== 0) {
      throw new LoyaltyRuleError(
        "INVALID_REDEMPTION_STEP",
        `Points must be redeemed in increments of ${step} points.`,
        400
      );
    }

    // Maximum payable bill amount by percentage
    const maxPayableFromPoints = Math.round(
      (netSubtotal * (program.maxBillPercentagePayable / 100)) * 100
    ) / 100;

    const rawValue = Math.round(pointsToRedeem * Number(program.redemptionRate) * 100) / 100;
    const finalLoyaltyDiscount = Math.min(rawValue, maxPayableFromPoints, netSubtotal);

    return {
      loyaltyApplied: true,
      loyaltyPointsRedeemed: pointsToRedeem,
      loyaltyDiscountAmount: Math.round(finalLoyaltyDiscount * 100) / 100,
      rewardId: null,
      rewardName: null,
      reason: null,
    };
  }

  return {
    loyaltyApplied: false,
    loyaltyPointsRedeemed: 0,
    loyaltyDiscountAmount: 0,
    rewardId: null,
    rewardName: null,
    reason: null,
  };
}

/**
 * Atomically reserves loyalty points inside an active transaction before creating the order.
 * Prevents double-spending and concurrency race conditions.
 */
export async function reserveLoyaltyPointsInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: string;
    customerId: string;
    pointsToRedeem: number;
    orderId: string;
    orderNumber: string;
    rewardId?: string | null;
  }
) {
  const {
    restaurantId,
    customerId,
    pointsToRedeem,
    orderId,
    orderNumber,
    rewardId,
  } = params;

  if (pointsToRedeem <= 0) return null;

  // Conditional atomic update: balance MUST be >= pointsToRedeem
  const updated = await tx.customerLoyaltyAccount.updateMany({
    where: {
      restaurantId,
      customerId,
      pointsBalance: { gte: pointsToRedeem },
    },
    data: {
      pointsBalance: { decrement: pointsToRedeem },
      lifetimeRedeemed: { increment: pointsToRedeem },
    },
  });

  if (updated.count === 0) {
    throw new LoyaltyRuleError(
      "INSUFFICIENT_LOYALTY_POINTS",
      "Insufficient points balance or concurrent redemption conflict. Points could not be redeemed.",
      400
    );
  }

  // Fetch updated balance for auditable ledger entry
  const account = await tx.customerLoyaltyAccount.findUnique({
    where: { customerId },
    select: { id: true, pointsBalance: true },
  });

  const balanceAfter = account ? account.pointsBalance : 0;

  // Append immutable ledger entry with unique idempotency key
  const ledger = await tx.loyaltyLedgerEntry.create({
    data: {
      restaurantId,
      customerId,
      accountId: account?.id,
      orderId,
      rewardId: rewardId || null,
      type: "REDEEMED",
      points: -pointsToRedeem,
      balanceAfter,
      reason: `Points redeemed on order #${orderNumber}`,
      actorType: "CUSTOMER",
      idempotencyKey: `redeem_order_${orderId}`,
      metadata: JSON.stringify({ orderId, orderNumber, rewardId }),
    },
  });

  // If reward was used, increment reward redemption count
  if (rewardId) {
    await tx.loyaltyReward.update({
      where: { id: rewardId },
      data: { currentRedemptions: { increment: 1 } },
    }).catch(() => {});
  }

  return ledger;
}

/**
 * Awards loyalty points to the customer when the order reaches the eligible state (e.g. COMPLETED).
 * Strictly idempotent: will never double-award points if called repeatedly.
 */
export async function awardLoyaltyPointsForOrder(params: {
  restaurantId: string;
  orderId: string;
  actorUserId?: string;
}) {
  const { restaurantId, orderId, actorUserId } = params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      restaurantId: true,
      orderNumber: true,
      customerId: true,
      subtotal: true,
      discountAmount: true,
      loyaltyDiscountAmount: true,
      loyaltyPointsEarned: true,
    },
  });

  if (!order || !order.customerId || order.restaurantId !== restaurantId) {
    return null;
  }

  const program = await getOrCreateLoyaltyProgram(restaurantId);
  if (!program.isEnabled) return null;

  // Idempotency check: if points were already awarded for this order, skip!
  const idempotencyKey = `earn_order_${order.id}`;
  const existingLedger = await prisma.loyaltyLedgerEntry.findUnique({
    where: { idempotencyKey },
  });
  if (existingLedger) {
    return existingLedger;
  }

  // Calculate eligible food spend (subtotal minus discounts)
  const netSpend = Math.max(
    0,
    Number(order.subtotal) - Number(order.discountAmount) - Number(order.loyaltyDiscountAmount)
  );

  if (netSpend < Number(program.minOrderSubtotalForEarning)) {
    return null;
  }

  const pointsToAward = Math.floor(netSpend * program.pointsPerCurrencyUnit);
  if (pointsToAward <= 0) return null;

  return await prisma.$transaction(async (tx) => {
    // 1. Get or create account inside tx
    let account = await tx.customerLoyaltyAccount.findUnique({
      where: { customerId: order.customerId! },
    });

    if (!account) {
      account = await tx.customerLoyaltyAccount.create({
        data: {
          restaurantId,
          customerId: order.customerId!,
          pointsBalance: 0,
          lifetimeEarned: 0,
          lifetimeRedeemed: 0,
        },
      });
    }

    // 2. Increment points balance and lifetime earned
    const updatedAccount = await tx.customerLoyaltyAccount.update({
      where: { id: account.id },
      data: {
        pointsBalance: { increment: pointsToAward },
        lifetimeEarned: { increment: pointsToAward },
      },
    });

    // 3. Create auditable ledger row
    const ledger = await tx.loyaltyLedgerEntry.create({
      data: {
        restaurantId,
        customerId: order.customerId!,
        accountId: account.id,
        orderId: order.id,
        type: "EARNED",
        points: pointsToAward,
        balanceAfter: updatedAccount.pointsBalance,
        reason: `Points earned from order #${order.orderNumber}`,
        actorId: actorUserId || "SYSTEM",
        actorType: actorUserId ? "STAFF" : "SYSTEM",
        idempotencyKey,
        metadata: JSON.stringify({
          orderId: order.id,
          orderNumber: order.orderNumber,
          netSpend,
          pointsPerUnit: program.pointsPerCurrencyUnit,
        }),
      },
    });

    // 4. Update order snapshot
    await tx.order.update({
      where: { id: order.id },
      data: { loyaltyPointsEarned: pointsToAward },
    });

    return ledger;
  });
}

/**
 * Reverses or refunds loyalty points when an order is CANCELLED or REJECTED.
 * - If points were redeemed on the order, refunds them back to the customer.
 * - If points were already earned on the order, reverses the earned points.
 * Strictly idempotent.
 */
export async function refundOrReverseLoyaltyPointsForOrder(params: {
  restaurantId: string;
  orderId: string;
  reason: string;
  actorUserId?: string;
}) {
  const { restaurantId, orderId, reason, actorUserId } = params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      restaurantId: true,
      orderNumber: true,
      customerId: true,
      loyaltyPointsRedeemed: true,
      loyaltyPointsEarned: true,
      loyaltyRewardId: true,
    },
  });

  if (!order || !order.customerId || order.restaurantId !== restaurantId) {
    return null;
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Refund redeemed points if any
    if (order.loyaltyPointsRedeemed && order.loyaltyPointsRedeemed > 0 && order.customerId) {
      const customerId = order.customerId;
      const refundIdempotencyKey = `refund_order_${order.id}`;
      const existingRefund = await tx.loyaltyLedgerEntry.findUnique({
        where: { idempotencyKey: refundIdempotencyKey },
      });

      if (!existingRefund) {
        const updated = await tx.customerLoyaltyAccount.update({
          where: { customerId },
          data: {
            pointsBalance: { increment: order.loyaltyPointsRedeemed },
            lifetimeRedeemed: { decrement: order.loyaltyPointsRedeemed },
          },
        });

        await tx.loyaltyLedgerEntry.create({
          data: {
            restaurantId,
            customerId,
            accountId: updated.id,
            orderId: order.id,
            rewardId: order.loyaltyRewardId || null,
            type: "REFUNDED",
            points: order.loyaltyPointsRedeemed,
            balanceAfter: updated.pointsBalance,
            reason: `Refunded redeemed points due to: ${reason}`,
            actorId: actorUserId || "SYSTEM",
            actorType: actorUserId ? "STAFF" : "SYSTEM",
            idempotencyKey: refundIdempotencyKey,
          },
        });
      }
    }

    // 2. Reverse awarded points if order was previously completed and earned points
    if (order.loyaltyPointsEarned && order.loyaltyPointsEarned > 0 && order.customerId) {
      const customerId = order.customerId;
      const reverseIdempotencyKey = `reverse_order_${order.id}`;
      const existingReverse = await tx.loyaltyLedgerEntry.findUnique({
        where: { idempotencyKey: reverseIdempotencyKey },
      });

      if (!existingReverse) {
        // Fetch current balance to prevent dropping below 0
        const currentAccount = await tx.customerLoyaltyAccount.findUnique({
          where: { customerId },
        });

        const pointsToReverse = Math.min(
          order.loyaltyPointsEarned,
          currentAccount ? currentAccount.pointsBalance : order.loyaltyPointsEarned
        );

        const updated = await tx.customerLoyaltyAccount.update({
          where: { customerId },
          data: {
            pointsBalance: { decrement: pointsToReverse },
            lifetimeEarned: { decrement: pointsToReverse },
          },
        });

        await tx.loyaltyLedgerEntry.create({
          data: {
            restaurantId,
            customerId,
            accountId: updated.id,
            orderId: order.id,
            type: "ADJUSTED",
            points: -pointsToReverse,
            balanceAfter: updated.pointsBalance,
            reason: `Reversal of earned points due to: ${reason}`,
            actorId: actorUserId || "SYSTEM",
            actorType: actorUserId ? "STAFF" : "SYSTEM",
            idempotencyKey: reverseIdempotencyKey,
          },
        });
      }
    }

    return true;
  });
}

/**
 * Staff manual points adjustment with mandatory audit reason and actor tracking.
 */
export async function performManualLoyaltyAdjustment(
  restaurantId: string,
  input: LoyaltyManualAdjustmentInput,
  actorUserId: string,
  actorName: string
) {
  const { customerId, points, reason } = input;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, restaurantId },
  });

  if (!customer) {
    throw new LoyaltyRuleError("CUSTOMER_NOT_FOUND", "Customer not found in this restaurant.", 404);
  }

  return await prisma.$transaction(async (tx) => {
    let account = await tx.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });

    if (!account) {
      account = await tx.customerLoyaltyAccount.create({
        data: {
          restaurantId,
          customerId,
          pointsBalance: 0,
          lifetimeEarned: 0,
          lifetimeRedeemed: 0,
        },
      });
    }

    // If deducting, prevent negative balance
    if (points < 0 && account.pointsBalance + points < 0) {
      throw new LoyaltyRuleError(
        "INSUFFICIENT_POINTS_FOR_DEDUCTION",
        `Cannot deduct ${Math.abs(points)} points. Customer currently has only ${account.pointsBalance} points.`,
        400
      );
    }

    const updatedAccount = await tx.customerLoyaltyAccount.update({
      where: { id: account.id },
      data: {
        pointsBalance: { increment: points },
        ...(points > 0 ? { lifetimeEarned: { increment: points } } : {}),
      },
    });

    const ledger = await tx.loyaltyLedgerEntry.create({
      data: {
        restaurantId,
        customerId,
        accountId: account.id,
        type: "ADJUSTED",
        points,
        balanceAfter: updatedAccount.pointsBalance,
        reason: `Manual adjustment by ${actorName}: ${reason}`,
        actorId: actorUserId,
        actorType: "STAFF",
        metadata: JSON.stringify({ actorUserId, actorName, reason }),
      },
    });

    await tx.staffAuditLog.create({
      data: {
        restaurantId,
        actorId: actorUserId,
        targetUserId: customerId,
        action: "LOYALTY_POINTS_ADJUSTED",
        details: JSON.stringify({
          customerId,
          pointsDelta: points,
          balanceAfter: updatedAccount.pointsBalance,
          reason,
        }),
      },
    }).catch(() => {});

    return {
      success: true,
      account: updatedAccount,
      ledgerEntry: ledger,
    };
  });
}

/**
 * Retrieves paginated restaurant loyalty ledger with summary metrics.
 */
export async function getRestaurantLoyaltyLedger(params: {
  restaurantId: string;
  page?: number;
  limit?: number;
  type?: string;
  customerId?: string;
}) {
  const { restaurantId, page = 1, limit = 20, type, customerId } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.LoyaltyLedgerEntryWhereInput = {
    restaurantId,
    ...(type ? { type } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [entries, total, program, totalIssuedAgg, totalRedeemedAgg, activeMembers] = await Promise.all([
    prisma.loyaltyLedgerEntry.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        order: { select: { id: true, orderNumber: true, total: true } },
        reward: { select: { id: true, name: true } },
      },
    }),
    prisma.loyaltyLedgerEntry.count({ where }),
    getOrCreateLoyaltyProgram(restaurantId),
    prisma.loyaltyLedgerEntry.aggregate({
      where: { restaurantId, type: "EARNED" },
      _sum: { points: true },
    }),
    prisma.loyaltyLedgerEntry.aggregate({
      where: { restaurantId, type: "REDEEMED" },
      _sum: { points: true },
    }),
    prisma.customerLoyaltyAccount.count({
      where: { restaurantId, pointsBalance: { gt: 0 } },
    }),
  ]);

  const totalPointsIssued = totalIssuedAgg._sum.points || 0;
  const totalPointsRedeemed = Math.abs(totalRedeemedAgg._sum.points || 0);
  const totalOutstandingPoints = Math.max(0, totalPointsIssued - totalPointsRedeemed);
  const estimatedLiability = Math.round(totalOutstandingPoints * Number(program.redemptionRate) * 100) / 100;

  return {
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      points: e.points,
      balanceAfter: e.balanceAfter,
      reason: e.reason,
      actorType: e.actorType,
      createdAt: e.createdAt.toISOString(),
      customer: e.customer,
      order: e.order ? { id: e.order.id, orderNumber: e.order.orderNumber, total: Number(e.order.total) } : null,
      reward: e.reward ? { id: e.reward.id, name: e.reward.name } : null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    metrics: {
      totalPointsIssued,
      totalPointsRedeemed,
      totalOutstandingPoints,
      estimatedLiability,
      activeMembers,
      programEnabled: program.isEnabled,
    },
  };
}
