import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { notificationQuerySchema } from "@/lib/validations/notification";
import { listUserNotifications } from "@/lib/notifications/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req);
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role } = context;
    const url = new URL(req.url);

    const rawQuery: Record<string, string | undefined> = {
      restaurantId: url.searchParams.get("restaurantId") || undefined,
      unreadOnly: url.searchParams.get("unreadOnly") || undefined,
      category: url.searchParams.get("category") || undefined,
      eventType: url.searchParams.get("eventType") || undefined,
      since: url.searchParams.get("since") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    const parsed = notificationQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Invalid notification query parameters",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await listUserNotifications({
      restaurantId,
      userId: user.id,
      role,
      unreadOnly: parsed.data.unreadOnly,
      category: parsed.data.category,
      eventType: parsed.data.eventType,
      since: parsed.data.since,
      limit: parsed.data.limit,
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/notifications error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
