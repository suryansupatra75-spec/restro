import { z } from "zod";

export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PROMOTION_SCOPES = ["ALL", "CATEGORIES", "ITEMS"] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

export const PROMOTION_STATUSES = ["ACTIVE", "DISABLED", "ARCHIVED"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export function normalizeCouponCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

const couponCodeField = z
  .string()
  .min(3, "Coupon code must be at least 3 characters.")
  .max(24, "Coupon code cannot exceed 24 characters.")
  .transform((val) => normalizeCouponCode(val))
  .refine(
    (val) => /^[A-Z0-9_-]{3,24}$/.test(val),
    "Coupon code may only contain letters, numbers, hyphens, and underscores (3-24 characters)."
  );

const nullableDateField = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((val) => {
    if (!val) return null;
    if (val instanceof Date) return val;
    const trimmed = val.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? ("INVALID_DATE" as unknown as Date) : parsed;
  })
  .refine((val) => val === null || (val instanceof Date && !Number.isNaN(val.getTime())), {
    message: "Invalid date format.",
  });

const nullablePositiveIntField = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "number" ? val : Number(val);
    return num;
  })
  .refine(
    (val) => val === null || (Number.isInteger(val) && val >= 1 && val <= 1_000_000),
    "Usage limit must be a whole number of at least 1."
  );

const nullablePositiveMoneyField = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "number" ? val : Number(val);
    return num;
  })
  .refine(
    (val) => val === null || (Number.isFinite(val) && val > 0 && val <= 1_000_000),
    "Maximum discount cap must be greater than 0."
  );

export const createPromotionSchema = z
  .object({
    code: couponCodeField,
    name: z
      .string()
      .trim()
      .min(2, "Promotion name must be at least 2 characters.")
      .max(100, "Promotion name cannot exceed 100 characters."),
    description: z
      .string()
      .trim()
      .max(400, "Description cannot exceed 400 characters.")
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: z.coerce
      .number()
      .refine((v) => Number.isFinite(v) && v > 0 && v <= 1_000_000, {
        message: "Discount value must be greater than 0.",
      }),
    minOrderSubtotal: z.coerce
      .number()
      .default(0)
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1_000_000, {
        message: "Minimum order subtotal cannot be negative.",
      }),
    maxDiscountAmount: nullablePositiveMoneyField.optional().default(null),
    appliesTo: z.enum(PROMOTION_SCOPES).default("ALL"),
    eligibleCategoryIds: z.array(z.string().min(1)).optional().default([]),
    eligibleItemIds: z.array(z.string().min(1)).optional().default([]),
    firstOrderOnly: z.boolean().optional().default(false),
    startsAt: nullableDateField.optional().default(null),
    endsAt: nullableDateField.optional().default(null),
    maxUsesTotal: nullablePositiveIntField.optional().default(null),
    maxUsesPerCustomer: nullablePositiveIntField.optional().default(null),
    status: z.enum(["ACTIVE", "DISABLED"]).optional().default("ACTIVE"),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "PERCENTAGE" && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percentage discount cannot exceed 100%.",
      });
    }
    if (data.startsAt && data.endsAt && data.endsAt.getTime() <= data.startsAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End date/time must be after start date/time.",
      });
    }
    if (data.appliesTo === "CATEGORIES" && data.eligibleCategoryIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eligibleCategoryIds"],
        message: "Select at least one eligible menu category.",
      });
    }
    if (data.appliesTo === "ITEMS" && data.eligibleItemIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eligibleItemIds"],
        message: "Select at least one eligible menu item.",
      });
    }
  });

export const updatePromotionSchema = z
  .object({
    code: couponCodeField.optional(),
    name: z
      .string()
      .trim()
      .min(2, "Promotion name must be at least 2 characters.")
      .max(100, "Promotion name cannot exceed 100 characters.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(400, "Description cannot exceed 400 characters.")
      .optional()
      .nullable()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    discountType: z.enum(DISCOUNT_TYPES).optional(),
    discountValue: z.coerce
      .number()
      .refine((v) => Number.isFinite(v) && v > 0 && v <= 1_000_000, {
        message: "Discount value must be greater than 0.",
      })
      .optional(),
    minOrderSubtotal: z.coerce
      .number()
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1_000_000, {
        message: "Minimum order subtotal cannot be negative.",
      })
      .optional(),
    maxDiscountAmount: nullablePositiveMoneyField.optional(),
    appliesTo: z.enum(PROMOTION_SCOPES).optional(),
    eligibleCategoryIds: z.array(z.string().min(1)).optional(),
    eligibleItemIds: z.array(z.string().min(1)).optional(),
    firstOrderOnly: z.boolean().optional(),
    startsAt: nullableDateField.optional(),
    endsAt: nullableDateField.optional(),
    maxUsesTotal: nullablePositiveIntField.optional(),
    maxUsesPerCustomer: nullablePositiveIntField.optional(),
    status: z.enum(PROMOTION_STATUSES).optional(),
  });

export const validateCouponItemSchema = z.object({
  menuItemId: z.string().min(1, "menuItemId is required"),
  quantity: z.coerce
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(100, "Quantity cannot exceed 100"),
  variantId: z.string().optional().nullable(),
  addonIds: z.array(z.string()).optional().default([]),
});

export const validateCouponRequestSchema = z.object({
  token: z.string().min(1, "Table QR token is required."),
  code: z
    .string()
    .min(1, "Please enter a coupon code.")
    .max(32, "Coupon code is too long.")
    .transform((v) => normalizeCouponCode(v)),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  customerEmail: z.string().trim().max(120).optional().nullable(),
  items: z.array(validateCouponItemSchema).min(1, "Your cart is empty."),
});
