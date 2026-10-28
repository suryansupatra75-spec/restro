import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { canRoleViewNotification } from "@/lib/notifications/service";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function handleMarkRead(req: NextRequest, { params }: RouteParams) {
  try {
    try {
      await req.text();
    } catch {
      // Safe stream drain
    }

    const { errorResponse, context } = await requireAuthMember(req);
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role } = context;
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Invalid notification ID" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Look up notification and enforce strict tenant + recipient ownership (IDOR defense)
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (
      notification.restaurantId !== restaurantId ||
      notification.userId !== user.id
    ) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this notification" },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (!canRoleViewNotification(role, notification.eventType)) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions for this notification" },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const updated = notification.isRead
      ? notification
      : await prisma.notification.update({
          where: { id: notification.id },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        });

    const permittedEventTypes = [
      "ORDER_CREATED",
      "ORDER_STATUS_CHANGED",
      "PAYMENT_STATUS_CHANGED",
      "INVENTORY_LOW",
      "STAFF_ACCESS_CHANGED",
    ].filter((et) => canRoleViewNotification(role, et));

    const unreadCount = await prisma.notification.count({
      where: {
        restaurantId,
        userId: user.id,
        isRead: false,
        eventType: { in: permittedEventTypes },
      },
    });

    return NextResponse.json(
      {
        success: true,
        notification: {
          id: updated.id,
          isRead: updated.isRead,
          readAt: updated.readAt ? updated.readAt.toISOString() : null,
        },
        unreadCount,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("PATCH /api/v1/notifications/[id]/read error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteParams) {
  return handleMarkRead(req, context);
}

export async function POST(req: NextRequest, context: RouteParams) {
  return handleMarkRead(req, context);
}
