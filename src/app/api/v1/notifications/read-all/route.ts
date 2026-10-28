import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

async function handleMarkAllRead(req: NextRequest) {
  try {
    try {
      await req.text();
    } catch {
      // Safe stream drain
    }

    const { errorResponse, context } = await requireAuthMember(req);
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;

    const result = await prisma.notification.updateMany({
      where: {
        restaurantId,
        userId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        updatedCount: result.count,
        unreadCount: 0,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("POST /api/v1/notifications/read-all error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleMarkAllRead(req);
}

export async function PATCH(req: NextRequest) {
  return handleMarkAllRead(req);
}
