import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/super-admin-guard";
import { auditLogQuerySchema } from "@/lib/validations/super-admin";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.errorResponse) return auth.errorResponse;

    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = auditLogQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsed.error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { search, targetType, action, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where: Prisma.PlatformAuditLogWhereInput = {};

    if (targetType !== "ALL") {
      where.targetType = targetType;
    }

    if (action.length > 0 && action !== "ALL") {
      where.action = action;
    }

    if (search.length > 0) {
      where.OR = [
        { actorEmail: { contains: search } },
        { targetLabel: { contains: search } },
        { targetId: { contains: search } },
        { reason: { contains: search } },
        { action: { contains: search } },
      ];
    }

    const [totalMatching, logsRaw, totalAll] = await Promise.all([
      prisma.platformAuditLog.count({ where }),
      prisma.platformAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.platformAuditLog.count(),
    ]);

    const logs = logsRaw.map((log) => ({
      id: log.id,
      actorId: log.actorId,
      actorEmail: log.actorEmail,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      targetLabel: log.targetLabel,
      reason: log.reason,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json(
      {
        logs,
        pagination: {
          page,
          limit,
          total: totalMatching,
          totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
        },
        summary: {
          total: totalAll,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/super-admin/audit-logs error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
