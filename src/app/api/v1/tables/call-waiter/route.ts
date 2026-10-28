import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dispatchNotificationEvent } from "@/lib/notifications/service";
import { requireAuthMember } from "@/lib/auth-guard";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

const callWaiterSchema = z.object({
  token: z.string().min(1, "QR token is required"),
  type: z.enum(["WAITER", "WATER", "CUTLERY", "BILL"], {
    message: "Invalid service request type",
  }),
  note: z.string().trim().max(200, "Note must be at most 200 characters").optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId } = auth.context;

    // Fetch unresolved service requests for this restaurant from the past 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const notifications = await prisma.notification.findMany({
      where: {
        restaurantId,
        actionUrl: "/dashboard/tables",
        isRead: false,
        createdAt: { gte: twoHoursAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const requests = notifications.map((n) => {
      let meta: {
        tableId?: string;
        tableName?: string;
        requestType?: string;
        note?: string | null;
        requestedAt?: string;
      } = {};
      try {
        if (n.metadata) meta = JSON.parse(n.metadata);
      } catch {
        // ignore
      }

      return {
        id: n.id,
        title: n.title,
        message: n.message,
        tableId: meta.tableId || null,
        tableName: meta.tableName || "Unknown",
        requestType: meta.requestType || "WAITER",
        note: meta.note || null,
        priority: n.priority,
        createdAt: n.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, requests }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET_SERVICE_REQUESTS_ERROR:", error);
    return NextResponse.json({ error: "Failed to load service requests" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { restaurantId } = auth.context;

    const body = await req.json();
    const { requestId, resolveAll } = body as { requestId?: string; resolveAll?: boolean };

    if (resolveAll) {
      await prisma.notification.updateMany({
        where: {
          restaurantId,
          actionUrl: "/dashboard/tables",
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, message: "All requests marked resolved" });
    }

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const updated = await prisma.notification.updateMany({
      where: {
        id: requestId,
        restaurantId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, updatedCount: updated.count });
  } catch (error) {
    console.error("RESOLVE_SERVICE_REQUEST_ERROR:", error);
    return NextResponse.json({ error: "Failed to resolve request" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = callWaiterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten(),
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { token, type, note } = parsed.data;

    // Resolve QR Code, Table, and Restaurant
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      include: {
        table: true,
        restaurant: true,
      },
    });

    if (
      !qr ||
      qr.status !== "ACTIVE" ||
      qr.table.status === "ARCHIVED" ||
      qr.restaurant.status === "INACTIVE"
    ) {
      return NextResponse.json(
        { error: "Invalid or inactive table QR code" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Prepare human-readable service title & details
    const serviceTitles: Record<string, string> = {
      WAITER: "Staff Attention Needed",
      WATER: "Water Refill Requested",
      CUTLERY: "Cutlery / Extra Plates Requested",
      BILL: "Check / Paper Bill Requested",
    };

    const serviceIcons: Record<string, string> = {
      WAITER: "🛎️",
      WATER: "💧",
      CUTLERY: "🍴",
      BILL: "🧾",
    };

    const icon = serviceIcons[type] || "🛎️";
    const label = serviceTitles[type] || "Service Request";

    const title = `${icon} Table ${qr.table.name}: ${label}`;
    const message = note
      ? `Guest at Table ${qr.table.name} requested: ${label}. Note: "${note}"`
      : `Guest at Table ${qr.table.name} requested: ${label}.`;

    // 30-second deduplication key per table and type to prevent guest accidental double-clicking
    const debounceWindow = Math.floor(Date.now() / 30000);
    const dedupeKey = `call_waiter_${qr.table.id}_${type}_${debounceWindow}`;

    // Dispatch notification to staff members asynchronously without blocking guest response
    setImmediate(() => {
      dispatchNotificationEvent({
        restaurantId: qr.restaurantId,
        eventType: "ORDER_STATUS_CHANGED",
        priority: "HIGH",
        title,
        message,
        actionUrl: `/dashboard/tables`,
        entityType: "ORDER",
        dedupeKey,
        metadata: {
          tableId: qr.table.id,
          tableName: qr.table.name,
          requestType: type,
          note: note || null,
          requestedAt: new Date().toISOString(),
        },
      }).catch((err) => console.error("[ASYNC_CALL_WAITER_NOTIF_ERROR]", err));
    });

    return NextResponse.json(
      {
        success: true,
        message: `Staff alerted for Table ${qr.table.name}! Someone will assist you shortly.`,
        requestType: type,
        tableName: qr.table.name,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("CALL_WAITER_API_ERROR:", error);
    return NextResponse.json(
      { error: "Failed to submit service request. Please ask a server directly." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
