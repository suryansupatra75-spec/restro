import crypto from "crypto";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/service";
import {
  createSaasCheckoutSession,
  getSaasBillingConfig,
  type SaasBillingConfigSummary,
} from "@/lib/billing/provider";
import type {
  SubscriptionStatus,
  WebhookEventType,
} from "@/lib/validations/billing";

export type EntitlementCheckType =
  | "ADD_STAFF_INVITE"
  | "ACCEPT_STAFF_INVITE"
  | "ADD_MENU_ITEM"
  | "ADD_TABLE"
  | "ADD_PROMOTION"
  | "USE_ANALYTICS"
  | "USE_ANALYTICS_EXPORT"
  | "USE_INVENTORY";

export class BillingRuleError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 403,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "BillingRuleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_PLANS = [
  {
    key: "STARTER",
    name: "Starter",
    description:
      "Essential QR digital menu, table ordering, and basic order management for single cafes and bistros.",
    billingInterval: "MONTHLY",
    priceMinor: 99900, // INR 999.00 in paise
    currency: "INR",
    trialDays: 14,
    isActive: true,
    isArchived: false,
    sortOrder: 1,
    maxStaff: 2,
    maxMenuItems: 100,
    maxTables: 15,
    analyticsEnabled: false,
    analyticsExportEnabled: false,
    inventoryEnabled: false,
    customBrandingEnabled: false,
  },
  {
    key: "GROWTH",
    name: "Growth",
    description:
      "Full-featured restaurant operations with inventory management, recipes, and real-time analytics.",
    billingInterval: "MONTHLY",
    priceMinor: 249900, // INR 2,499.00 in paise
    currency: "INR",
    trialDays: 14,
    isActive: true,
    isArchived: false,
    sortOrder: 2,
    maxStaff: 10,
    maxMenuItems: 500,
    maxTables: 50,
    analyticsEnabled: true,
    analyticsExportEnabled: true,
    inventoryEnabled: true,
    customBrandingEnabled: true,
  },
  {
    key: "PRO",
    name: "Pro",
    description:
      "High-volume operations with expanded staff seats, large menus, advanced reporting, and priority support.",
    billingInterval: "MONTHLY",
    priceMinor: 499900, // INR 4,999.00 in paise
    currency: "INR",
    trialDays: 14,
    isActive: true,
    isArchived: false,
    sortOrder: 3,
    maxStaff: 50,
    maxMenuItems: 2500,
    maxTables: 200,
    analyticsEnabled: true,
    analyticsExportEnabled: true,
    inventoryEnabled: true,
    customBrandingEnabled: true,
  },
  {
    key: "GROWTH_YEARLY",
    name: "Growth (Annual)",
    description:
      "Annual Growth subscription with 2 months savings, full analytics, and inventory management.",
    billingInterval: "YEARLY",
    priceMinor: 2499000, // INR 24,990.00 in paise
    currency: "INR",
    trialDays: 14,
    isActive: true,
    isArchived: false,
    sortOrder: 4,
    maxStaff: 10,
    maxMenuItems: 500,
    maxTables: 50,
    analyticsEnabled: true,
    analyticsExportEnabled: true,
    inventoryEnabled: true,
    customBrandingEnabled: true,
  },
] as const;

let defaultPlansSeededInProcess = false;

/**
 * Ensures the default database-backed plan catalogue exists.
 * Never overwrites Super Admin edits to existing plans.
 */
export async function ensureDefaultPlans() {
  if (defaultPlansSeededInProcess) {
    return;
  }

  const count = await prisma.subscriptionPlan.count();
  if (count === 0) {
    for (const plan of DEFAULT_PLANS) {
      await prisma.subscriptionPlan.upsert({
        where: { key: plan.key },
        update: {},
        create: plan,
      });
    }
  } else {
    // Ensure at least GROWTH and STARTER exist if table was partially populated
    for (const plan of DEFAULT_PLANS) {
      const existing = await prisma.subscriptionPlan.findUnique({
        where: { key: plan.key },
      });
      if (!existing) {
        await prisma.subscriptionPlan.create({ data: plan });
      }
    }
  }

  defaultPlansSeededInProcess = true;
}

const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  INCOMPLETE: ["INCOMPLETE", "ACTIVE", "CANCELLED", "EXPIRED"],
  TRIALING: ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"],
  ACTIVE: ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"],
  PAST_DUE: ["PAST_DUE", "ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: ["CANCELLED", "ACTIVE", "TRIALING"],
  EXPIRED: ["EXPIRED", "ACTIVE", "TRIALING"],
};

export function validateSubscriptionTransition(
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus,
  actorType: "SUPER_ADMIN" | "OWNER" | "WEBHOOK" | "SYSTEM"
) {
  const allowed = VALID_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new BillingRuleError(
      "INVALID_STATUS_TRANSITION",
      `Invalid subscription status transition from ${fromStatus} to ${toStatus}.`,
      400,
      { fromStatus, toStatus }
    );
  }

  // Owners cannot directly activate a subscription or restart a trial once expired/cancelled
  if (actorType === "OWNER") {
    if (toStatus === "ACTIVE") {
      throw new BillingRuleError(
        "FORBIDDEN_STATUS_TRANSITION",
        "Restaurant owners cannot directly set subscription status to ACTIVE without verified payment confirmation.",
        403
      );
    }
    if (
      toStatus === "TRIALING" &&
      (fromStatus === "EXPIRED" || fromStatus === "CANCELLED" || fromStatus === "ACTIVE")
    ) {
      throw new BillingRuleError(
        "TRIAL_NOT_ELIGIBLE",
        "Cannot restart a free trial on a subscription that has already been active, cancelled, or expired.",
        400
      );
    }
  }
}

/**
 * Evaluates server-side trial expiry, trial-ending-soon notifications,
 * and scheduled period-end cancellations idempotently.
 */
export async function evaluateAndSyncSubscriptionExpiry(subscriptionId: string) {
  const sub = await prisma.restaurantSubscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) return null;

  const now = new Date();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  if (sub.status === "TRIALING" && sub.trialEndsAt) {
    if (now.getTime() >= sub.trialEndsAt.getTime()) {
      // Atomic conditional update so concurrent requests never double-expire or double-notify
      const updated = await prisma.restaurantSubscription.updateMany({
        where: { id: sub.id, status: "TRIALING" },
        data: {
          status: "EXPIRED",
          updatedAt: now,
        },
      });

      if (updated.count === 1) {
        await createNotification({
          restaurantId: sub.restaurantId,
          type: "SUBSCRIPTION_STATUS_CHANGED",
          title: "Free Trial Expired",
          message: `Your ${sub.planNameSnapshot} trial has expired. Existing restaurant data is safe, but new additions are paused until you select an active plan in Billing.`,
          metadata: {
            subscriptionId: sub.id,
            previousStatus: "TRIALING",
            newStatus: "EXPIRED",
            planKey: sub.planKeySnapshot,
          },
        });
      }

      return prisma.restaurantSubscription.findUnique({
        where: { id: sub.id },
        include: { plan: true },
      });
    }

    // Check if trial is ending within 3 days and hasn't notified yet
    const msRemaining = sub.trialEndsAt.getTime() - now.getTime();
    if (msRemaining > 0 && msRemaining <= THREE_DAYS_MS && !sub.trialEndingNotifiedAt) {
      const notified = await prisma.restaurantSubscription.updateMany({
        where: { id: sub.id, trialEndingNotifiedAt: null },
        data: { trialEndingNotifiedAt: now },
      });

      if (notified.count === 1) {
        const daysLeft = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
        await createNotification({
          restaurantId: sub.restaurantId,
          type: "SUBSCRIPTION_STATUS_CHANGED",
          title: "Trial Ending Soon",
          message: `Your ${sub.planNameSnapshot} trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Visit Billing to configure your plan and avoid interruption.`,
          metadata: {
            subscriptionId: sub.id,
            status: "TRIALING",
            daysLeft,
            trialEndsAt: sub.trialEndsAt.toISOString(),
          },
        });
      }
    }
  }

  // Handle scheduled cancellation at period end
  if (
    sub.status === "ACTIVE" &&
    sub.cancelAtPeriodEnd &&
    sub.currentPeriodEnd &&
    now.getTime() >= sub.currentPeriodEnd.getTime()
  ) {
    const cancelled = await prisma.restaurantSubscription.updateMany({
      where: { id: sub.id, status: "ACTIVE", cancelAtPeriodEnd: true },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        updatedAt: now,
      },
    });

    if (cancelled.count === 1) {
      await createNotification({
        restaurantId: sub.restaurantId,
        type: "SUBSCRIPTION_STATUS_CHANGED",
        title: "Subscription Cancelled",
        message: `Your ${sub.planNameSnapshot} subscription has ended at the close of the billing period.`,
        metadata: {
          subscriptionId: sub.id,
          previousStatus: "ACTIVE",
          newStatus: "CANCELLED",
        },
      });
    }
  }

  return prisma.restaurantSubscription.findUnique({
    where: { id: sub.id },
    include: { plan: true },
  });
}

/**
 * Ensures a restaurant has a current subscription record.
 * Uses database uniqueness on `currentLockKey` (`restaurantId`) so concurrent requests
 * can never create two `isCurrent = true` subscriptions for the same restaurant.
 *
 * Backward-compatibility policy: Existing tenants without a subscription receive
 * a 14-day TRIALING subscription on the GROWTH plan so existing Phase 1-16 workflows
 * continue operating without unexpected lockouts.
 */
export async function ensureRestaurantSubscription(
  restaurantId: string,
  preferredPlanKey = "GROWTH"
) {
  await ensureDefaultPlans();

  const existing = await prisma.restaurantSubscription.findFirst({
    where: { restaurantId, isCurrent: true },
    include: { plan: true },
  });

  if (existing) {
    const synced = await evaluateAndSyncSubscriptionExpiry(existing.id);
    return synced ?? existing;
  }

  const plan =
    (await prisma.subscriptionPlan.findUnique({
      where: { key: preferredPlanKey },
    })) ||
    (await prisma.subscriptionPlan.findFirst({
      where: { isActive: true, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }));

  if (!plan) {
    throw new BillingRuleError(
      "NO_PLANS_CONFIGURED",
      "No active subscription plans exist in the platform catalogue.",
      500
    );
  }

  const now = new Date();
  const trialDays = plan.trialDays > 0 ? plan.trialDays : 14;
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  try {
    const created = await prisma.restaurantSubscription.create({
      data: {
        restaurantId,
        planId: plan.id,
        isCurrent: true,
        currentLockKey: restaurantId,
        status: "TRIALING",
        planKeySnapshot: plan.key,
        planNameSnapshot: plan.name,
        billingIntervalSnapshot: plan.billingInterval,
        priceMinorSnapshot: plan.priceMinor,
        currencySnapshot: plan.currency,
        maxStaffSnapshot: plan.maxStaff,
        maxMenuItemsSnapshot: plan.maxMenuItems,
        maxTablesSnapshot: plan.maxTables,
        analyticsEnabledSnapshot: plan.analyticsEnabled,
        analyticsExportEnabledSnapshot: plan.analyticsExportEnabled,
        inventoryEnabledSnapshot: plan.inventoryEnabled,
        customBrandingEnabledSnapshot: plan.customBrandingEnabled,
        trialStartsAt: now,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        provider: "INTERNAL_TRIAL",
      },
      include: { plan: true },
    });

    return created;
  } catch (err: unknown) {
    // Handle concurrent race condition where another request created the current subscription simultaneously
    const isUniqueConstraint =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";

    if (isUniqueConstraint) {
      const winner = await prisma.restaurantSubscription.findFirst({
        where: { restaurantId, isCurrent: true },
        include: { plan: true },
      });
      if (winner) return winner;
    }
    throw err;
  }
}

export interface RestaurantEntitlementSummary {
  restaurantId: string;
  subscription: {
    id: string;
    planId: string;
    planKey: string;
    planName: string;
    billingInterval: string;
    priceMinor: number;
    currency: string;
    status: SubscriptionStatus;
    isOperational: boolean;
    isReadOnlyGrace: boolean;
    trialStartsAt: string | null;
    trialEndsAt: string | null;
    trialRemainingDays: number | null;
    trialRemainingHours: number | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelRequestedAt: string | null;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
    provider: string;
    providerSubscriptionId: string | null;
  };
  limits: {
    maxStaff: number;
    maxMenuItems: number;
    maxTables: number;
    maxPromotions: number;
  };
  usage: {
    activeStaff: number;
    pendingInvitations: number;
    totalStaffSeatsUsed: number;
    menuItems: number;
    tables: number;
    activePromotions: number;
  };
  overLimit: {
    staff: boolean;
    menuItems: boolean;
    tables: boolean;
    promotions: boolean;
    any: boolean;
  };
  features: {
    analyticsEnabled: boolean;
    analyticsExportEnabled: boolean;
    inventoryEnabled: boolean;
    customBrandingEnabled: boolean;
  };
  providerConfig: SaasBillingConfigSummary;
}

/**
 * Returns the complete server-calculated entitlement, usage, trial, and limit state for a tenant.
 */
export async function getRestaurantEntitlements(
  restaurantId: string
): Promise<RestaurantEntitlementSummary> {
  const sub = await ensureRestaurantSubscription(restaurantId);
  const now = new Date();

  const [activeStaff, pendingInvitations, menuItems, tables, activePromotions] =
    await Promise.all([
      prisma.restaurantUser.count({
        where: { restaurantId, status: "ACTIVE" },
      }),
      prisma.staffInvitation.count({
        where: {
          restaurantId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      }),
      prisma.menuItem.count({
        where: { restaurantId, status: { not: "ARCHIVED" } },
      }),
      prisma.table.count({
        where: { restaurantId, status: { not: "ARCHIVED" } },
      }),
      prisma.promotion.count({
        where: { restaurantId, status: "ACTIVE" },
      }),
    ]);

  const totalStaffSeatsUsed = activeStaff + pendingInvitations;
  const status = sub.status as SubscriptionStatus;

  const isOperational = status === "TRIALING" || status === "ACTIVE";
  const isReadOnlyGrace = status === "PAST_DUE";

  let trialRemainingDays: number | null = null;
  let trialRemainingHours: number | null = null;

  if (status === "TRIALING" && sub.trialEndsAt) {
    const diffMs = Math.max(0, sub.trialEndsAt.getTime() - now.getTime());
    trialRemainingHours = Math.ceil(diffMs / (60 * 60 * 1000));
    trialRemainingDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }

  const maxStaff = sub.maxStaffSnapshot;
  const maxMenuItems = sub.maxMenuItemsSnapshot;
  const maxTables = sub.maxTablesSnapshot;
  const maxPromotions =
    sub.planKeySnapshot === "STARTER"
      ? 3
      : sub.planKeySnapshot === "GROWTH" || sub.planKeySnapshot === "GROWTH_YEARLY"
      ? 25
      : sub.planKeySnapshot === "PRO"
      ? 500
      : Math.max(10, maxTables * 2);

  const overStaff = totalStaffSeatsUsed > maxStaff;
  const overMenu = menuItems > maxMenuItems;
  const overTables = tables > maxTables;
  const overPromotions = activePromotions > maxPromotions;

  return {
    restaurantId,
    subscription: {
      id: sub.id,
      planId: sub.planId,
      planKey: sub.planKeySnapshot,
      planName: sub.planNameSnapshot,
      billingInterval: sub.billingIntervalSnapshot,
      priceMinor: sub.priceMinorSnapshot,
      currency: sub.currencySnapshot,
      status,
      isOperational,
      isReadOnlyGrace,
      trialStartsAt: sub.trialStartsAt ? sub.trialStartsAt.toISOString() : null,
      trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
      trialRemainingDays,
      trialRemainingHours,
      currentPeriodStart: sub.currentPeriodStart
        ? sub.currentPeriodStart.toISOString()
        : null,
      currentPeriodEnd: sub.currentPeriodEnd
        ? sub.currentPeriodEnd.toISOString()
        : null,
      cancelRequestedAt: sub.cancelRequestedAt
        ? sub.cancelRequestedAt.toISOString()
        : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      cancelledAt: sub.cancelledAt ? sub.cancelledAt.toISOString() : null,
      provider: sub.provider,
      providerSubscriptionId: sub.providerSubscriptionId,
    },
    limits: {
      maxStaff,
      maxMenuItems,
      maxTables,
      maxPromotions,
    },
    usage: {
      activeStaff,
      pendingInvitations,
      totalStaffSeatsUsed,
      menuItems,
      tables,
      activePromotions,
    },
    overLimit: {
      staff: overStaff,
      menuItems: overMenu,
      tables: overTables,
      promotions: overPromotions,
      any: overStaff || overMenu || overTables || overPromotions,
    },
    features: {
      analyticsEnabled: isOperational || isReadOnlyGrace ? sub.analyticsEnabledSnapshot : false,
      analyticsExportEnabled:
        isOperational || isReadOnlyGrace ? sub.analyticsExportEnabledSnapshot : false,
      inventoryEnabled: isOperational || isReadOnlyGrace ? sub.inventoryEnabledSnapshot : false,
      customBrandingEnabled: isOperational ? sub.customBrandingEnabledSnapshot : false,
    },
    providerConfig: getSaasBillingConfig(),
  };
}

/**
 * Centralized Server-Side Entitlement & Limit Enforcement guard.
 * Throws a `BillingRuleError` (HTTP 403) when a subscription is expired/cancelled/past_due
 * or when a plan's numeric limit or feature entitlement is exceeded.
 * Never deletes existing tenant records.
 */
export async function assertEntitlement(
  restaurantId: string,
  checkType: EntitlementCheckType
): Promise<RestaurantEntitlementSummary> {
  const state = await getRestaurantEntitlements(restaurantId);
  const { subscription, limits, usage } = state;

  // Check subscription active state first
  if (
    subscription.status === "EXPIRED" ||
    subscription.status === "CANCELLED" ||
    subscription.status === "INCOMPLETE"
  ) {
    throw new BillingRuleError(
      "SUBSCRIPTION_INACTIVE",
      `Your restaurant subscription is currently ${subscription.status}. Existing data is preserved, but this action requires an active plan. Please visit Billing to upgrade or renew.`,
      403,
      {
        subscriptionStatus: subscription.status,
        planKey: subscription.planKey,
        checkType,
      }
    );
  }

  // PAST_DUE allows read-only grace access to analytics/inventory if enabled on plan,
  // but blocks adding new staff, menu items, tables, or promotions.
  if (
    subscription.status === "PAST_DUE" &&
    (checkType === "ADD_STAFF_INVITE" ||
      checkType === "ACCEPT_STAFF_INVITE" ||
      checkType === "ADD_MENU_ITEM" ||
      checkType === "ADD_TABLE" ||
      checkType === "ADD_PROMOTION")
  ) {
    throw new BillingRuleError(
      "SUBSCRIPTION_PAST_DUE",
      "Your subscription payment is past due. Creating new staff, menu items, tables, or promotions is paused during grace period until billing is resolved.",
      403,
      {
        subscriptionStatus: subscription.status,
        planKey: subscription.planKey,
        checkType,
      }
    );
  }

  switch (checkType) {
    case "ADD_STAFF_INVITE": {
      if (usage.totalStaffSeatsUsed >= limits.maxStaff) {
        throw new BillingRuleError(
          "PLAN_LIMIT_REACHED",
          `Staff limit reached for your ${subscription.planName} plan (${usage.totalStaffSeatsUsed}/${limits.maxStaff} active + pending staff seats). Upgrade your plan in Billing to invite more staff.`,
          403,
          {
            resource: "STAFF",
            current: usage.totalStaffSeatsUsed,
            limit: limits.maxStaff,
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "ACCEPT_STAFF_INVITE": {
      if (usage.activeStaff >= limits.maxStaff) {
        throw new BillingRuleError(
          "PLAN_LIMIT_REACHED",
          `Active staff limit reached for the restaurant's ${subscription.planName} plan (${usage.activeStaff}/${limits.maxStaff}). The owner must upgrade their plan before additional staff can join.`,
          403,
          {
            resource: "STAFF",
            current: usage.activeStaff,
            limit: limits.maxStaff,
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "ADD_MENU_ITEM": {
      if (usage.menuItems >= limits.maxMenuItems) {
        throw new BillingRuleError(
          "PLAN_LIMIT_REACHED",
          `Menu item limit reached for your ${subscription.planName} plan (${usage.menuItems}/${limits.maxMenuItems} active items). Upgrade your plan in Billing to add more menu items.`,
          403,
          {
            resource: "MENU_ITEMS",
            current: usage.menuItems,
            limit: limits.maxMenuItems,
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "ADD_TABLE": {
      if (usage.tables >= limits.maxTables) {
        throw new BillingRuleError(
          "PLAN_LIMIT_REACHED",
          `Table limit reached for your ${subscription.planName} plan (${usage.tables}/${limits.maxTables} tables). Upgrade your plan in Billing to add more tables.`,
          403,
          {
            resource: "TABLES",
            current: usage.tables,
            limit: limits.maxTables,
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "ADD_PROMOTION": {
      if (usage.activePromotions >= limits.maxPromotions) {
        throw new BillingRuleError(
          "PLAN_LIMIT_REACHED",
          `Active promotion limit reached for your ${subscription.planName} plan (${usage.activePromotions}/${limits.maxPromotions} active promotions). Disable an existing promotion or upgrade your plan in Billing.`,
          403,
          {
            resource: "PROMOTIONS",
            current: usage.activePromotions,
            limit: limits.maxPromotions,
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "USE_ANALYTICS": {
      if (!state.features.analyticsEnabled) {
        throw new BillingRuleError(
          "FEATURE_NOT_AVAILABLE",
          `Analytics & Reports are not included in your current ${subscription.planName} plan. Upgrade to Growth or Pro to unlock Analytics.`,
          403,
          {
            feature: "ANALYTICS",
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "USE_ANALYTICS_EXPORT": {
      if (!state.features.analyticsExportEnabled) {
        throw new BillingRuleError(
          "FEATURE_NOT_AVAILABLE",
          `Analytics CSV export is not included in your current ${subscription.planName} plan. Upgrade to Growth or Pro to unlock CSV exports.`,
          403,
          {
            feature: "ANALYTICS_EXPORT",
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }

    case "USE_INVENTORY": {
      if (!state.features.inventoryEnabled) {
        throw new BillingRuleError(
          "FEATURE_NOT_AVAILABLE",
          `Inventory & Recipe Management is not included in your current ${subscription.planName} plan. Upgrade to Growth or Pro to unlock Inventory.`,
          403,
          {
            feature: "INVENTORY",
            planKey: subscription.planKey,
          }
        );
      }
      break;
    }
  }

  return state;
}

function generateInvoiceNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SAAS-INV-${datePart}-${randPart}`;
}

/**
 * Super Admin assignment or modification of a restaurant's subscription.
 * Preserves history when replacing a subscription and snapshots plan terms immutably.
 */
export async function superAdminAssignOrUpdateSubscription(params: {
  restaurantId: string;
  planId?: string;
  status?: SubscriptionStatus;
  trialDays?: number;
  periodDays?: number;
  cancelAtPeriodEnd?: boolean;
  recordManualInvoicePaid?: boolean;
  notes?: string;
  actorUserId: string;
}) {
  await ensureDefaultPlans();

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: params.restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) {
    throw new BillingRuleError("RESTAURANT_NOT_FOUND", "Restaurant not found", 404);
  }

  const currentSub = await ensureRestaurantSubscription(params.restaurantId);
  const targetPlanId = params.planId || currentSub.planId;

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: targetPlanId },
  });
  if (!plan) {
    throw new BillingRuleError("PLAN_NOT_FOUND", "Subscription plan not found", 404);
  }

  if ((plan.isArchived || !plan.isActive) && targetPlanId !== currentSub.planId) {
    throw new BillingRuleError(
      "PLAN_INACTIVE_OR_ARCHIVED",
      "Cannot assign an archived or inactive plan to a restaurant.",
      400
    );
  }

  const targetStatus = (params.status || currentSub.status) as SubscriptionStatus;
  validateSubscriptionTransition(
    currentSub.status as SubscriptionStatus,
    targetStatus,
    "SUPER_ADMIN"
  );

  const now = new Date();
  const isPlanChange = targetPlanId !== currentSub.planId;

  const defaultPeriodDays = plan.billingInterval === "YEARLY" ? 365 : 30;
  const effectivePeriodDays = params.periodDays ?? defaultPeriodDays;
  const effectiveTrialDays = params.trialDays ?? plan.trialDays;

  let trialStartsAt = currentSub.trialStartsAt;
  let trialEndsAt = currentSub.trialEndsAt;
  let currentPeriodStart = currentSub.currentPeriodStart ?? now;
  let currentPeriodEnd = currentSub.currentPeriodEnd;
  let cancelledAt = currentSub.cancelledAt;

  if (targetStatus === "TRIALING") {
    trialStartsAt = now;
    trialEndsAt = new Date(now.getTime() + effectiveTrialDays * 24 * 60 * 60 * 1000);
    currentPeriodStart = now;
    currentPeriodEnd = trialEndsAt;
    cancelledAt = null;
  } else if (targetStatus === "ACTIVE") {
    currentPeriodStart = now;
    currentPeriodEnd = new Date(now.getTime() + effectivePeriodDays * 24 * 60 * 60 * 1000);
    cancelledAt = null;
  } else if (targetStatus === "EXPIRED" && trialEndsAt && trialEndsAt > now) {
    trialEndsAt = now;
  } else if (targetStatus === "CANCELLED") {
    cancelledAt = now;
  }

  const result = await prisma.$transaction(async (tx) => {
    let updatedSub;

    if (isPlanChange) {
      // Archive previous subscription in history and create a new current record
      await tx.restaurantSubscription.update({
        where: { id: currentSub.id },
        data: {
          isCurrent: false,
          currentLockKey: null,
          updatedAt: now,
        },
      });

      updatedSub = await tx.restaurantSubscription.create({
        data: {
          restaurantId: params.restaurantId,
          planId: plan.id,
          isCurrent: true,
          currentLockKey: params.restaurantId,
          status: targetStatus,
          planKeySnapshot: plan.key,
          planNameSnapshot: plan.name,
          billingIntervalSnapshot: plan.billingInterval,
          priceMinorSnapshot: plan.priceMinor,
          currencySnapshot: plan.currency,
          maxStaffSnapshot: plan.maxStaff,
          maxMenuItemsSnapshot: plan.maxMenuItems,
          maxTablesSnapshot: plan.maxTables,
          analyticsEnabledSnapshot: plan.analyticsEnabled,
          analyticsExportEnabledSnapshot: plan.analyticsExportEnabled,
          inventoryEnabledSnapshot: plan.inventoryEnabled,
          customBrandingEnabledSnapshot: plan.customBrandingEnabled,
          trialStartsAt,
          trialEndsAt,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? false,
          cancelledAt,
          provider:
            targetStatus === "TRIALING" ? "INTERNAL_TRIAL" : "MANUAL_ADMIN",
          notes: params.notes ?? null,
        },
        include: { plan: true },
      });
    } else {
      updatedSub = await tx.restaurantSubscription.update({
        where: { id: currentSub.id },
        data: {
          status: targetStatus,
          trialStartsAt,
          trialEndsAt,
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd:
            params.cancelAtPeriodEnd !== undefined
              ? params.cancelAtPeriodEnd
              : currentSub.cancelAtPeriodEnd,
          cancelledAt,
          notes: params.notes !== undefined ? params.notes : currentSub.notes,
          updatedAt: now,
        },
        include: { plan: true },
      });
    }

    let manualInvoice = null;
    if (params.recordManualInvoicePaid && targetStatus === "ACTIVE") {
      manualInvoice = await tx.subscriptionInvoice.create({
        data: {
          restaurantId: params.restaurantId,
          subscriptionId: updatedSub.id,
          invoiceNumber: generateInvoiceNumber(),
          planKeySnapshot: updatedSub.planKeySnapshot,
          planNameSnapshot: updatedSub.planNameSnapshot,
          billingIntervalSnapshot: updatedSub.billingIntervalSnapshot,
          amountMinor: updatedSub.priceMinorSnapshot,
          currency: updatedSub.currencySnapshot,
          invoiceStatus: "PAID",
          paymentStatus: "SUCCEEDED",
          provider: "MANUAL_ADMIN",
          periodStart: currentPeriodStart,
          periodEnd: currentPeriodEnd,
          paidAt: now,
          verifiedBySource: "MANUAL_SUPER_ADMIN",
          notes:
            params.notes ||
            `Manually confirmed by Super Admin (${params.actorUserId})`,
        },
      });
    }

    return { subscription: updatedSub, manualInvoice };
  });

  if (currentSub.status !== targetStatus || isPlanChange) {
    await createNotification({
      restaurantId: params.restaurantId,
      type: "SUBSCRIPTION_STATUS_CHANGED",
      title: "Subscription Updated",
      message: `Your subscription is now ${result.subscription.planNameSnapshot} (${result.subscription.status}).`,
      metadata: {
        subscriptionId: result.subscription.id,
        planKey: result.subscription.planKeySnapshot,
        status: result.subscription.status,
      },
    });
  }

  return result;
}

/**
 * Initiates a plan checkout session for a restaurant owner.
 * Never activates the subscription or marks the invoice paid immediately;
 * activation only happens via verified server-side webhook (or Super Admin manual confirmation).
 */
export async function initiateOwnerPlanCheckout(params: {
  restaurantId: string;
  planId: string;
  action: "START_TRIAL" | "CREATE_CHECKOUT";
  simulateTimeout?: boolean;
}) {
  await ensureDefaultPlans();

  const currentSub = await ensureRestaurantSubscription(params.restaurantId);
  const targetPlan = await prisma.subscriptionPlan.findUnique({
    where: { id: params.planId },
  });

  if (!targetPlan || !targetPlan.isActive || targetPlan.isArchived) {
    throw new BillingRuleError(
      "PLAN_NOT_AVAILABLE",
      "The selected subscription plan is not available.",
      400
    );
  }

  const now = new Date();

  if (params.action === "START_TRIAL") {
    // Only allow switching trial plan if the tenant is currently in an active trial
    if (currentSub.status !== "TRIALING") {
      throw new BillingRuleError(
        "TRIAL_NOT_ELIGIBLE",
        "Your restaurant has already used its trial period. Please select Checkout to subscribe.",
        400
      );
    }

    const updated = await prisma.restaurantSubscription.update({
      where: { id: currentSub.id },
      data: {
        planId: targetPlan.id,
        planKeySnapshot: targetPlan.key,
        planNameSnapshot: targetPlan.name,
        billingIntervalSnapshot: targetPlan.billingInterval,
        priceMinorSnapshot: targetPlan.priceMinor,
        currencySnapshot: targetPlan.currency,
        maxStaffSnapshot: targetPlan.maxStaff,
        maxMenuItemsSnapshot: targetPlan.maxMenuItems,
        maxTablesSnapshot: targetPlan.maxTables,
        analyticsEnabledSnapshot: targetPlan.analyticsEnabled,
        analyticsExportEnabledSnapshot: targetPlan.analyticsExportEnabled,
        inventoryEnabledSnapshot: targetPlan.inventoryEnabled,
        customBrandingEnabledSnapshot: targetPlan.customBrandingEnabled,
        updatedAt: now,
      },
      include: { plan: true },
    });

    return {
      mode: "TRIAL_UPDATED" as const,
      subscription: updated,
      invoice: null,
      checkoutSession: null,
    };
  }

  // Action === "CREATE_CHECKOUT"
  const periodDays = targetPlan.billingInterval === "YEARLY" ? 365 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  // Create an OPEN / PENDING invoice representing the checkout attempt
  const openInvoice = await prisma.subscriptionInvoice.create({
    data: {
      restaurantId: params.restaurantId,
      subscriptionId: currentSub.id,
      invoiceNumber: generateInvoiceNumber(),
      planKeySnapshot: targetPlan.key,
      planNameSnapshot: targetPlan.name,
      billingIntervalSnapshot: targetPlan.billingInterval,
      amountMinor: targetPlan.priceMinor,
      currency: targetPlan.currency,
      invoiceStatus: "OPEN",
      paymentStatus: "PENDING",
      provider: getSaasBillingConfig().providerName,
      periodStart: now,
      periodEnd,
      notes: `Checkout initiated for ${targetPlan.name} (${targetPlan.billingInterval})`,
    },
  });

  try {
    const checkoutSession = await createSaasCheckoutSession({
      restaurantId: params.restaurantId,
      subscriptionId: currentSub.id,
      invoiceId: openInvoice.id,
      planKey: targetPlan.key,
      planName: targetPlan.name,
      amountMinor: targetPlan.priceMinor,
      currency: targetPlan.currency,
      simulateTimeout: params.simulateTimeout,
    });

    const updatedInvoice = await prisma.subscriptionInvoice.update({
      where: { id: openInvoice.id },
      data: {
        providerOrderId: checkoutSession.providerOrderId,
        provider: checkoutSession.provider,
      },
    });

    return {
      mode: "CHECKOUT_CREATED" as const,
      subscription: currentSub,
      invoice: updatedInvoice,
      checkoutSession,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to initialize billing provider checkout";
    await prisma.subscriptionInvoice.update({
      where: { id: openInvoice.id },
      data: {
        invoiceStatus: "VOID",
        paymentStatus: "FAILED",
        failureReason: message,
      },
    });
    throw new BillingRuleError(
      "PROVIDER_CHECKOUT_ERROR",
      message,
      502
    );
  }
}

/**
 * Handles a restaurant owner's request to cancel their subscription.
 */
export async function requestOwnerSubscriptionCancellation(params: {
  restaurantId: string;
  immediate: boolean;
  reason?: string;
}) {
  const currentSub = await ensureRestaurantSubscription(params.restaurantId);
  const status = currentSub.status as SubscriptionStatus;

  if (status === "CANCELLED" || status === "EXPIRED") {
    throw new BillingRuleError(
      "ALREADY_INACTIVE",
      `Subscription is already ${status}.`,
      400
    );
  }

  const now = new Date();
  const shouldCancelImmediately = params.immediate || status === "TRIALING" || status === "INCOMPLETE";

  const updated = await prisma.restaurantSubscription.update({
    where: { id: currentSub.id },
    data: {
      status: shouldCancelImmediately ? "CANCELLED" : currentSub.status,
      cancelRequestedAt: now,
      cancelAtPeriodEnd: !shouldCancelImmediately,
      cancelledAt: shouldCancelImmediately ? now : null,
      notes: params.reason
        ? `Owner cancellation: ${params.reason}`
        : currentSub.notes,
      updatedAt: now,
    },
    include: { plan: true },
  });

  await createNotification({
    restaurantId: params.restaurantId,
    type: "SUBSCRIPTION_STATUS_CHANGED",
    title: shouldCancelImmediately
      ? "Subscription Cancelled"
      : "Cancellation Scheduled",
    message: shouldCancelImmediately
      ? `Your ${updated.planNameSnapshot} subscription has been cancelled.`
      : `Your ${updated.planNameSnapshot} subscription will cancel at the end of the current billing period.`,
    metadata: {
      subscriptionId: updated.id,
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    },
  });

  return updated;
}

/**
 * Processes a signature-verified SaaS billing webhook idempotently.
 * - Deduplicates via `providerEventId @unique`
 * - Rejects out-of-order stale events via `lastEventTimestamp`
 * - Never marks failed payments as PAID or ACTIVE
 */
export async function processVerifiedSubscriptionWebhook(params: {
  eventId: string;
  eventType: WebhookEventType;
  createdAt: number | string;
  rawPayload: string;
  data: {
    restaurantId: string;
    subscriptionId?: string;
    planId?: string;
    providerSubscriptionId?: string;
    providerPaymentId?: string;
    providerOrderId?: string;
    amountMinor?: number;
    currency?: string;
    periodDays?: number;
    failureReason?: string;
  };
}) {
  const eventTimestamp =
    typeof params.createdAt === "number"
      ? new Date(
          params.createdAt < 10_000_000_000
            ? params.createdAt * 1000
            : params.createdAt
        )
      : new Date(params.createdAt);

  if (Number.isNaN(eventTimestamp.getTime())) {
    throw new BillingRuleError("INVALID_WEBHOOK_TIMESTAMP", "Invalid createdAt timestamp", 400);
  }

  // Step 1: Idempotency check / reservation using unique providerEventId
  const existingEvent = await prisma.subscriptionWebhookEvent.findUnique({
    where: { providerEventId: params.eventId },
  });

  if (existingEvent) {
    return {
      duplicate: true,
      outOfOrder: false,
      status: existingEvent.status,
      eventId: existingEvent.providerEventId,
    };
  }

  let webhookRecord;
  try {
    webhookRecord = await prisma.subscriptionWebhookEvent.create({
      data: {
        provider: getSaasBillingConfig().providerName,
        providerEventId: params.eventId,
        eventType: params.eventType,
        restaurantId: params.data.restaurantId,
        subscriptionId: params.data.subscriptionId ?? null,
        eventCreatedAt: eventTimestamp,
        status: "PROCESSING",
        payloadJson: params.rawPayload,
      },
    });
  } catch (err: unknown) {
    const isUnique =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";
    if (isUnique) {
      return {
        duplicate: true,
        outOfOrder: false,
        status: "PROCESSED",
        eventId: params.eventId,
      };
    }
    throw err;
  }

  const currentSub = await ensureRestaurantSubscription(params.data.restaurantId);

  // Step 2: Out-of-order / stale webhook protection
  if (
    currentSub.lastEventTimestamp &&
    eventTimestamp.getTime() < currentSub.lastEventTimestamp.getTime()
  ) {
    await prisma.subscriptionWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: {
        status: "IGNORED_OUT_OF_ORDER",
        processedAt: new Date(),
        errorMessage: `Ignored stale webhook (${eventTimestamp.toISOString()} < ${currentSub.lastEventTimestamp.toISOString()})`,
      },
    });

    return {
      duplicate: false,
      outOfOrder: true,
      status: "IGNORED_OUT_OF_ORDER",
      eventId: params.eventId,
    };
  }

  const now = new Date();
  let targetPlan = currentSub.plan;
  if (params.data.planId && params.data.planId !== currentSub.planId) {
    const foundPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: params.data.planId },
    });
    if (foundPlan) {
      targetPlan = foundPlan;
    }
  }

  // Step 3: Process event atomically
  if (
    params.eventType === "subscription.charged" ||
    params.eventType === "subscription.activated" ||
    params.eventType === "invoice.paid" ||
    params.eventType === "invoice.payment_succeeded"
  ) {
    const periodDays =
      params.data.periodDays ??
      (targetPlan.billingInterval === "YEARLY" ? 365 : 30);
    const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const amountMinor = params.data.amountMinor ?? targetPlan.priceMinor;
    const currency = params.data.currency ?? targetPlan.currency;

    await prisma.$transaction(async (tx) => {
      await tx.restaurantSubscription.update({
        where: { id: currentSub.id },
        data: {
          planId: targetPlan.id,
          status: "ACTIVE",
          planKeySnapshot: targetPlan.key,
          planNameSnapshot: targetPlan.name,
          billingIntervalSnapshot: targetPlan.billingInterval,
          priceMinorSnapshot: targetPlan.priceMinor,
          currencySnapshot: targetPlan.currency,
          maxStaffSnapshot: targetPlan.maxStaff,
          maxMenuItemsSnapshot: targetPlan.maxMenuItems,
          maxTablesSnapshot: targetPlan.maxTables,
          analyticsEnabledSnapshot: targetPlan.analyticsEnabled,
          analyticsExportEnabledSnapshot: targetPlan.analyticsExportEnabled,
          inventoryEnabledSnapshot: targetPlan.inventoryEnabled,
          customBrandingEnabledSnapshot: targetPlan.customBrandingEnabled,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          provider: getSaasBillingConfig().providerName,
          providerSubscriptionId:
            params.data.providerSubscriptionId ?? currentSub.providerSubscriptionId,
          lastEventTimestamp: eventTimestamp,
          updatedAt: now,
        },
      });

      // Update matching OPEN invoice if providerOrderId matches, else create verified PAID invoice
      const existingOpenInvoice = params.data.providerOrderId
        ? await tx.subscriptionInvoice.findFirst({
            where: {
              restaurantId: params.data.restaurantId,
              providerOrderId: params.data.providerOrderId,
            },
          })
        : null;

      if (existingOpenInvoice) {
        await tx.subscriptionInvoice.update({
          where: { id: existingOpenInvoice.id },
          data: {
            invoiceStatus: "PAID",
            paymentStatus: "SUCCEEDED",
            providerPaymentId: params.data.providerPaymentId ?? null,
            paidAt: now,
            verifiedBySource: "WEBHOOK",
            periodStart: now,
            periodEnd,
          },
        });
      } else {
        await tx.subscriptionInvoice.create({
          data: {
            restaurantId: params.data.restaurantId,
            subscriptionId: currentSub.id,
            invoiceNumber: generateInvoiceNumber(),
            planKeySnapshot: targetPlan.key,
            planNameSnapshot: targetPlan.name,
            billingIntervalSnapshot: targetPlan.billingInterval,
            amountMinor,
            currency,
            invoiceStatus: "PAID",
            paymentStatus: "SUCCEEDED",
            provider: getSaasBillingConfig().providerName,
            providerOrderId: params.data.providerOrderId ?? null,
            providerPaymentId: params.data.providerPaymentId ?? null,
            periodStart: now,
            periodEnd,
            paidAt: now,
            verifiedBySource: "WEBHOOK",
          },
        });
      }

      await tx.subscriptionWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          subscriptionId: currentSub.id,
          status: "PROCESSED",
          processedAt: now,
        },
      });
    });

    await createNotification({
      restaurantId: params.data.restaurantId,
      type: "SUBSCRIPTION_STATUS_CHANGED",
      title: "Subscription Active",
      message: `Payment confirmed for your ${targetPlan.name} plan. Your subscription is active.`,
      metadata: {
        subscriptionId: currentSub.id,
        planKey: targetPlan.key,
        eventId: params.eventId,
      },
    });
  } else if (
    params.eventType === "payment.failed" ||
    params.eventType === "invoice.payment_failed" ||
    params.eventType === "subscription.halted"
  ) {
    const nextStatus: SubscriptionStatus =
      currentSub.status === "INCOMPLETE" ? "INCOMPLETE" : "PAST_DUE";

    await prisma.$transaction(async (tx) => {
      await tx.restaurantSubscription.update({
        where: { id: currentSub.id },
        data: {
          status: nextStatus,
          lastEventTimestamp: eventTimestamp,
          updatedAt: now,
        },
      });

      const existingOpenInvoice = params.data.providerOrderId
        ? await tx.subscriptionInvoice.findFirst({
            where: {
              restaurantId: params.data.restaurantId,
              providerOrderId: params.data.providerOrderId,
            },
          })
        : null;

      if (existingOpenInvoice) {
        await tx.subscriptionInvoice.update({
          where: { id: existingOpenInvoice.id },
          data: {
            invoiceStatus: "FAILED",
            paymentStatus: "FAILED",
            failureReason:
              params.data.failureReason ?? "Payment charge failed at provider",
            verifiedBySource: "WEBHOOK",
          },
        });
      } else {
        await tx.subscriptionInvoice.create({
          data: {
            restaurantId: params.data.restaurantId,
            subscriptionId: currentSub.id,
            invoiceNumber: generateInvoiceNumber(),
            planKeySnapshot: currentSub.planKeySnapshot,
            planNameSnapshot: currentSub.planNameSnapshot,
            billingIntervalSnapshot: currentSub.billingIntervalSnapshot,
            amountMinor: params.data.amountMinor ?? currentSub.priceMinorSnapshot,
            currency: params.data.currency ?? currentSub.currencySnapshot,
            invoiceStatus: "FAILED",
            paymentStatus: "FAILED",
            provider: getSaasBillingConfig().providerName,
            providerOrderId: params.data.providerOrderId ?? null,
            providerPaymentId: params.data.providerPaymentId ?? null,
            failureReason:
              params.data.failureReason ?? "Payment charge failed at provider",
            verifiedBySource: "WEBHOOK",
          },
        });
      }

      await tx.subscriptionWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          subscriptionId: currentSub.id,
          status: "PROCESSED",
          processedAt: now,
        },
      });
    });

    await createNotification({
      restaurantId: params.data.restaurantId,
      type: "SUBSCRIPTION_STATUS_CHANGED",
      title: "Subscription Payment Failed",
      message: `A subscription payment attempt for ${currentSub.planNameSnapshot} failed. Please check your billing details.`,
      metadata: {
        subscriptionId: currentSub.id,
        status: nextStatus,
        eventId: params.eventId,
      },
    });
  } else if (params.eventType === "subscription.cancelled") {
    await prisma.$transaction(async (tx) => {
      await tx.restaurantSubscription.update({
        where: { id: currentSub.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelAtPeriodEnd: false,
          lastEventTimestamp: eventTimestamp,
          updatedAt: now,
        },
      });

      await tx.subscriptionWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          subscriptionId: currentSub.id,
          status: "PROCESSED",
          processedAt: now,
        },
      });
    });
  }

  return {
    duplicate: false,
    outOfOrder: false,
    status: "PROCESSED",
    eventId: params.eventId,
  };
}
