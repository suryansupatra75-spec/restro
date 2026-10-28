import { z } from "zod";

export const SUPPORTED_CURRENCIES = [
  "USD",
  "INR",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "CAD",
  "AUD",
] as const;

export const SUPPORTED_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
  "America/Toronto",
] as const;

export const VALID_WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export type SupportedTimezone = (typeof SUPPORTED_TIMEZONES)[number];
export type Weekday = (typeof VALID_WEEKDAYS)[number];

export function parseClosedDays(raw: string | null | undefined): Weekday[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const validSet = new Set<string>(VALID_WEEKDAYS);
    return Array.from(
      new Set(
        parsed.filter(
          (item): item is Weekday =>
            typeof item === "string" && validSet.has(item)
        )
      )
    );
  } catch {
    return [];
  }
}

/**
 * Validates that an image URL is either empty/null, a local /uploads/ path,
 * or a safe http/https URL. Rejects javascript:, data:, file:, etc.
 */
const safeImageUrlSchema = z
  .string()
  .trim()
  .max(2048, "URL must be at most 2048 characters")
  .refine(
    (val) => {
      if (!val) return true;
      if (/[<>"'`\\]/.test(val)) return false;
      const lower = val.toLowerCase();
      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("file:") ||
        lower.startsWith("vbscript:")
      ) {
        return false;
      }
      if (val.startsWith("/uploads/")) {
        return !val.includes("..");
      }
      try {
        const parsed = new URL(val);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    },
    {
      message:
        "Image URL must be a valid https://, http://, or /uploads/ path",
    }
  )
  .transform((val) => (val === "" ? null : val))
  .nullable()
  .optional();

/**
 * Compute relative luminance of a #RRGGBB hex color to prevent invisible near-white accent colors.
 */
function getHexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

const accentColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Accent color must be a 6-digit hex color (e.g. #E85D2A)")
  .refine((hex) => getHexLuminance(hex) <= 0.78, {
    message:
      "Accent color is too light for readable contrast on white backgrounds",
  })
  .transform((hex) => hex.toUpperCase())
  .optional();

const time24hSchema = z
  .string()
  .trim()
  .refine(
    (val) => val === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(val),
    {
      message: "Time must be in 24-hour HH:MM format (e.g. 09:00 or 22:30)",
    }
  )
  .transform((val) => (val === "" ? null : val))
  .nullable()
  .optional();

const optionalTrimmedString = (maxLen: number, label: string) =>
  z
    .string()
    .trim()
    .max(maxLen, `${label} must be at most ${maxLen} characters`)
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .optional();

export const updateRestaurantSettingsSchema = z
  .object({
    // 1. Restaurant Profile
    name: z
      .string()
      .trim()
      .min(2, "Restaurant name must be at least 2 characters")
      .max(100, "Restaurant name must be at most 100 characters")
      .optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, "Slug must be at least 2 characters")
      .max(80, "Slug must be at most 80 characters")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug may only contain lowercase letters, numbers, and single hyphens"
      )
      .optional(),
    description: optionalTrimmedString(500, "Description"),
    phone: z
      .string()
      .trim()
      .max(25, "Phone number must be at most 25 characters")
      .refine((val) => val === "" || /^[0-9+\-\s()]{5,25}$/.test(val), {
        message: "Phone number contains invalid characters",
      })
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    email: z
      .string()
      .trim()
      .max(120, "Email must be at most 120 characters")
      .refine(
        (val) => val === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
        { message: "Invalid email address" }
      )
      .transform((val) => (val === "" ? null : val.toLowerCase()))
      .nullable()
      .optional(),
    address: optionalTrimmedString(250, "Address"),
    city: optionalTrimmedString(80, "City"),
    state: optionalTrimmedString(80, "State"),
    country: optionalTrimmedString(80, "Country"),
    pincode: z
      .string()
      .trim()
      .max(20, "Postal/PIN code must be at most 20 characters")
      .refine((val) => val === "" || /^[A-Za-z0-9\-\s]{3,20}$/.test(val), {
        message: "Invalid postal/PIN code format",
      })
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    gstNumber: z
      .string()
      .trim()
      .max(30, "GST / Tax ID must be at most 30 characters")
      .refine((val) => val === "" || /^[A-Za-z0-9\-]{5,30}$/.test(val), {
        message: "GST / Tax ID may only contain alphanumeric characters and hyphens",
      })
      .transform((val) => (val === "" ? null : val.toUpperCase()))
      .nullable()
      .optional(),

    // 2. Branding & Customer Menu
    logoUrl: safeImageUrlSchema,
    coverImageUrl: safeImageUrlSchema,
    accentColor: accentColorSchema,

    // 3. Business Hours
    openingTime: time24hSchema,
    closingTime: time24hSchema,
    closedDays: z
      .array(z.enum(VALID_WEEKDAYS))
      .max(7, "Cannot specify more than 7 closed days")
      .transform((days) => Array.from(new Set(days)))
      .optional(),

    // 4. Regional Preferences
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    confirmCurrencyChange: z.boolean().optional(),
    timezone: z
      .string()
      .trim()
      .transform((tz) => {
        const aliasMap: Record<string, string> = {
          "Asia/Calcutta": "Asia/Kolkata",
          "Etc/UTC": "UTC",
          "Etc/GMT": "UTC",
          "US/Eastern": "America/New_York",
          "US/Central": "America/Chicago",
          "US/Pacific": "America/Los_Angeles",
        };
        return aliasMap[tz] || tz;
      })
      .pipe(z.enum(SUPPORTED_TIMEZONES))
      .optional(),

    // 5. Order & Service Preferences
    isOrderingEnabled: z.boolean().optional(),
    customerNotice: optionalTrimmedString(300, "Customer notice"),
    allowSpecialInstructions: z.boolean().optional(),
    googleReviewUrl: z
      .string()
      .trim()
      .max(1000, "Google Review URL must be at most 1000 characters")
      .refine(
        (val) => {
          if (!val) return true;
          if (/[<>"'`\\]/.test(val)) return false;
          try {
            const parsed = new URL(val);
            return parsed.protocol === "https:" || parsed.protocol === "http:";
          } catch {
            return false;
          }
        },
        { message: "Google Review URL must be a valid http:// or https:// URL" }
      )
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),

    // 6. Taxes & Pricing Configuration
    taxPercentage: z
      .number()
      .finite("Tax percentage must be a valid number")
      .min(0, "Tax percentage cannot be negative")
      .max(50, "Tax percentage cannot exceed 50%")
      .transform((val) => Math.round(val * 100) / 100)
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.openingTime &&
      data.closingTime &&
      data.openingTime === data.closingTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closingTime"],
        message: "Closing time cannot be identical to opening time",
      });
    }
  });

export type UpdateRestaurantSettingsInput = z.infer<
  typeof updateRestaurantSettingsSchema
>;
