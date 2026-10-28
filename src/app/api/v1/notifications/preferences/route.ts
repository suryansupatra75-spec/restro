import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { updateNotificationPreferencesSchema } from "@/lib/validations/notification";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req);
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;
    const prefs = await getOrCreateNotificationPreferences(
      restaurantId,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        preferences: {
          orderCreated: prefs.orderCreated,
          orderStatusChanged: prefs.orderStatusChanged,
          paymentStatusChanged: prefs.paymentStatusChanged,
          inventoryLow: prefs.inventoryLow,
          staffAccessChanged: prefs.staffAccessChanged,
          inAppEnabled: prefs.inAppEnabled,
          soundEnabled: prefs.soundEnabled,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/notifications/preferences error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function handleUpdatePreferences(req: NextRequest) {
  try {
    let rawBody = "";
    try {
      rawBody = await req.text();
    } catch {
      // Safe stream drain
    }

    const { errorResponse, context } = await requireAuthMember(req);
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;

    let body: unknown = {};
    if (rawBody && rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON payload" },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const parsed = updateNotificationPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Invalid notification preferences payload",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (
      parsed.data.restaurantId &&
      parsed.data.restaurantId !== restaurantId
    ) {
      return NextResponse.json(
        { error: "Forbidden: Cannot update preferences for another restaurant" },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const updated = await updateNotificationPreferences(
      restaurantId,
      user.id,
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        preferences: {
          orderCreated: updated.orderCreated,
          orderStatusChanged: updated.orderStatusChanged,
          paymentStatusChanged: updated.paymentStatusChanged,
          inventoryLow: updated.inventoryLow,
          staffAccessChanged: updated.staffAccessChanged,
          inAppEnabled: updated.inAppEnabled,
          soundEnabled: updated.soundEnabled,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("PUT /api/v1/notifications/preferences error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(req: NextRequest) {
  return handleUpdatePreferences(req);
}

export async function PATCH(req: NextRequest) {
  return handleUpdatePreferences(req);
}
