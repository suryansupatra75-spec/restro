import { z } from "zod";

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
  "INCOMPLETE",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const INVOICE_STATUSES = ["OPEN", "PAID", "FAILED", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const SUBSCRIPTION_PAYMENT_STATUSES = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "NOT_APPLICABLE",
] as const;
export type SubscriptionPaymentStatus = (typeof SUBSCRIPTION_PAYMENT_STATUSES)[number];

export const createPlanSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(2, "Plan key must be at least 2 characters")
      .max(50, "Plan key cannot exceed 50 characters")
      .regex(/^[A-Z0-9_]+$/, "Plan key must be uppercase letters, numbers, and underscores only"),
    name: z.string().trim().min(2, "Name is required").max(80),
    description: z.string().trim().max(300).nullable().optional(),
    billingInterval: z.enum(BILLING_INTERVALS).default("MONTHLY"),
    priceMinor: z
      .number()
      .int("Price must be an integer in minor units (paise)")
      .min(0, "Price cannot be negative")
      .max(100_000_000, "Price exceeds maximum allowed value"),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code")
      .default("INR"),
    trialDays: z.number().int().min(0).max(365).default(14),
    isActive: z.boolean().default(true),
    isArchived: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    maxStaff: z.number().int().min(1, "Max staff must be at least 1").max(10000),
    maxMenuItems: z.number().int().min(1, "Max menu items must be at least 1").max(100000),
    maxTables: z.number().int().min(1, "Max tables must be at least 1").max(10000),
    analyticsEnabled: z.boolean().default(false),
    analyticsExportEnabled: z.boolean().default(false),
    inventoryEnabled: z.boolean().default(false),
    customBrandingEnabled: z.boolean().default(false),
  })
  .strict();

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    billingInterval: z.enum(BILLING_INTERVALS).optional(),
    priceMinor: z.number().int().min(0).max(100_000_000).optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    isActive: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    maxStaff: z.number().int().min(1).max(10000).optional(),
    maxMenuItems: z.number().int().min(1).max(100000).optional(),
    maxTables: z.number().int().min(1).max(10000).optional(),
    analyticsEnabled: z.boolean().optional(),
    analyticsExportEnabled: z.boolean().optional(),
    inventoryEnabled: z.boolean().optional(),
    customBrandingEnabled: z.boolean().optional(),
  })
  .strict();

export const superAdminAssignSubscriptionSchema = z
  .object({
    restaurantId: z.string().trim().min(1, "restaurantId is required"),
    planId: z.string().trim().min(1, "planId is required"),
    status: z.enum(SUBSCRIPTION_STATUSES).default("TRIALING"),
    trialDays: z.number().int().min(0).max(365).optional(),
    periodDays: z.number().int().min(1).max(366).optional(),
    recordManualInvoicePaid: z.boolean().optional().default(false),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const superAdminUpdateSubscriptionSchema = z
  .object({
    planId: z.string().trim().min(1).optional(),
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    periodDays: z.number().int().min(1).max(366).optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    recordManualInvoicePaid: z.boolean().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * Strict schema for restaurant owner plan selection / checkout initiation.
 * Uses .strict() so any client-supplied status, priceMinor, paid flag, or restaurantId
 * is immediately rejected with 400.
 */
export const ownerCheckoutRequestSchema = z
  .object({
    planId: z.string().trim().min(1, "planId is required"),
    action: z.enum(["START_TRIAL", "CREATE_CHECKOUT"]).default("CREATE_CHECKOUT"),
  })
  .strict();

export const ownerCancelSubscriptionSchema = z
  .object({
    immediate: z.boolean().optional().default(false),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export const WEBHOOK_EVENT_TYPES = [
  "subscription.charged",
  "subscription.activated",
  "subscription.halted",
  "subscription.cancelled",
  "payment.failed",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const subscriptionWebhookPayloadSchema = z.object({
  eventId: z.string().trim().min(3).max(120),
  eventType: z.enum(WEBHOOK_EVENT_TYPES),
  createdAt: z.union([z.number(), z.string()]),
  data: z.object({
    restaurantId: z.string().trim().min(1),
    subscriptionId: z.string().trim().optional(),
    planId: z.string().trim().optional(),
    providerSubscriptionId: z.string().trim().optional(),
    providerPaymentId: z.string().trim().optional(),
    providerOrderId: z.string().trim().optional(),
    amountMinor: z.number().int().min(0).optional(),
    currency: z.string().trim().optional(),
    periodDays: z.number().int().min(1).max(366).optional(),
    failureReason: z.string().trim().max(500).optional(),
  }),
});
