import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { customerQuerySchema, maskEmail, maskPhone } from "@/lib/validations/customer";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "customers.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    const url = new URL(req.url);
    const queryResult = customerQuerySchema.safeParse({
      page: url.searchParams.get("page") || 1,
      limit: url.searchParams.get("limit") || 10,
      search: url.searchParams.get("search") || undefined,
      sortBy: url.searchParams.get("sortBy") || "recent",
      sortOrder: url.searchParams.get("sortOrder") || "desc",
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: queryResult.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { page, limit, search, sortBy, sortOrder } = queryResult.data;
    const canViewContact = hasPermission(role, "customers.viewContact");
    const canManageNotes = hasPermission(role, "customers.manageNotes");

    // Build filter conditions
    const whereClause: any = {
      restaurantId,
    };

    if (search && search.trim().length > 0) {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ];
    }

    // Fetch all matching customers for this tenant with their orders
    const allMatching = await prisma.customer.findMany({
      where: whereClause,
      include: {
        orders: {
          select: {
            id: true,
            total: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { notes: true },
        },
      },
    });

    // Compute authoritative metrics for each customer
    const computed = allMatching.map((c) => {
      const validOrders = c.orders.filter((o) => o.status !== "CANCELLED");
      const paidOrders = c.orders.filter((o) => o.paymentStatus === "PAID");
      const lifetimeSpend = paidOrders.reduce((acc, o) => acc + Number(o.total), 0);
      const lastOrderAt = c.orders.length > 0 ? c.orders[0].createdAt : null;
      const firstOrderAt = c.orders.length > 0 ? c.orders[c.orders.length - 1].createdAt : null;

      return {
        id: c.id,
        restaurantId: c.restaurantId,
        name: c.name,
        phone: canViewContact ? c.phone : maskPhone(c.phone),
        email: canViewContact ? c.email : maskEmail(c.email),
        isContactMasked: !canViewContact,
        orderCount: validOrders.length,
        paidOrderCount: paidOrders.length,
        lifetimeSpend,
        firstOrderAt,
        lastOrderAt,
        notesCount: c._count.notes,
        createdAt: c.createdAt,
      };
    });

    // In-memory sorting based on derived metrics or fields
    computed.sort((a, b) => {
      let comp = 0;
      if (sortBy === "spend") {
        comp = a.lifetimeSpend - b.lifetimeSpend;
      } else if (sortBy === "orders") {
        comp = a.orderCount - b.orderCount;
      } else if (sortBy === "name") {
        comp = a.name.localeCompare(b.name);
      } else {
        // "recent"
        const timeA = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : new Date(b.createdAt).getTime();
        comp = timeA - timeB;
      }
      return sortOrder === "desc" ? -comp : comp;
    });

    // Paginate
    const total = computed.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = computed.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      customers: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      permissions: {
        canViewContact,
        canManageNotes,
      },
    });
  } catch (error) {
    console.error("GET /api/v1/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
