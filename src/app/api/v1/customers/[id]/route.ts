import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { maskEmail, maskPhone, updateCustomerSchema } from "@/lib/validations/customer";
import { hasPermission } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "customers.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    // Strict Tenant Scoping & IDOR Defense
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        orders: {
          include: {
            table: {
              select: { name: true, number: true },
            },
            items: {
              include: {
                selectedVariant: true,
                selectedAddons: true,
              },
            },
            payments: {
              select: {
                id: true,
                provider: true,
                amount: true,
                status: true,
                paymentMethod: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        notes: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const canViewContact = hasPermission(role, "customers.viewContact");
    const canManageNotes = hasPermission(role, "customers.manageNotes");

    // Compute Authoritative Metrics
    const validOrders = customer.orders.filter((o) => o.status !== "CANCELLED");
    const paidOrders = customer.orders.filter((o) => o.paymentStatus === "PAID");
    const lifetimeSpend = paidOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const avgOrderValue = paidOrders.length > 0 ? lifetimeSpend / paidOrders.length : 0;
    const firstOrderAt = customer.orders.length > 0 ? customer.orders[customer.orders.length - 1].createdAt : null;
    const lastOrderAt = customer.orders.length > 0 ? customer.orders[0].createdAt : null;

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        restaurantId: customer.restaurantId,
        name: customer.name,
        phone: canViewContact ? customer.phone : maskPhone(customer.phone),
        email: canViewContact ? customer.email : maskEmail(customer.email),
        isContactMasked: !canViewContact,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      metrics: {
        totalOrders: validOrders.length,
        completedOrders: customer.orders.filter((o) => o.status === "COMPLETED").length,
        paidOrdersCount: paidOrders.length,
        lifetimeSpend,
        avgOrderValue,
        firstOrderAt,
        lastOrderAt,
      },
      orders: customer.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        table: o.table?.name || "Table",
        status: o.status,
        paymentStatus: o.paymentStatus,
        subtotal: Number(o.subtotal),
        tax: Number(o.tax),
        total: Number(o.total),
        specialInstructions: o.specialInstructions,
        itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
        itemsSummary: o.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        items: o.items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: Number(i.price),
          variant: i.selectedVariant?.name || null,
          addons: i.selectedAddons.map((a) => a.name),
        })),
        payments: o.payments.map((p) => ({
          id: p.id,
          provider: p.provider,
          amount: Number(p.amount),
          status: p.status,
          method: p.paymentMethod,
          createdAt: p.createdAt,
        })),
        createdAt: o.createdAt,
      })),
      notes: customer.notes.map((n) => ({
        id: n.id,
        authorId: n.authorId,
        authorName: n.authorName,
        content: n.content,
        createdAt: n.createdAt,
      })),
      permissions: {
        canViewContact,
        canManageNotes,
      },
    });
  } catch (error) {
    console.error("GET /api/v1/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "customers.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    // Only OWNER and MANAGER can update customer profiles
    if (role !== "OWNER" && role !== "MANAGER") {
      return NextResponse.json(
        { error: "Forbidden: Only owners and managers can update customer profiles" },
        { status: 403 }
      );
    }

    let body: any = {};
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update data" },
        { status: 400 }
      );
    }

    const existing = await prisma.customer.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      customer: updated,
    });
  } catch (error) {
    console.error("PATCH /api/v1/customers/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
