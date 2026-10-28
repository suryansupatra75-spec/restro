import { NextRequest, NextResponse } from "next/server";
import { clearSession, getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit/service";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (user) {
      const primaryMembership = user.restaurants?.[0];
      await recordAuditLog({
        restaurantId: primaryMembership?.restaurantId || null,
        actorId: user.id,
        actorEmail: user.email,
        actorName: user.name,
        actorRole: user.isSuperAdmin ? "SUPER_ADMIN" : primaryMembership?.role || "USER",
        action: "AUTH_LOGOUT",
        resourceType: "AUTH",
        resourceId: user.id,
        resourceName: user.email,
        outcome: "SUCCESS",
        req,
      });
    }

    await clearSession();
    return NextResponse.json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout error:", error);
    await clearSession();
    return NextResponse.json({ message: "Logged out successfully." });
  }
}
