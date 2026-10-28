import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeCouponCode } from "@/lib/validations/promotion";

export class PromotionRuleError extends Error {
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
    this.name = "PromotionRuleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ============================================================================
// SCOPED BRUTE-FORCE RATE LIMITER FOR PUBLIC COUPON VALIDATION
// ============================================================================
interface RateBucket {
  count: number;
  resetAt: number;
}

const validationBuckets = new Map<string, RateBucket>();
const VALIDATION_WINDOW_MS = 60 * 1000; // 1 minute
const VALIDATION_MAX_ATTEMPTS = 35;

export function checkCouponValidationRateLimit(clientKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const bucket = validationBuckets.get(clientKey);

  if (!bucket || now >= bucket.resetAt) {
    validationBuckets.set(clientKey, {
      count: 1,
      resetAt: now + VALIDATION_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= VALIDATION_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// ============================================================================
// SAFE INTEGER MINOR-UNIT MONEY HELPERS
// ============================================================================
export function toMinor(
  val: number | string | Prisma.Decimal | null | undefined
): number {
  if (val === null || val === undefined) return 0;
  const num = typeof val === "object" && "toNumber" in val ? val.toNumber() : Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromMinor(minor: number): number {
  return Number((minor / 100).toFixed(2));
}

export function parseStringArrayJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

export function normalizeCustomerIdentifier(
  phone?: string | null,
  email?: string | null
): { normalizedPhone: string | null; normalizedEmail: string | null; identifier: string | null } {
  const cleanPhone = phone ? phone.replace(/[^\d+]/g, "").trim() : "";
  const normalizedPhone = cleanPhone.length >= 6 ? cleanPhone : null;
  const cleanEmail = email ? email.trim().toLowerCase() : "";
  const normalizedEmail = cleanEmail.includes("@") ? cleanEmail : null;
  const identifier = normalizedPhone
    ? `phone:${normalizedPhone}`
    : normalizedEmail
    ? `email:${normalizedEmail}`
    : null;

  return { normalizedPhone, normalizedEmail, identifier };
}

export interface CartEvaluationItemInput {
  menuItemId: string;
  quantity: number;
  variantId?: string | null;
  addonIds?: string[];
  specialInstructions?: string | null;
}

export interface EvaluatedOrderLine {
  menuItemId: string;
  categoryId: string;
  name: string;
  basePrice: number;
  unitPrice: number;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  specialInstructions: string | null;
  selectedVariant: {
    variantId: string;
    name: string;
    price: number;
  } | null;
  selectedAddons: Array<{
    addonId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}

export interface CartPromotionEvaluationResult {
  restaurantId: string;
  currency: string;
  appliedTaxPercentage: number;
  subtotalMinor: number;
  eligibleSubtotalMinor: number;
  discountMinor: number;
  discountedSubtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  discountedSubtotal: number;
  tax: number;
  total: number;
  orderLines: EvaluatedOrderLine[];
  customerIdentifier: string | null;
  resolvedCustomerId: string | null;
  promotion: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    discountType: "PERCENTAGE" | "FIXED";
    discountValue: number;
    minOrderSubtotal: number;
    maxDiscountAmount: number | null;
    appliesTo: "ALL" | "CATEGORIES" | "ITEMS";
    maxUsesTotal: number | null;
    maxUsesPerCustomer: number | null;
  } | null;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Authoritative server-side cart and coupon calculation engine.
 * Never trusts client-provided item prices, subtotals, discounts, or totals.
 */
export async function evaluateCartAndPromotion(params: {
  restaurantId: string;
  items: CartEvaluationItemInput[];
  couponCode?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  existingCustomerId?: string | null;
  now?: Date;
  db?: DbClient;
}): Promise<CartPromotionEvaluationResult> {
  const {
    restaurantId,
    items,
    couponCode,
    customerPhone,
    customerEmail,
    existingCustomerId,
    now = new Date(),
    db = prisma,
  } = params;

  if (!items || items.length === 0) {
    throw new PromotionRuleError("EMPTY_CART", "Order must contain at least one item.", 400);
  }

  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      status: true,
      isOrderingEnabled: true,
      taxPercentage: true,
      currency: true,
      allowSpecialInstructions: true,
    },
  });

  if (!restaurant || restaurant.status !== "ACTIVE") {
    throw new PromotionRuleError(
      "RESTAURANT_UNAVAILABLE",
      "This restaurant is not currently accepting orders.",
      403
    );
  }

  const requestedItemIds = Array.from(new Set(items.map((i) => i.menuItemId)));
  const dbMenuItems = await db.menuItem.findMany({
    where: {
      id: { in: requestedItemIds },
      restaurantId,
      status: "ACTIVE",
      isAvailable: true,
    },
    include: {
      variants: { where: { isAvailable: true } },
      addonLinks: {
        include: {
          addon: true,
        },
      },
    },
  });

  const menuItemMap = new Map(dbMenuItems.map((m) => [m.id, m]));

  let subtotalMinor = 0;
  const orderLines: EvaluatedOrderLine[] = [];

  for (const reqItem of items) {
    const dbItem = menuItemMap.get(reqItem.menuItemId);
    if (!dbItem) {
      throw new PromotionRuleError(
        "INVALID_MENU_ITEM",
        `One or more items in your cart are unavailable or do not belong to this restaurant.`,
        400,
        { menuItemId: reqItem.menuItemId }
      );
    }

    const quantity = Math.floor(Number(reqItem.quantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new PromotionRuleError(
        "INVALID_ITEM_QUANTITY",
        `Invalid quantity for item "${dbItem.name}".`,
        400
      );
    }

    let unitPriceMinor = toMinor(dbItem.price);
    let selectedVariant: EvaluatedOrderLine["selectedVariant"] = null;

    if (reqItem.variantId) {
      const dbVariant = dbItem.variants.find((v) => v.id === reqItem.variantId);
      if (!dbVariant) {
        throw new PromotionRuleError(
          "INVALID_ITEM_VARIANT",
          `Selected option for "${dbItem.name}" is unavailable.`,
          400
        );
      }
      const variantPriceMinor = toMinor(dbVariant.price);
      unitPriceMinor += variantPriceMinor;
      selectedVariant = {
        variantId: dbVariant.id,
        name: dbVariant.name,
        price: fromMinor(variantPriceMinor),
      };
    }

    const selectedAddons: EvaluatedOrderLine["selectedAddons"] = [];
    if (reqItem.addonIds && reqItem.addonIds.length > 0) {
      const uniqueAddonIds = Array.from(new Set(reqItem.addonIds));
      for (const addonId of uniqueAddonIds) {
        const link = dbItem.addonLinks.find(
          (l) => l.addonId === addonId && l.addon.isAvailable
        );
        if (!link) {
          throw new PromotionRuleError(
            "INVALID_ITEM_ADDON",
            `Selected add-on for "${dbItem.name}" is invalid or unavailable.`,
            400
          );
        }
        const addonMinor = toMinor(link.addon.price);
        unitPriceMinor += addonMinor;
        selectedAddons.push({
          addonId: link.addon.id,
          name: link.addon.name,
          price: fromMinor(addonMinor),
          quantity: 1,
        });
      }
    }

    const lineTotalMinor = unitPriceMinor * quantity;
    subtotalMinor += lineTotalMinor;

    const sanitizedInstructions =
      restaurant.allowSpecialInstructions && reqItem.specialInstructions
        ? reqItem.specialInstructions.trim().slice(0, 500) || null
        : null;

    orderLines.push({
      menuItemId: dbItem.id,
      categoryId: dbItem.categoryId,
      name: dbItem.name,
      basePrice: fromMinor(toMinor(dbItem.price)),
      unitPrice: fromMinor(unitPriceMinor),
      unitPriceMinor,
      quantity,
      lineTotalMinor,
      specialInstructions: sanitizedInstructions,
      selectedVariant,
      selectedAddons,
    });
  }

  const { normalizedPhone, normalizedEmail, identifier } = normalizeCustomerIdentifier(
    customerPhone,
    customerEmail
  );

  let resolvedCustomerId: string | null = existingCustomerId || null;

  // Evaluate coupon if provided
  const trimmedCoupon = couponCode ? normalizeCouponCode(couponCode) : "";
  let eligibleSubtotalMinor = subtotalMinor;
  let discountMinor = 0;
  let appliedPromotion: CartPromotionEvaluationResult["promotion"] = null;

  if (trimmedCoupon.length > 0) {
    const promotion = await db.promotion.findUnique({
      where: {
        restaurantId_code: {
          restaurantId,
          code: trimmedCoupon,
        },
      },
    });

    if (!promotion) {
      throw new PromotionRuleError(
        "COUPON_INVALID",
        `Coupon code "${trimmedCoupon}" is not valid for this restaurant.`,
        400
      );
    }

    if (promotion.status !== "ACTIVE") {
      throw new PromotionRuleError(
        "COUPON_INACTIVE",
        `Coupon code "${trimmedCoupon}" is no longer active.`,
        400
      );
    }

    if (promotion.startsAt && now.getTime() < promotion.startsAt.getTime()) {
      throw new PromotionRuleError(
        "COUPON_NOT_STARTED",
        `Coupon code "${trimmedCoupon}" is not active yet.`,
        400,
        { startsAt: promotion.startsAt.toISOString() }
      );
    }

    if (promotion.endsAt && now.getTime() > promotion.endsAt.getTime()) {
      throw new PromotionRuleError(
        "COUPON_EXPIRED",
        `Coupon code "${trimmedCoupon}" has expired.`,
        400,
        { endsAt: promotion.endsAt.toISOString() }
      );
    }

    if (
      promotion.maxUsesTotal !== null &&
      promotion.currentUses >= promotion.maxUsesTotal
    ) {
      throw new PromotionRuleError(
        "COUPON_USAGE_LIMIT_REACHED",
        `Coupon code "${trimmedCoupon}" has reached its maximum usage limit.`,
        400
      );
    }

    // Resolve customer record if needed for firstOrderOnly or maxUsesPerCustomer
    if (!resolvedCustomerId && (normalizedPhone || normalizedEmail)) {
      const orConditions: Prisma.CustomerWhereInput[] = [];
      if (normalizedPhone) {
        orConditions.push({ phone: normalizedPhone });
        if (customerPhone && customerPhone.trim() !== normalizedPhone) {
          orConditions.push({ phone: customerPhone.trim() });
        }
      }
      if (normalizedEmail) {
        orConditions.push({ email: normalizedEmail });
      }
      if (orConditions.length > 0) {
        const foundCustomer = await db.customer.findFirst({
          where: {
            restaurantId,
            OR: orConditions,
          },
          select: { id: true },
        });
        if (foundCustomer) {
          resolvedCustomerId = foundCustomer.id;
        }
      }
    }

    if (promotion.firstOrderOnly) {
      if (!resolvedCustomerId && !identifier) {
        throw new PromotionRuleError(
          "COUPON_CUSTOMER_REQUIRED",
          "Please enter your phone number or email at checkout to verify first-order eligibility for this coupon.",
          400
        );
      }

      if (resolvedCustomerId) {
        const priorOrderCount = await db.order.count({
          where: {
            restaurantId,
            customerId: resolvedCustomerId,
            status: { notIn: ["CANCELLED", "REJECTED"] },
          },
        });
        if (priorOrderCount > 0) {
          throw new PromotionRuleError(
            "COUPON_FIRST_ORDER_ONLY",
            `Coupon "${trimmedCoupon}" is valid only on your first order at this restaurant.`,
            400
          );
        }
      }
    }

    if (promotion.maxUsesPerCustomer !== null) {
      if (!resolvedCustomerId && !identifier) {
        throw new PromotionRuleError(
          "COUPON_CUSTOMER_REQUIRED",
          "Please enter your phone number or email at checkout to apply this customer-limited coupon.",
          400
        );
      }

      const redemptionOr: Prisma.PromotionRedemptionWhereInput[] = [];
      if (resolvedCustomerId) {
        redemptionOr.push({ customerId: resolvedCustomerId });
      }
      if (identifier) {
        redemptionOr.push({ customerIdentifier: identifier });
      }

      const usedByCustomer = await db.promotionRedemption.count({
        where: {
          restaurantId,
          promotionId: promotion.id,
          status: "APPLIED",
          OR: redemptionOr,
        },
      });

      if (usedByCustomer >= promotion.maxUsesPerCustomer) {
        throw new PromotionRuleError(
          "COUPON_CUSTOMER_LIMIT_REACHED",
          `You have already used coupon "${trimmedCoupon}" the maximum allowed number of times (${promotion.maxUsesPerCustomer}).`,
          400
        );
      }
    }

    // Calculate eligible subtotal based on scope (ALL, CATEGORIES, ITEMS)
    const appliesTo = (promotion.appliesTo || "ALL") as "ALL" | "CATEGORIES" | "ITEMS";
    if (appliesTo === "CATEGORIES") {
      const eligibleCatSet = new Set(parseStringArrayJson(promotion.eligibleCategoryIds));
      eligibleSubtotalMinor = orderLines
        .filter((line) => eligibleCatSet.has(line.categoryId))
        .reduce((sum, line) => sum + line.lineTotalMinor, 0);
    } else if (appliesTo === "ITEMS") {
      const eligibleItemSet = new Set(parseStringArrayJson(promotion.eligibleItemIds));
      eligibleSubtotalMinor = orderLines
        .filter((line) => eligibleItemSet.has(line.menuItemId))
        .reduce((sum, line) => sum + line.lineTotalMinor, 0);
    } else {
      eligibleSubtotalMinor = subtotalMinor;
    }

    if (eligibleSubtotalMinor <= 0) {
      throw new PromotionRuleError(
        "COUPON_NOT_ELIGIBLE",
        `None of the items in your cart are eligible for coupon "${trimmedCoupon}".`,
        400
      );
    }

    const minSubtotalMinor = toMinor(promotion.minOrderSubtotal);
    if (eligibleSubtotalMinor < minSubtotalMinor) {
      throw new PromotionRuleError(
        "COUPON_MIN_SUBTOTAL_NOT_MET",
        `A minimum eligible order subtotal of ${fromMinor(minSubtotalMinor).toFixed(2)} is required to use coupon "${trimmedCoupon}".`,
        400,
        {
          minOrderSubtotal: fromMinor(minSubtotalMinor),
          eligibleSubtotal: fromMinor(eligibleSubtotalMinor),
        }
      );
    }

    const discountType = (promotion.discountType || "PERCENTAGE") as "PERCENTAGE" | "FIXED";
    const discountValueNum = Number(promotion.discountValue);

    let rawDiscountMinor = 0;
    if (discountType === "PERCENTAGE") {
      rawDiscountMinor = Math.round((eligibleSubtotalMinor * discountValueNum) / 100);
    } else {
      rawDiscountMinor = toMinor(discountValueNum);
    }

    if (promotion.maxDiscountAmount !== null) {
      const maxCapMinor = toMinor(promotion.maxDiscountAmount);
      rawDiscountMinor = Math.min(rawDiscountMinor, maxCapMinor);
    }

    // Never allow discount to exceed eligibleSubtotalMinor or overall subtotalMinor
    discountMinor = Math.max(
      0,
      Math.min(rawDiscountMinor, eligibleSubtotalMinor, subtotalMinor)
    );

    appliedPromotion = {
      id: promotion.id,
      code: promotion.code,
      name: promotion.name,
      description: promotion.description,
      discountType,
      discountValue: discountValueNum,
      minOrderSubtotal: fromMinor(minSubtotalMinor),
      maxDiscountAmount:
        promotion.maxDiscountAmount !== null
          ? fromMinor(toMinor(promotion.maxDiscountAmount))
          : null,
      appliesTo,
      maxUsesTotal: promotion.maxUsesTotal,
      maxUsesPerCustomer: promotion.maxUsesPerCustomer,
    };
  }

  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
  const appliedTaxPercentage = restaurant.taxPercentage ?? 0;
  const taxMinor = Math.round((discountedSubtotalMinor * appliedTaxPercentage) / 100);
  const totalMinor = discountedSubtotalMinor + taxMinor;

  return {
    restaurantId,
    currency: restaurant.currency || "USD",
    appliedTaxPercentage,
    subtotalMinor,
    eligibleSubtotalMinor,
    discountMinor,
    discountedSubtotalMinor,
    taxMinor,
    totalMinor,
    subtotal: fromMinor(subtotalMinor),
    eligibleSubtotal: fromMinor(eligibleSubtotalMinor),
    discountAmount: fromMinor(discountMinor),
    discountedSubtotal: fromMinor(discountedSubtotalMinor),
    tax: fromMinor(taxMinor),
    total: fromMinor(totalMinor),
    orderLines,
    customerIdentifier: identifier,
    resolvedCustomerId,
    promotion: appliedPromotion,
  };
}

/**
 * Atomically reserves a promotion use with a conditional DB guard inside an active transaction
 * before order creation. Fails fast if usage limits are exceeded without writing order rows.
 */
export async function reservePromotionInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: string;
    customerId: string | null;
    customerIdentifier: string | null;
    evaluation: CartPromotionEvaluationResult;
  }
) {
  const { restaurantId, customerId, customerIdentifier, evaluation } = params;
  const promo = evaluation.promotion;
  if (!promo) return null;

  // Re-verify per-customer limit inside transaction before locking usage
  if (promo.maxUsesPerCustomer !== null) {
    const redemptionOr: Prisma.PromotionRedemptionWhereInput[] = [];
    if (customerId) redemptionOr.push({ customerId });
    if (customerIdentifier) redemptionOr.push({ customerIdentifier });

    if (redemptionOr.length === 0) {
      throw new PromotionRuleError(
        "COUPON_CUSTOMER_REQUIRED",
        "Customer contact information is required to redeem this limited coupon.",
        400
      );
    }

    const usedCount = await tx.promotionRedemption.count({
      where: {
        restaurantId,
        promotionId: promo.id,
        status: "APPLIED",
        OR: redemptionOr,
      },
    });

    if (usedCount >= promo.maxUsesPerCustomer) {
      throw new PromotionRuleError(
        "COUPON_CUSTOMER_LIMIT_REACHED",
        `You have already used coupon "${promo.code}" the maximum allowed number of times.`,
        400
      );
    }
  }

  // Conditional atomic update to prevent concurrent over-redemption
  const whereClause: Prisma.PromotionWhereInput = {
    id: promo.id,
    restaurantId,
    status: "ACTIVE",
    ...(promo.maxUsesTotal !== null
      ? { currentUses: { lt: promo.maxUsesTotal } }
      : {}),
  };

  const incremented = await tx.promotion.updateMany({
    where: whereClause,
    data: {
      currentUses: { increment: 1 },
    },
  });

  if (incremented.count === 0) {
    throw new PromotionRuleError(
      "COUPON_USAGE_LIMIT_REACHED",
      `Coupon "${promo.code}" has reached its maximum usage limit or is no longer active.`,
      400
    );
  }

  return true;
}

/**
 * Creates the PromotionRedemption record linking to the newly created orderId.
 */
export async function recordPromotionRedemptionInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: string;
    orderId: string;
    customerId: string | null;
    customerIdentifier: string | null;
    evaluation: CartPromotionEvaluationResult;
  }
) {
  const { restaurantId, orderId, customerId, customerIdentifier, evaluation } = params;
  const promo = evaluation.promotion;
  if (!promo) return null;

  return tx.promotionRedemption.create({
    data: {
      restaurantId,
      promotionId: promo.id,
      orderId,
      customerId,
      customerIdentifier,
      codeSnapshot: promo.code,
      nameSnapshot: promo.name,
      discountTypeSnapshot: promo.discountType,
      discountValueSnapshot: promo.discountValue,
      eligibleSubtotal: evaluation.eligibleSubtotal,
      discountAmount: evaluation.discountAmount,
      status: "APPLIED",
    },
  });
}

/**
 * Atomically increments Promotion.currentUses with a conditional DB guard
 * and records the immutable PromotionRedemption row inside an active transaction.
 * Defeats concurrent race conditions on limited-use coupons.
 */
export async function redeemPromotionInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: string;
    orderId: string;
    customerId: string | null;
    customerIdentifier: string | null;
    evaluation: CartPromotionEvaluationResult;
  }
) {
  await reservePromotionInTransaction(tx, params);
  return recordPromotionRedemptionInTransaction(tx, params);
}

/**
 * Idempotently releases an applied promotion redemption when an order is CANCELLED, REJECTED, or REFUNDED.
 * Safe to invoke multiple times for the same order without double-decrementing currentUses.
 */
export async function releaseOrderPromotionRedemption(
  orderId: string,
  reason: string,
  db: DbClient = prisma
): Promise<boolean> {
  const redemption = await db.promotionRedemption.findUnique({
    where: { orderId },
  });

  if (!redemption || redemption.status !== "APPLIED") {
    return false;
  }

  const now = new Date();
  const updated = await db.promotionRedemption.updateMany({
    where: {
      id: redemption.id,
      status: "APPLIED",
    },
    data: {
      status: "RELEASED",
      releasedReason: reason,
      releasedAt: now,
    },
  });

  if (updated.count === 1) {
    await db.promotion.updateMany({
      where: {
        id: redemption.promotionId,
        currentUses: { gt: 0 },
      },
      data: {
        currentUses: { decrement: 1 },
      },
    });
    return true;
  }

  return false;
}

export function serializePromotion(promo: {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: Prisma.Decimal | number;
  minOrderSubtotal: Prisma.Decimal | number;
  maxDiscountAmount: Prisma.Decimal | number | null;
  appliesTo: string;
  eligibleCategoryIds: string;
  eligibleItemIds: string;
  firstOrderOnly: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  currentUses: number;
  status: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const now = new Date();
  let effectiveState: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "LIMIT_REACHED" | "DISABLED" | "ARCHIVED" =
    promo.status === "ARCHIVED"
      ? "ARCHIVED"
      : promo.status === "DISABLED"
      ? "DISABLED"
      : "ACTIVE";

  if (effectiveState === "ACTIVE") {
    if (promo.startsAt && now.getTime() < promo.startsAt.getTime()) {
      effectiveState = "SCHEDULED";
    } else if (promo.endsAt && now.getTime() > promo.endsAt.getTime()) {
      effectiveState = "EXPIRED";
    } else if (
      promo.maxUsesTotal !== null &&
      promo.currentUses >= promo.maxUsesTotal
    ) {
      effectiveState = "LIMIT_REACHED";
    }
  }

  return {
    id: promo.id,
    restaurantId: promo.restaurantId,
    code: promo.code,
    name: promo.name,
    description: promo.description,
    discountType: promo.discountType as "PERCENTAGE" | "FIXED",
    discountValue: Number(promo.discountValue),
    minOrderSubtotal: Number(promo.minOrderSubtotal),
    maxDiscountAmount:
      promo.maxDiscountAmount !== null ? Number(promo.maxDiscountAmount) : null,
    appliesTo: promo.appliesTo as "ALL" | "CATEGORIES" | "ITEMS",
    eligibleCategoryIds: parseStringArrayJson(promo.eligibleCategoryIds),
    eligibleItemIds: parseStringArrayJson(promo.eligibleItemIds),
    firstOrderOnly: promo.firstOrderOnly,
    startsAt: promo.startsAt ? promo.startsAt.toISOString() : null,
    endsAt: promo.endsAt ? promo.endsAt.toISOString() : null,
    maxUsesTotal: promo.maxUsesTotal,
    maxUsesPerCustomer: promo.maxUsesPerCustomer,
    currentUses: promo.currentUses,
    status: promo.status as "ACTIVE" | "DISABLED" | "ARCHIVED",
    effectiveState,
    createdByUserId: promo.createdByUserId,
    createdAt: promo.createdAt.toISOString(),
    updatedAt: promo.updatedAt.toISOString(),
  };
}
