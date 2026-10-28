import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET() {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round((performance.now() - start) * 100) / 100;

    const user = await getCurrentUser().catch(() => null);
    const isSuperAdmin = Boolean(user?.isSuperAdmin);

    return NextResponse.json(
      {
        status: "healthy",
        database: {
          connected: true,
          latencyMs: dbLatencyMs,
          ...(isSuperAdmin ? { journalMode: "wal" } : {}),
        },
        ...(isSuperAdmin
          ? {
              version: "1.0.0",
              uptimeSeconds: Math.round(process.uptime()),
            }
          : {}),
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/v1/health error:", error);
    return NextResponse.json(
      {
        status: "degraded",
        database: { connected: false },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
