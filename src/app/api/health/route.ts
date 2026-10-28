import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Content-Type": "application/json",
};

/**
 * Liveness Probe: GET /api/health
 * Lightweight endpoint for load balancers and container orchestrators (Kubernetes, Docker)
 * to verify that the HTTP server process is running and accepting traffic.
 * Exposes zero internal secrets or environment details.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
}
