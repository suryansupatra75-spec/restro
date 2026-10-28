import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { receiptQuerySchema, maskEmail, maskPhone } from "@/lib/validations/receipts";
import { hasPermission } from "@/lib/permissions";
import { generateReceiptSnapshot } from "@/lib/receipts/service";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "receipts.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;
    const url = new URL(req.url);

    const parseResult = receiptQuerySchema.safeParse({
      page: url.searchParams.get("page") || 1,
      limit: url.searchParams.get("limit") || 10,
      search: url.searchParams.get("search") || undefined,
      status: url.searchParams.get("status") || "ALL",
      channel: url.searchParams.get("channel") || "ALL",
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      sortBy: url.searchParams.get("sortBy") || "recent",
      sortOrder: url.searchParams.get("sortOrder") || "desc",
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { page, limit, search, status, channel, startDate, endDate, sortBy, sortOrder } =
      parseResult.data;

    const canViewContact = hasPermission(role, "customers.viewContact");

    // Build Prisma where query with strict tenant isolation
    const where: any = {
      restaurantId,
    };

    if (status !== "ALL") {
      where.paymentStatus = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // End of the day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { receiptNumber: { contains: q } },
        { order: { orderNumber: { contains: q } } },
        { customer: { name: { contains: q } } },
        { customer: { phone: { contains: q } } },
      ];
    }

    if (channel !== "ALL") {
      where.deliveryLogs = {
        some: {
          channel,
        },
      };
    }

    // Determine orderBy
    let orderBy: any = { createdAt: sortOrder };
    if (sortBy === "total") {
      orderBy = { finalTotal: sortOrder };
    } else if (sortBy === "receiptNumber") {
      orderBy = { receiptNumber: sortOrder };
    }

    const [total, receipts] = await Promise.all([
      prisma.digitalReceipt.count({ where }),
      prisma.digitalReceipt.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              table: { select: { name: true } },
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          deliveryLogs: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              channel: true,
              recipient: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const formattedReceipts = receipts.map((r) => {
      let parsedSnapshot = null;
      try {
        parsedSnapshot = JSON.parse(r.snapshotData);
      } catch {
        parsedSnapshot = null;
      }

      return {
        id: r.id,
        receiptNumber: r.receiptNumber,
        receiptToken: r.receiptToken,
        orderId: r.orderId,
        orderNumber: r.order.orderNumber,
        tableName: r.order.table?.name || "Table",
        customerId: r.customerId,
        customerName: r.customer?.name || parsedSnapshot?.customer?.name || "Guest",
        customerContact: canViewContact
          ? r.customer?.phone || r.customer?.email || "—"
          : maskPhone(r.customer?.phone) || maskEmail(r.customer?.email) || "—",
        isContactMasked: !canViewContact,
        currency: r.currency,
        subtotal: Number(r.subtotal),
        discountAmount: Number(r.discountAmount),
        tax: Number(r.tax),
        finalTotal: Number(r.finalTotal),
        paymentMethod: r.paymentMethod,
        paymentStatus: r.paymentStatus,
        isTaxInvoice: r.isTaxInvoice,
        issueDate: r.issueDate,
        createdAt: r.createdAt,
        deliveryLogs: r.deliveryLogs,
      };
    });

    return NextResponse.json({
      success: true,
      receipts: formattedReceipts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/v1/receipts error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "receipts.manage");
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { orderId } = body || {};
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const result = await generateReceiptSnapshot({
      orderId,
      restaurantId,
      actor: user.name || "STAFF",
    });

    return NextResponse.json({
      success: true,
      receipt: result.receipt,
      isNew: result.isNew,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/receipts error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("unpaid")
      ? 400
      : message.includes("Forbidden")
      ? 403
      : message.includes("not found")
      ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

