import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "staff.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role } = context;

    // Fetch active & disabled staff members for this restaurant
    const members = await prisma.restaurantUser.findMany({
      where: { restaurantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { role: "asc" }, // OWNER first alphabetically in simple sort, or we sort cleanly below
        { createdAt: "asc" },
      ],
    });

    // Sort order: OWNER -> MANAGER -> STAFF -> KITCHEN
    const ROLE_PRIORITY: Record<string, number> = {
      OWNER: 1,
      MANAGER: 2,
      STAFF: 3,
      KITCHEN: 4,
    };
    members.sort((a, b) => (ROLE_PRIORITY[a.role] || 99) - (ROLE_PRIORITY[b.role] || 99));

    // Fetch pending, unexpired invitations for this restaurant
    const invitations = await prisma.staffInvitation.findMany({
      where: {
        restaurantId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch recent staff audit logs (last 25)
    const auditLogs = await prisma.staffAuditLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return NextResponse.json({
      members,
      invitations,
      auditLogs,
      currentRole: role,
      currentUserId: user.id,
    });
  } catch (error) {
    console.error("GET_STAFF_ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
