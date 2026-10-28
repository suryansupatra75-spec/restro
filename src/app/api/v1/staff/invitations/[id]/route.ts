import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember, logStaffAudit } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    try { await req.text(); } catch {}

    const { errorResponse, context } = await requireAuthMember(req, "staff.invite");
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;
    const { id } = await props.params;

    // Tenant check: find invitation in this restaurant
    const invitation = await prisma.staffInvitation.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    await prisma.staffInvitation.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // Write audit log
    await logStaffAudit({
      restaurantId,
      actorId: user.id,
      action: "INVITATION_CANCELLED",
      details: {
        invitationId: id,
        email: invitation.email,
        role: invitation.role,
      },
    });

    return NextResponse.json({ success: true, message: "Invitation cancelled" });
  } catch (error) {
    console.error("DELETE_INVITATION_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
