import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  VALID_WEEKDAYS,
  updateRestaurantSettingsSchema,
  type Weekday,
} from "@/lib/validations/settings";
import { recordAuditLog } from "@/lib/audit/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

function parseClosedDays(raw: string | null | undefined): Weekday[] {
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

function serializeSettings(restaurant: {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  currency: string;
  timezone: string;
  gstNumber: string | null;
  taxPercentage: number | null;
  openingTime: string | null;
  closingTime: string | null;
  closedDays: string | null;
  accentColor: string | null;
  isOrderingEnabled: boolean;
  customerNotice: string | null;
  allowSpecialInstructions: boolean;
  googleReviewUrl?: string | null;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    logoUrl: restaurant.logoUrl ?? null,
    coverImageUrl: restaurant.coverImageUrl ?? null,
    description: restaurant.description ?? null,
    phone: restaurant.phone ?? null,
    email: restaurant.email ?? null,
    address: restaurant.address ?? null,
    city: restaurant.city ?? null,
    state: restaurant.state ?? null,
    country: restaurant.country ?? null,
    pincode: restaurant.pincode ?? null,
    currency: restaurant.currency || "USD",
    timezone: restaurant.timezone || "UTC",
    gstNumber: restaurant.gstNumber ?? null,
    taxPercentage: Number(restaurant.taxPercentage ?? 0),
    openingTime: restaurant.openingTime ?? null,
    closingTime: restaurant.closingTime ?? null,
    closedDays: parseClosedDays(restaurant.closedDays),
    accentColor: restaurant.accentColor || "#E85D2A",
    isOrderingEnabled: Boolean(restaurant.isOrderingEnabled ?? true),
    customerNotice: restaurant.customerNotice ?? null,
    allowSpecialInstructions: Boolean(
      restaurant.allowSpecialInstructions ?? true
    ),
    googleReviewUrl: restaurant.googleReviewUrl ?? null,
    status: restaurant.status,
    updatedAt: restaurant.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(
      req,
      "settings.view"
    );
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    const [restaurant, ordersCount, paymentsCount] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
      }),
      prisma.order.count({ where: { restaurantId } }),
      prisma.payment.count({ where: { restaurantId } }),
    ]);

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const hasFinancialHistory = ordersCount > 0 || paymentsCount > 0;

    return NextResponse.json(
      {
        settings: serializeSettings(restaurant),
        permissions: {
          canViewSettings: true,
          canManageSettings: hasPermission(role, "settings.manage"),
          role,
        },
        meta: {
          hasFinancialHistory,
          ordersCount,
          paymentsCount,
          supportedCurrencies: SUPPORTED_CURRENCIES,
          supportedTimezones: SUPPORTED_TIMEZONES,
          validWeekdays: VALID_WEEKDAYS,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET_SETTINGS_ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch restaurant settings" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Drain request body first to prevent Windows socket reset on early 401/403
    const rawText = await req.text();

    const { errorResponse, context } = await requireAuthMember(
      req,
      "settings.manage"
    );
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role } = context;

    let rawBody: unknown;
    try {
      rawBody = rawText ? JSON.parse(rawText) : {};
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (
      !rawBody ||
      typeof rawBody !== "object" ||
      Array.isArray(rawBody) ||
      Object.keys(rawBody as Record<string, unknown>).length === 0
    ) {
      return NextResponse.json(
        { error: "Settings update payload must be a non-empty JSON object" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = updateRestaurantSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten(),
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const input = parsed.data;

    const [existing, ordersCount, paymentsCount] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
      }),
      prisma.order.count({ where: { restaurantId } }),
      prisma.payment.count({ where: { restaurantId } }),
    ]);

    if (!existing) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const hasFinancialHistory = ordersCount > 0 || paymentsCount > 0;

    // Validate merged openingTime / closingTime consistency
    const nextOpeningTime =
      input.openingTime !== undefined ? input.openingTime : existing.openingTime;
    const nextClosingTime =
      input.closingTime !== undefined ? input.closingTime : existing.closingTime;

    if (
      nextOpeningTime &&
      nextClosingTime &&
      nextOpeningTime === nextClosingTime
    ) {
      return NextResponse.json(
        {
          error: "Closing time cannot be identical to opening time",
          code: "INVALID_BUSINESS_HOURS",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Check slug uniqueness if changing slug
    if (input.slug !== undefined && input.slug !== existing.slug) {
      const slugConflict = await prisma.restaurant.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (slugConflict && slugConflict.id !== restaurantId) {
        return NextResponse.json(
          {
            error:
              "This restaurant URL slug is already taken by another restaurant.",
            code: "SLUG_TAKEN",
          },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
    }

    // Enforce currency lock once any financial history (orders or payments) exists unless explicitly confirmed
    if (input.currency !== undefined && input.currency !== existing.currency) {
      if (hasFinancialHistory && !input.confirmCurrencyChange) {
        return NextResponse.json(
          {
            error:
              "Currency cannot be changed once orders or payments have been recorded for this restaurant to preserve financial and analytics integrity.",
            code: "CURRENCY_LOCKED",
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    const changedFields: string[] = [];

    const directFields = [
      "name",
      "slug",
      "description",
      "phone",
      "email",
      "address",
      "city",
      "state",
      "country",
      "pincode",
      "gstNumber",
      "logoUrl",
      "coverImageUrl",
      "accentColor",
      "openingTime",
      "closingTime",
      "currency",
      "timezone",
      "isOrderingEnabled",
      "customerNotice",
      "allowSpecialInstructions",
      "googleReviewUrl",
      "taxPercentage",
    ] as const;

    for (const key of directFields) {
      if (input[key] !== undefined) {
        updateData[key] = input[key];
        if (input[key] !== existing[key]) {
          changedFields.push(key);
        }
      }
    }

    if (input.closedDays !== undefined) {
      const serializedDays = JSON.stringify(input.closedDays);
      updateData.closedDays = serializedDays;
      if (serializedDays !== (existing.closedDays || "[]")) {
        changedFields.push("closedDays");
      }
    }

    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: updateData,
    });

    if (changedFields.length > 0) {
      await prisma.staffAuditLog.create({
        data: {
          restaurantId,
          actorId: user.id,
          action: "SETTINGS_UPDATED",
          details: JSON.stringify({
            changedFields,
            taxPercentage:
              input.taxPercentage !== undefined
                ? {
                    from: existing.taxPercentage ?? 0,
                    to: input.taxPercentage,
                  }
                : undefined,
            isOrderingEnabled:
              input.isOrderingEnabled !== undefined
                ? {
                    from: existing.isOrderingEnabled,
                    to: input.isOrderingEnabled,
                  }
                : undefined,
          }),
        },
      });

      await recordAuditLog({
        restaurantId,
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        actorRole: role,
        action: "RESTAURANT_SETTINGS_UPDATED",
        resourceType: "RESTAURANT",
        resourceId: restaurantId,
        resourceName: updatedRestaurant.name,
        outcome: "SUCCESS",
        metadata: {
          changedFields,
          taxPercentage:
            input.taxPercentage !== undefined
              ? { from: existing.taxPercentage ?? 0, to: input.taxPercentage }
              : undefined,
          isOrderingEnabled:
            input.isOrderingEnabled !== undefined
              ? { from: existing.isOrderingEnabled, to: input.isOrderingEnabled }
              : undefined,
          currency:
            input.currency !== undefined
              ? { from: existing.currency, to: input.currency }
              : undefined,
          timezone:
            input.timezone !== undefined
              ? { from: existing.timezone, to: input.timezone }
              : undefined,
        },
        req,
      });
    }

    try {
      revalidatePath("/dashboard", "layout");
      revalidatePath("/q/[token]", "page");
    } catch {
      // Ignore revalidation errors outside Next.js request lifecycle
    }

    return NextResponse.json(
      {
        message: "Restaurant settings updated successfully",
        settings: serializeSettings(updatedRestaurant),
        permissions: {
          canViewSettings: true,
          canManageSettings: hasPermission(role, "settings.manage"),
          role,
        },
        meta: {
          hasFinancialHistory,
          ordersCount,
          paymentsCount,
          supportedCurrencies: SUPPORTED_CURRENCIES,
          supportedTimezones: SUPPORTED_TIMEZONES,
          validWeekdays: VALID_WEEKDAYS,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("PATCH_SETTINGS_ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update restaurant settings" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
