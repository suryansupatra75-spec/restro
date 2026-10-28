import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateCouponRequestSchema } from "@/lib/validations/promotion";
import {
  checkCouponValidationRateLimit,
  evaluateCartAndPromotion,
  PromotionRuleError,
} from "@/lib/promotions/service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = validateCouponRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          valid: false,
          error: parsed.error.issues[0]?.message || "Invalid coupon request.",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const { token, code, customerPhone, customerEmail, items } = parsed.data;

    // Scoped brute-force protection per client IP + table token
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "local";
    const rateLimit = checkCouponValidationRateLimit(`${clientIp}:${token}`);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          valid: false,
          error: "Too many coupon attempts. Please wait a moment and try again.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    // Resolve tenant strictly from active QR token (never trust client restaurantId)
    const qrCode = await prisma.qRCode.findUnique({
      where: { token },
      include: {
        table: true,
        restaurant: {
          select: {
            id: true,
            status: true,
            isOrderingEnabled: true,
          },
        },
      },
    });

    if (
      !qrCode ||
      qrCode.status !== "ACTIVE" ||
      qrCode.table.status !== "ACTIVE" ||
      qrCode.restaurant.status !== "ACTIVE"
    ) {
      return NextResponse.json(
        {
          valid: false,
          error: "Invalid or inactive table QR session.",
          code: "INVALID_QR_TOKEN",
        },
        { status: 400 }
      );
    }

    const evaluation = await evaluateCartAndPromotion({
      restaurantId: qrCode.restaurantId,
      items,
      couponCode: code,
      customerPhone,
      customerEmail,
    });

    if (!evaluation.promotion) {
      return NextResponse.json(
        {
          valid: false,
          error: "No coupon code was provided.",
          code: "COUPON_REQUIRED",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      promotion: {
        code: evaluation.promotion.code,
        name: evaluation.promotion.name,
        description: evaluation.promotion.description,
        discountType: evaluation.promotion.discountType,
        discountValue: evaluation.promotion.discountValue,
        minOrderSubtotal: evaluation.promotion.minOrderSubtotal,
        maxDiscountAmount: evaluation.promotion.maxDiscountAmount,
        appliesTo: evaluation.promotion.appliesTo,
      },
      pricing: {
        currency: evaluation.currency,
        subtotal: evaluation.subtotal,
        eligibleSubtotal: evaluation.eligibleSubtotal,
        discountAmount: evaluation.discountAmount,
        discountedSubtotal: evaluation.discountedSubtotal,
        tax: evaluation.tax,
        appliedTaxPercentage: evaluation.appliedTaxPercentage,
        total: evaluation.total,
      },
    });
  } catch (error) {
    if (error instanceof PromotionRuleError) {
      return NextResponse.json(
        {
          valid: false,
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status }
      );
    }

    console.error("POST /api/v1/promotions/validate error:", error);
    return NextResponse.json(
      {
        valid: false,
        error: "Unable to validate coupon right now.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
