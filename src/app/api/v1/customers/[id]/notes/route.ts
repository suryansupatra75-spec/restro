import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { createCustomerNoteSchema, sanitizeHtml } from "@/lib/validations/customer";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "customers.manageNotes");
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;

    // Verify target customer exists in this tenant (Anti-IDOR)
    const customer = await prisma.customer.findFirst({
      where: { id, restaurantId },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = createCustomerNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid note data" },
        { status: 400 }
      );
    }

    const cleanContent = sanitizeHtml(parsed.data.content);
    if (!cleanContent) {
      return NextResponse.json({ error: "Note content cannot be empty" }, { status: 400 });
    }

    const note = await prisma.customerNote.create({
      data: {
        customerId: id,
        restaurantId,
        authorId: user.id,
        authorName: user.name || "Staff",
        content: cleanContent,
      },
    });

    return NextResponse.json({
      success: true,
      note: {
        id: note.id,
        authorId: note.authorId,
        authorName: note.authorName,
        content: note.content,
        createdAt: note.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/v1/customers/[id]/notes error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
