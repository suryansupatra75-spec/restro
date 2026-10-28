import { z } from "zod";

export const uuidParamSchema = z.string().uuid("Invalid identifier format");

export const SUPPORTED_RESTAURANT_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
] as const;
export type SupportedRestaurantStatus =
  (typeof SUPPORTED_RESTAURANT_STATUSES)[number];

export const RESTAURANT_SORT_FIELDS = [
  "createdAt",
  "name",
  "status",
  "ordersCount",
] as const;
export const USER_SORT_FIELDS = ["createdAt", "name", "email"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export const restaurantDirectoryQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100, "Search query cannot exceed 100 characters")
      .optional()
      .default(""),
    status: z
      .enum(["ALL", "ACTIVE", "SUSPENDED", "INACTIVE"])
      .optional()
      .default("ALL"),
    sortBy: z.enum(RESTAURANT_SORT_FIELDS).optional().default("createdAt"),
    sortOrder: z.enum(SORT_DIRECTIONS).optional().default("desc"),
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be at least 1")
      .max(10000)
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(50, "Limit cannot exceed 50 items per page")
      .optional()
      .default(10),
  })
  .strict();

export const updateRestaurantStatusSchema = z
  .object({
    status: z.enum(SUPPORTED_RESTAURANT_STATUSES),
    reason: z
      .string()
      .trim()
      .min(3, "A reason of at least 3 characters is required for status changes")
      .max(500, "Reason cannot exceed 500 characters"),
    confirm: z.literal(true, {
      message:
        "Explicit confirmation (confirm: true) is required for status changes",
    }),
  })
  .strict();

export const userDirectoryQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100, "Search query cannot exceed 100 characters")
      .optional()
      .default(""),
    role: z
      .enum([
        "ALL",
        "SUPER_ADMIN",
        "OWNER",
        "MANAGER",
        "STAFF",
        "KITCHEN",
        "NO_RESTAURANT",
      ])
      .optional()
      .default("ALL"),
    status: z.enum(["ALL", "ACTIVE", "DISABLED"]).optional().default("ALL"),
    sortBy: z.enum(USER_SORT_FIELDS).optional().default("createdAt"),
    sortOrder: z.enum(SORT_DIRECTIONS).optional().default("desc"),
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be at least 1")
      .max(10000)
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(50, "Limit cannot exceed 50 items per page")
      .optional()
      .default(10),
  })
  .strict();

export const updatePlatformUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    reason: z
      .string()
      .trim()
      .min(
        3,
        "A reason of at least 3 characters is required for platform user actions"
      )
      .max(500, "Reason cannot exceed 500 characters"),
    confirm: z.literal(true, {
      message:
        "Explicit confirmation (confirm: true) is required for platform user actions",
    }),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.isActive === undefined && data.isSuperAdmin === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isActive"],
        message: "At least one of isActive or isSuperAdmin must be specified",
      });
    }
  });

export const auditLogQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(100, "Search query cannot exceed 100 characters")
      .optional()
      .default(""),
    action: z
      .string()
      .trim()
      .max(100)
      .optional()
      .default("ALL"),
    targetType: z
      .enum(["ALL", "RESTAURANT", "USER", "SYSTEM"])
      .optional()
      .default("ALL"),
    page: z.coerce
      .number()
      .int()
      .min(1, "Page must be at least 1")
      .max(10000)
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(50, "Limit cannot exceed 50 items per page")
      .optional()
      .default(20),
  })
  .strict();
