import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const SUPER_ADMIN_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export interface SuperAdminActor {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: Date;
}

/**
 * Default-deny server-side platform authorization guard.
 * - Verifies session token signature
 * - Queries the User record directly from the database (never trusts client claims, headers, query params, or cookies)
 * - Blocks anonymous users (401), disabled users (403), and any non-Super-Admin user (403)
 * - Restaurant roles (OWNER, MANAGER, STAFF, KITCHEN) do NOT grant platform access
 */
export async function requireSuperAdmin(): Promise<
  | { errorResponse: NextResponse; actor: null }
  | { errorResponse: null; actor: SuperAdminActor }
> {
  const session = await getSession();
  if (!session?.userId) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Authentication required", code: "UNAUTHORIZED" },
        { status: 401, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      ),
      actor: null,
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
      },
    });

    if (!user) {
      return {
        errorResponse: NextResponse.json(
          { error: "Unauthorized: User account not found", code: "UNAUTHORIZED" },
          { status: 401, headers: SUPER_ADMIN_NO_STORE_HEADERS }
        ),
        actor: null,
      };
    }

    if (!user.isActive) {
      return {
        errorResponse: NextResponse.json(
          { error: "Forbidden: Your user account has been suspended", code: "ACCOUNT_SUSPENDED" },
          { status: 403, headers: SUPER_ADMIN_NO_STORE_HEADERS }
        ),
        actor: null,
      };
    }

    if (user.isSuperAdmin !== true) {
      return {
        errorResponse: NextResponse.json(
          {
            error: "Forbidden: Platform Super Admin privileges required",
            code: "SUPER_ADMIN_REQUIRED",
          },
          { status: 403, headers: SUPER_ADMIN_NO_STORE_HEADERS }
        ),
        actor: null,
      };
    }

    return {
      errorResponse: null,
      actor: user,
    };
  } catch (error) {
    console.error("[SuperAdminGuard] Database verification error:", error);
    return {
      errorResponse: NextResponse.json(
        { error: "Service unavailable while verifying authorization" },
        { status: 503, headers: SUPER_ADMIN_NO_STORE_HEADERS }
      ),
      actor: null,
    };
  }
}
