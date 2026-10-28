import { z } from "zod";

export const ALLOWED_API_SCOPES = [
  "orders:read",
  "menu:read",
  "inventory:read",
  "analytics:read",
] as const;

export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];

export const ALLOWED_WEBHOOK_EVENTS = [
  "order.created",
  "order.status_changed",
  "payment.completed",
  "inventory.low_stock",
] as const;

export type WebhookEvent = (typeof ALLOWED_WEBHOOK_EVENTS)[number];

export const printerConfigSchema = z.object({
  paperWidth: z.enum(["58mm", "80mm"]).default("80mm"),
  headerText: z.string().max(200).optional().nullable(),
  footerText: z.string().max(200).optional().nullable(),
  taxIdText: z.string().max(50).optional().nullable(),
  showPricesOnKot: z.boolean().default(false),
  showNotes: z.boolean().default(true),
  autoPrintPrompt: z.boolean().default(false),
  connectionType: z.enum(["BROWSER", "NETWORK_ESC_POS"]).default("BROWSER"),
  networkPrinterIp: z.string().max(100).optional().nullable(),
  networkPrinterPort: z.number().int().min(1).max(65535).optional().nullable(),
});

export type PrinterConfig = z.infer<typeof printerConfigSchema>;

export const emailConfigSchema = z.object({
  provider: z.enum(["SMTP", "RESEND"]).default("SMTP"),
  host: z.string().max(200).optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  secure: z.boolean().default(true),
  username: z.string().max(200).optional().nullable(),
  password: z.string().max(200).optional().nullable(),
  apiKey: z.string().max(200).optional().nullable(),
  fromEmail: z.string().email().optional().nullable().or(z.literal("")),
  fromName: z.string().max(100).optional().nullable(),
  orderConfirmationEnabled: z.boolean().default(true),
  lowStockAlertsEnabled: z.boolean().default(true),
});

export type EmailConfig = z.infer<typeof emailConfigSchema>;

export const whatsappConfigSchema = z.object({
  provider: z.enum(["META_CLOUD", "TWILIO"]).default("META_CLOUD"),
  phoneNumberId: z.string().max(100).optional().nullable(),
  businessAccountId: z.string().max(100).optional().nullable(),
  accessToken: z.string().max(500).optional().nullable(),
  twilioAccountSid: z.string().max(100).optional().nullable(),
  twilioAuthToken: z.string().max(100).optional().nullable(),
  twilioFromNumber: z.string().max(50).optional().nullable(),
  orderUpdatesEnabled: z.boolean().default(true),
  requireExplicitConsent: z.boolean().default(true),
});

export type WhatsAppConfig = z.infer<typeof whatsappConfigSchema>;

export const integrationUpdateSchema = z.object({
  providerType: z.enum(["PRINTER", "EMAIL", "WHATSAPP", "ACCOUNTING"]),
  isEnabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()),
});

export const integrationTestSchema = z.object({
  providerType: z.enum(["PRINTER", "EMAIL", "WHATSAPP"]),
  testTarget: z.string().max(200).optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1, "Key name is required").max(100),
  scopes: z.array(z.enum(ALLOWED_API_SCOPES)).min(1, "Select at least one scope"),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
});

export const createWebhookSchema = z.object({
  name: z.string().min(1, "Webhook name is required").max(100),
  url: z.string().url("Must be a valid URL starting with http:// or https://"),
  events: z.array(z.enum(ALLOWED_WEBHOOK_EVENTS)).min(1, "Select at least one event"),
  isActive: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(ALLOWED_WEBHOOK_EVENTS)).optional(),
  isActive: z.boolean().optional(),
});

export const recordPrintJobSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  printType: z.enum(["BILL", "KOT"]),
  printerName: z.string().max(100).optional(),
});

export const exportLedgerQuerySchema = z.object({
  type: z.enum(["sales_ledger", "tax_report", "profit_loss"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  format: z.enum(["csv", "json"]).default("csv"),
});
