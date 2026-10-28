import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Content-Type": "application/json",
};

/**
 * Readiness Probe: GET /api/ready
 * Used by container orchestrators, load balancers, and deployment gates to determine
 * if the application is fully ready to receive customer traffic.
 * Validates database connectivity without leaking credentials, connection strings, or internal traces.
 */
export async function GET() {
  const start = performance.now();
  try {
    // Perform a minimal, non-locking connection verification query
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    return NextResponse.json(
      {
        status: "ready",
        database: "connected",
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (error) {
    // Log failure server-side with structured error; do not expose internal error details to caller
    console.error("Readiness check database failure:", error instanceof Error ? error.message : "DB unreachable");

    return NextResponse.json(
      {
        status: "not_ready",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: NO_CACHE_HEADERS,
      }
    );
  }
}
