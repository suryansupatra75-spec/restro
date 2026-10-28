import { z } from "zod";

/**
 * Standard Audit Action Enums
 */
export const AUDIT_ACTIONS = {
  // Authentication & Account
  AUTH_LOGIN_SUCCESS: "AUTH_LOGIN_SUCCESS",
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  AUTH_LOGOUT: "AUTH_LOGOUT",
  AUTH_PASSWORD_CHANGED: "AUTH_PASSWORD_CHANGED",
  AUTH_PASSWORD_RESET_REQUESTED: "AUTH_PASSWORD_RESET_REQUESTED",
  AUTH_PROFILE_UPDATED: "AUTH_PROFILE_UPDATED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_REACTIVATED: "USER_REACTIVATED",

  // Staff & Roles
  STAFF_INVITED: "STAFF_INVITED",
  INVITATION_ACCEPTED: "INVITATION_ACCEPTED",
  INVITATION_CANCELLED: "INVITATION_CANCELLED",
  ROLE_CHANGED: "ROLE_CHANGED",
  STAFF_DISABLED: "STAFF_DISABLED",
  STAFF_ENABLED: "STAFF_ENABLED",
  STAFF_REMOVED: "STAFF_REMOVED",

  // Restaurant Settings
  RESTAURANT_SETTINGS_UPDATED: "RESTAURANT_SETTINGS_UPDATED",
  BUSINESS_HOURS_UPDATED: "BUSINESS_HOURS_UPDATED",
  TAX_SETTINGS_UPDATED: "TAX_SETTINGS_UPDATED",

  // Menu & Catalog
  MENU_CATEGORY_CREATED: "MENU_CATEGORY_CREATED",
  MENU_CATEGORY_UPDATED: "MENU_CATEGORY_UPDATED",
  MENU_CATEGORY_DELETED: "MENU_CATEGORY_DELETED",
  MENU_ITEM_CREATED: "MENU_ITEM_CREATED",
  MENU_ITEM_UPDATED: "MENU_ITEM_UPDATED",
  MENU_ITEM_DELETED: "MENU_ITEM_DELETED",

  // Tables & QR
  TABLE_CREATED: "TABLE_CREATED",
  TABLE_UPDATED: "TABLE_UPDATED",
  TABLE_DELETED: "TABLE_DELETED",
  QR_CODE_GENERATED: "QR_CODE_GENERATED",

  // Orders
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_STATUS_UPDATED: "ORDER_STATUS_UPDATED",
  ORDER_CANCELLED: "ORDER_CANCELLED",

  // Payments & Refunds
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  REFUND_ISSUED: "REFUND_ISSUED",

  // Digital Receipts
  RECEIPT_ISSUED: "RECEIPT_ISSUED",
  RECEIPT_RESENT: "RECEIPT_RESENT",
  RECEIPT_REFUNDED: "RECEIPT_REFUNDED",

  // Subscriptions & Entitlements
  SUBSCRIPTION_CREATED: "SUBSCRIPTION_CREATED",
  SUBSCRIPTION_UPDATED: "SUBSCRIPTION_UPDATED",
  SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",
  ENTITLEMENT_CHECK_FAILED: "ENTITLEMENT_CHECK_FAILED",

  // Promotions & Loyalty
  PROMOTION_CREATED: "PROMOTION_CREATED",
  PROMOTION_UPDATED: "PROMOTION_UPDATED",
  LOYALTY_PROGRAM_UPDATED: "LOYALTY_PROGRAM_UPDATED",
  LOYALTY_POINTS_ADJUSTED: "LOYALTY_POINTS_ADJUSTED",

  // Inventory
  INVENTORY_ITEM_CREATED: "INVENTORY_ITEM_CREATED",
  INVENTORY_STOCK_ADJUSTED: "INVENTORY_STOCK_ADJUSTED",
  RECIPE_UPDATED: "RECIPE_UPDATED",

  // Integrations & Developer
  INTEGRATION_CONFIGURED: "INTEGRATION_CONFIGURED",
  API_KEY_GENERATED: "API_KEY_GENERATED",
  API_KEY_REVOKED: "API_KEY_REVOKED",
  WEBHOOK_CREATED: "WEBHOOK_CREATED",
  WEBHOOK_DELIVERY_FAILED: "WEBHOOK_DELIVERY_FAILED",

  // Security & Exports
  DATA_EXPORTED: "DATA_EXPORTED",
  SUPER_ADMIN_ACTION: "SUPER_ADMIN_ACTION",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  SUSPICIOUS_REQUEST_BLOCKED: "SUSPICIOUS_REQUEST_BLOCKED",
} as const;

export type AuditActionType = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Standard Resource Types
 */
export const AUDIT_RESOURCE_TYPES = [
  "AUTH",
  "USER",
  "STAFF",
  "RESTAURANT",
  "MENU",
  "TABLE",
  "ORDER",
  "PAYMENT",
  "REFUND",
  "RECEIPT",
  "BILLING",
  "PROMOTION",
  "LOYALTY",
  "INVENTORY",
  "INTEGRATION",
  "EXPORT",
  "SECURITY",
  "SUPER_ADMIN",
] as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

export const AUDIT_OUTCOMES = ["SUCCESS", "FAILURE", "DENIED"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Audit Log Query Schema
 */
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(5000).default(20),
  search: z.string().optional(),
  action: z.string().optional().default("ALL"),
  resourceType: z.string().optional().default("ALL"),
  outcome: z.enum(["ALL", "SUCCESS", "FAILURE", "DENIED"]).optional().default("ALL"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  actorId: z.string().optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/**
 * Keys that contain sensitive security credentials, passwords, or tokens.
 * Values for these keys will be strictly redacted before persistence.
 */
const SENSITIVE_KEY_REGEX =
  /password|passwordhash|token|secret|apikey|cardnumber|cvv|authorization|cookie|session|credential|pin/i;

/**
 * Deep recursive secret redaction for audit log metadata payloads.
 * Strictly guarantees that raw passwords, tokens, API keys, or financial secrets
 * are never written to the audit storage.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof val === "object" && val !== null) {
        sanitized[key] = redactSensitiveData(val);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }

  return String(data);
}

/**
 * CSV formula injection protection.
 * Prefixes cells starting with dangerous characters (=, +, -, @, \t, \r) with an apostrophe.
 * Escapes internal quotes and wraps field in double quotes.
 */
export function sanitizeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);

  let safeStr = str;
  if (/^[=+\-@\t\r]/.test(safeStr)) {
    safeStr = `'${safeStr}`;
  }

  safeStr = safeStr.replace(/"/g, '""');
  return `"${safeStr}"`;
}
