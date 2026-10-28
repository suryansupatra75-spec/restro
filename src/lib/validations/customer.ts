import { z } from "zod";

export const customerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(["recent", "orders", "spend", "name"]).default("recent"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const createCustomerNoteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { message: "Note content cannot be empty" })
    .max(1000, { message: "Note content must not exceed 1000 characters" }),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(100).nullable().optional(),
});

/**
 * Mask email address for privacy-conscious roles without customers.viewContact
 * Example: "john.doe@example.com" -> "j***e@example.com"
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return "***@***.***";
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0] || "*"}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Mask phone number for privacy-conscious roles without customers.viewContact
 * Example: "+1234567890" -> "+12 •••• 7890" or "••••••7890"
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return "••••";
  const visibleLast = trimmed.slice(-4);
  const prefix = trimmed.startsWith("+") ? trimmed.slice(0, 3) + " " : "";
  return `${prefix}•••• ••${visibleLast.slice(-2)}`;
}

/**
 * Sanitize text input to eliminate executable HTML/script tags
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^>]*>?/gm, "") // Strip HTML tags
    .replace(/javascript:/gi, "") // Neutralize URI scripts
    .trim();
}
