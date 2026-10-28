import { z } from "zod";

export const receiptQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ALL", "PAID", "REFUNDED", "VOID"]).default("ALL"),
  channel: z.enum(["ALL", "EMAIL", "WHATSAPP", "SMS", "IN_APP"]).default("ALL"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["recent", "total", "receiptNumber"]).default("recent"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ReceiptQueryInput = z.infer<typeof receiptQuerySchema>;

export const resendReceiptSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  recipient: z.string().trim().min(3).max(100).optional(),
});

export type ResendReceiptInput = z.infer<typeof resendReceiptSchema>;

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "****";
  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-2);
  return `${start}****${end}`;
}

/**
 * Format a human-readable receipt number e.g. REC-2026-0001
 */
export function formatReceiptNumber(seq: number, year: number = new Date().getFullYear()): string {
  const padded = String(seq).padStart(4, "0");
  return `REC-${year}-${padded}`;
}
