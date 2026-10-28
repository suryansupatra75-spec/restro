import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ROLE_METADATA, StaffRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, error: "Invitation token is required" }, { status: 400 });
    }

    const invitation = await prisma.staffInvitation.findUnique({
      where: { token },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ valid: false, error: "Invalid invitation link" }, { status: 404 });
    }

    if (invitation.status === "ACCEPTED") {
      return NextResponse.json({ valid: false, error: "This invitation has already been accepted" }, { status: 400 });
    }

    if (invitation.status === "CANCELLED") {
      return NextResponse.json({ valid: false, error: "This invitation has been cancelled by the restaurant" }, { status: 400 });
    }

    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ valid: false, error: "This invitation has expired" }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, name: true, email: true },
    });

    const roleMeta = ROLE_METADATA[invitation.role as StaffRole] || { title: invitation.role, description: "" };

    return NextResponse.json({
      valid: true,
      invitation: {
        email: invitation.email,
        role: invitation.role,
        roleTitle: roleMeta.title,
        roleDescription: roleMeta.description,
        restaurant: invitation.restaurant,
        userExists: !!existingUser,
        userName: existingUser?.name || null,
      },
    });
  } catch (error) {
    console.error("VERIFY_INVITATION_ERROR:", error);
    return NextResponse.json({ valid: false, error: "Internal Server Error" }, { status: 500 });
  }
}
