import { z } from "zod";

export const NOTIFICATION_EVENT_TYPES = [
  "ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "PAYMENT_STATUS_CHANGED",
  "INVENTORY_LOW",
  "STAFF_ACCESS_CHANGED",
  "SUBSCRIPTION_STATUS_CHANGED",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  "ORDERS",
  "PAYMENTS",
  "INVENTORY",
  "STAFF",
  "BILLING",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;

export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const notificationQuerySchema = z.object({
  restaurantId: z.string().uuid().optional(),
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  category: z
    .enum(["ALL", ...NOTIFICATION_CATEGORIES])
    .optional()
    .default("ALL"),
  eventType: z
    .enum(["ALL", ...NOTIFICATION_EVENT_TYPES])
    .optional()
    .default("ALL"),
  since: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const parsed = Date.parse(val);
        return !Number.isNaN(parsed);
      },
      { message: "Invalid 'since' timestamp" }
    ),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const updateNotificationPreferencesSchema = z
  .object({
    restaurantId: z.string().uuid().optional(),
    orderCreated: z.boolean().optional(),
    orderStatusChanged: z.boolean().optional(),
    paymentStatusChanged: z.boolean().optional(),
    inventoryLow: z.boolean().optional(),
    staffAccessChanged: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
  })
  .strict();

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

/**
 * Ensures action URLs inside notifications only point to safe internal dashboard routes.
 * Rejects external URLs, protocol-relative URLs, and javascript:/data: URIs.
 */
export function sanitizeActionUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("/dashboard")) {
    return null;
  }
  if (trimmed.startsWith("//") || trimmed.includes("\\")) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("javascript:") ||
    lower.includes("data:") ||
    lower.includes("vbscript:")
  ) {
    return null;
  }
  return trimmed;
}
