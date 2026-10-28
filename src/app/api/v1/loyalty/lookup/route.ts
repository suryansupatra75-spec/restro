import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loyaltyLookupSchema } from "@/lib/validations/loyalty";
import { getCustomerLoyaltySummary } from "@/lib/loyalty/service";

// In-memory rate limiter per IP / token
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(key: string, limit = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.expiresAt < now) {
    rateLimitMap.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const body = await req.json();
    const parsed = loyaltyLookupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { token, phone, email } = parsed.data;

    // Rate-limit check per IP + QR token
    const rateLimitKey = `loyalty_lookup_${ip}_${token}`;
    if (!checkRateLimit(rateLimitKey, 30, 60000)) {
      return NextResponse.json(
        {
          error: "Too many loyalty lookups. Please try again in a moment.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // Resolve QR token
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      include: { table: true, restaurant: true },
    });

    if (!qr || qr.status !== "ACTIVE" || qr.table.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "Invalid or inactive dining QR code", code: "INVALID_QR_TOKEN" },
        { status: 404 }
      );
    }

    const summary = await getCustomerLoyaltySummary({
      restaurantId: qr.restaurant.id,
      phone,
      email,
    });

    return NextResponse.json({
      success: true,
      restaurant: {
        id: qr.restaurant.id,
        name: qr.restaurant.name,
        currency: qr.restaurant.currency || "USD",
      },
      ...summary,
    });
  } catch (error: unknown) {
    console.error("POST /api/v1/loyalty/lookup error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
