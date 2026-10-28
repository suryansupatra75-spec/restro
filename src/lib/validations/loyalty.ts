import { z } from "zod";

export const loyaltyProgramSchema = z.object({
  isEnabled: z.boolean().default(true),
  pointsPerCurrencyUnit: z
    .number()
    .min(0.01, "Points per currency unit must be at least 0.01")
    .max(1000, "Points per currency unit cannot exceed 1000")
    .default(1),
  minOrderSubtotalForEarning: z
    .number()
    .min(0, "Minimum order subtotal cannot be negative")
    .max(100000, "Minimum order subtotal cannot exceed 100,000")
    .default(0),
  redemptionRate: z
    .number()
    .min(0.0001, "Redemption rate must be at least 0.0001")
    .max(1000, "Redemption rate cannot exceed 1000")
    .default(0.05),
  minRedemptionPoints: z
    .number()
    .int("Minimum redemption points must be an integer")
    .min(1, "Minimum redemption points must be at least 1")
    .max(1000000, "Minimum redemption points cannot exceed 1,000,000")
    .default(50),
  redemptionStepPoints: z
    .number()
    .int("Redemption step points must be an integer")
    .min(1, "Redemption step must be at least 1")
    .max(10000, "Redemption step cannot exceed 10,000")
    .default(10),
  maxBillPercentagePayable: z
    .number()
    .int("Max percentage must be an integer")
    .min(1, "Max percentage must be at least 1%")
    .max(100, "Max percentage cannot exceed 100%")
    .default(50),
  pointsExpiryDays: z
    .number()
    .int("Expiry days must be an integer")
    .min(1, "Expiry days must be at least 1")
    .max(3650, "Expiry days cannot exceed 3,650 days (10 years)")
    .nullable()
    .optional(),
  eligibleOrderState: z
    .enum(["COMPLETED", "READY", "PAID"])
    .default("COMPLETED"),
});

export const loyaltyRewardSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters").nullable().optional(),
  pointsCost: z
    .number()
    .int("Points cost must be an integer")
    .min(1, "Points cost must be at least 1 point")
    .max(1000000, "Points cost cannot exceed 1,000,000 points"),
  rewardType: z.enum(["DISCOUNT", "FREE_ITEM"]).default("DISCOUNT"),
  discountType: z.enum(["FIXED", "PERCENTAGE"]).default("FIXED"),
  discountValue: z
    .number()
    .min(0, "Discount value cannot be negative")
    .default(0),
  freeMenuItemId: z.string().uuid("Invalid menu item ID").nullable().optional(),
  minOrderSubtotal: z
    .number()
    .min(0, "Minimum order subtotal cannot be negative")
    .default(0),
  maxRedemptionsTotal: z
    .number()
    .int()
    .min(1, "Total redemption limit must be at least 1")
    .nullable()
    .optional(),
  maxRedemptionsPerCustomer: z
    .number()
    .int()
    .min(1, "Per-customer redemption limit must be at least 1")
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const loyaltyManualAdjustmentSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  points: z
    .number()
    .int("Adjustment points must be a non-zero integer")
    .refine((v) => v !== 0, "Adjustment cannot be 0 points")
    .refine((v) => Math.abs(v) <= 1000000, "Adjustment cannot exceed 1,000,000 points"),
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters")
    .max(255, "Reason cannot exceed 255 characters"),
});

export const loyaltyLookupSchema = z.object({
  token: z.string().trim().min(1, "QR token is required"),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email address").optional(),
}).refine(
  (data) => Boolean(data.phone || data.email),
  { message: "Either phone or email must be provided to look up loyalty profile" }
);

export type LoyaltyProgramInput = z.infer<typeof loyaltyProgramSchema>;
export type LoyaltyRewardInput = z.infer<typeof loyaltyRewardSchema>;
export type LoyaltyManualAdjustmentInput = z.infer<typeof loyaltyManualAdjustmentSchema>;
export type LoyaltyLookupInput = z.infer<typeof loyaltyLookupSchema>;
