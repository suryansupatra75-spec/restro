import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string; noteId: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id, noteId } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "customers.manageNotes");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    // Verify note exists and belongs to this customer & restaurant (Anti-IDOR)
    const existing = await prisma.customerNote.findFirst({
      where: {
        id: noteId,
        customerId: id,
        restaurantId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.customerNote.delete({
      where: { id: noteId },
    });

    return NextResponse.json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /api/v1/customers/[id]/notes/[noteId] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
