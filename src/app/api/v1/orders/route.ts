import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { notifyOrderCreated } from "@/lib/notifications/service";
import { createOrderPayment } from "@/lib/payments/service";
import {
  evaluateCartAndPromotion,
  PromotionRuleError,
  reservePromotionInTransaction,
  recordPromotionRedemptionInTransaction,
  redeemPromotionInTransaction,
} from "@/lib/promotions/service";
import {
  evaluateLoyaltyRedemption,
  reserveLoyaltyPointsInTransaction,
  LoyaltyRuleError,
} from "@/lib/loyalty/service";
import { dispatchTenantWebhookEvent } from "@/lib/integrations/webhooks";
import { withWriteLock } from "@/lib/db-write-queue";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      token,
      items,
      specialInstructions,
      customerName,
      customerPhone,
      customerEmail,
      paymentMethod,
      couponCode,
      loyaltyPointsToRedeem,
      loyaltyRewardId,
      idempotencyKey,
    } = body;

    if (!token || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    // 0. Idempotency Check: if idempotencyKey is provided, return existing order
    const cleanIdempotencyKey =
      typeof idempotencyKey === "string" && idempotencyKey.trim().length > 0
        ? idempotencyKey.trim().slice(0, 100)
        : null;

    if (cleanIdempotencyKey) {
      const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey: cleanIdempotencyKey },
        include: {
          items: {
            include: {
              selectedVariant: true,
              selectedAddons: true,
            },
          },
          payments: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (existingOrder) {
        return NextResponse.json(
          {
            success: true,
            idempotent: true,
            order: {
              id: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              status: existingOrder.status,
              paymentStatus: existingOrder.paymentStatus,
              subtotal: Number(existingOrder.subtotal),
              couponCode: existingOrder.couponCode,
              promotionName: existingOrder.promotionNameSnapshot,
              discountAmount: Number(existingOrder.discountAmount),
              loyaltyPointsRedeemed: existingOrder.loyaltyPointsRedeemed,
              loyaltyDiscountAmount: Number(existingOrder.loyaltyDiscountAmount || 0),
              tax: Number(existingOrder.tax),
              appliedTaxPercentage: Number(existingOrder.appliedTaxPercentage ?? 0),
              total: Number(existingOrder.total),
              specialInstructions: existingOrder.specialInstructions,
              createdAt: existingOrder.createdAt.toISOString(),
              items: existingOrder.items.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                variant: i.selectedVariant ? { name: i.selectedVariant.name } : null,
                addons: i.selectedAddons.map((a) => ({ name: a.name })),
              })),
            },
          },
          { status: 200 }
        );
      }
    }

    // 1. Resolve QR token to table and restaurant
    const qr = await prisma.qRCode.findUnique({
      where: { token },
      include: {
        table: true,
        restaurant: true,
      },
    });

    if (!qr || qr.status !== "ACTIVE" || qr.table.status === "ARCHIVED") {
      return NextResponse.json({ error: "Invalid or inactive QR code" }, { status: 404 });
    }

    const { restaurant, table } = qr;

    if (restaurant.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: "This restaurant is currently unavailable to accept orders.",
          code: "RESTAURANT_SUSPENDED",
        },
        { status: 403 }
      );
    }

    if (restaurant.isOrderingEnabled === false) {
      return NextResponse.json(
        {
          error:
            restaurant.customerNotice ||
            "Online ordering is currently paused by the restaurant.",
          code: "ORDERING_PAUSED",
        },
        { status: 403 }
      );
    }

    const allowInstructions = restaurant.allowSpecialInstructions !== false;

    const cleanPhone =
      customerPhone && typeof customerPhone === "string" ? customerPhone.trim() : null;
    const cleanEmail =
      customerEmail && typeof customerEmail === "string"
        ? customerEmail.trim().toLowerCase()
        : null;
    const cleanName =
      customerName && typeof customerName === "string" && customerName.trim().length > 0
        ? customerName.trim()
        : null;

    // 2. Resolve existing customer record (read-only query outside transaction)
    let existingCustomerId: string | null = null;
    let existingCustomerName: string | null = null;
    if (cleanPhone || cleanEmail) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orConditions: any[] = [];
      if (cleanPhone) orConditions.push({ phone: cleanPhone });
      if (cleanEmail) orConditions.push({ email: cleanEmail });

      const existingCustomer = await prisma.customer.findFirst({
        where: {
          restaurantId: restaurant.id,
          OR: orConditions,
        },
        select: { id: true, name: true },
      });

      if (existingCustomer) {
        existingCustomerId = existingCustomer.id;
        existingCustomerName = existingCustomer.name;
      }
    }

    // 3. Authoritative server-side cart & coupon evaluation
    const evaluation = await evaluateCartAndPromotion({
      restaurantId: restaurant.id,
      items: items.map((i: {
        menuItemId: string;
        quantity: number;
        variantId?: string | null;
        addonIds?: string[];
        specialInstructions?: string | null;
      }) => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        variantId: i.variantId || null,
        addonIds: Array.isArray(i.addonIds) ? i.addonIds : [],
        specialInstructions: allowInstructions ? i.specialInstructions : null,
      })),
      couponCode: couponCode || null,
      customerPhone: cleanPhone,
      customerEmail: cleanEmail,
      existingCustomerId,
    });

    // 3b. Authoritative Loyalty Redemption Evaluation (stacked with coupon)
    let loyaltyPointsRedeemed: number | null = null;
    let loyaltyDiscountAmount = 0;
    let appliedLoyaltyRewardId: string | null = null;
    let appliedLoyaltyRewardName: string | null = null;

    if (existingCustomerId && (loyaltyPointsToRedeem || loyaltyRewardId)) {
      const loyaltyEval = await evaluateLoyaltyRedemption({
        restaurantId: restaurant.id,
        customerId: existingCustomerId,
        cartSubtotal: evaluation.subtotal,
        couponDiscountAmount: evaluation.discountAmount,
        pointsToRedeem:
          typeof loyaltyPointsToRedeem === "number"
            ? Math.max(0, Math.floor(loyaltyPointsToRedeem))
            : 0,
        rewardId: typeof loyaltyRewardId === "string" ? loyaltyRewardId : undefined,
      });

      if (loyaltyEval.loyaltyApplied) {
        loyaltyPointsRedeemed = loyaltyEval.loyaltyPointsRedeemed;
        loyaltyDiscountAmount = loyaltyEval.loyaltyDiscountAmount;
        appliedLoyaltyRewardId = loyaltyEval.rewardId;
        appliedLoyaltyRewardName = loyaltyEval.rewardName;
      }
    }

    // Final server-authoritative financial math: Subtotal - CouponDiscount - LoyaltyDiscount
    const netDiscountedSubtotal = Math.max(
      0,
      Math.round((evaluation.subtotal - evaluation.discountAmount - loyaltyDiscountAmount) * 100) / 100
    );
    const finalTax = Math.round(((netDiscountedSubtotal * evaluation.appliedTaxPercentage) / 100) * 100) / 100;
    const finalTotal = Math.round((netDiscountedSubtotal + finalTax) * 100) / 100;

    const sanitizedOrderInstructions =
      allowInstructions && specialInstructions && typeof specialInstructions === "string"
        ? specialInstructions.trim().slice(0, 500) || null
        : null;

    // 4. Generate order ID and friendly order number (e.g. ORD-XXXX)
    const orderId = crypto.randomUUID();
    const orderNumber = `ORD-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const currency = evaluation.currency;

    // 5. Execute Order creation, Customer provisioning, and Promotions atomically in a single serialized write lock
    const createdOrder = await withWriteLock(async () => {
      return prisma.$transaction(
        async (tx) => {
        // Atomically resolve or create customer inside transaction to avoid SQLite write lock splitting
        let customerId: string | null = existingCustomerId;
        if (existingCustomerId) {
          if (
            cleanName &&
            existingCustomerName &&
            existingCustomerName.startsWith("Guest") &&
            !cleanName.startsWith("Guest")
          ) {
            await tx.customer.update({
              where: { id: existingCustomerId },
              data: { name: cleanName },
            });
          }
        } else if (cleanPhone || cleanEmail) {
          const newCustomer = await tx.customer.create({
            data: {
              restaurantId: restaurant.id,
              name: cleanName || `Guest (${table.name})`,
              phone: cleanPhone,
              email: cleanEmail,
            },
          });
          customerId = newCustomer.id;
        }

        // Fast-fail: atomically test and reserve promotion usage before writing any order records
        if (evaluation.promotion) {
          await reservePromotionInTransaction(tx, {
            restaurantId: restaurant.id,
            customerId,
            customerIdentifier: evaluation.customerIdentifier,
            evaluation,
          });
        }


        // Create Order
        const order = await tx.order.create({
          data: {
            id: orderId,
            restaurantId: restaurant.id,
            tableId: table.id,
            orderNumber,
            idempotencyKey: cleanIdempotencyKey,
            status: "PENDING",
            subtotal: evaluation.subtotal,
            promotionId: evaluation.promotion ? evaluation.promotion.id : null,
            couponCode: evaluation.promotion ? evaluation.promotion.code : null,
            promotionNameSnapshot: evaluation.promotion ? evaluation.promotion.name : null,
            discountTypeSnapshot: evaluation.promotion ? evaluation.promotion.discountType : null,
            discountValueSnapshot: evaluation.promotion
              ? evaluation.promotion.discountValue
              : null,
            eligibleSubtotal: evaluation.promotion ? evaluation.eligibleSubtotal : null,
            discountAmount: evaluation.discountAmount,
            loyaltyPointsRedeemed,
            loyaltyDiscountAmount,
            loyaltyRewardId: appliedLoyaltyRewardId,
            tax: finalTax,
            appliedTaxPercentage: evaluation.appliedTaxPercentage,
            total: finalTotal,
            specialInstructions: sanitizedOrderInstructions,
            customerId,
            items: {
              create: evaluation.orderLines.map((line) => ({
                menuItemId: line.menuItemId,
                name: line.name,
                price: line.basePrice,
                quantity: line.quantity,
                specialInstructions: line.specialInstructions,
                selectedVariant: line.selectedVariant
                  ? {
                      create: {
                        variantId: line.selectedVariant.variantId,
                        name: line.selectedVariant.name,
                        price: line.selectedVariant.price,
                      },
                    }
                  : undefined,
                selectedAddons:
                  line.selectedAddons.length > 0
                    ? {
                        create: line.selectedAddons.map((a) => ({
                          addonId: a.addonId,
                          name: a.name,
                          price: a.price,
                        })),
                      }
                    : undefined,
              })),
            },
            ...(paymentMethod === "CASH"
              ? {
                  payments: {
                    create: {
                      restaurantId: restaurant.id,
                      provider: "CASH",
                      paymentMethod: "CASH",
                      amount: evaluation.total,
                      currency,
                      status: "PENDING",
                    },
                  },
                }
              : {}),
          },
          include: {
            payments: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
            items: {
              include: {
                selectedVariant: true,
                selectedAddons: true,
              },
            },
          },
        });

        // Record immutable PromotionRedemption row referencing the committed orderId
        if (evaluation.promotion) {
          await recordPromotionRedemptionInTransaction(tx, {
            restaurantId: restaurant.id,
            orderId,
            customerId,
            customerIdentifier: evaluation.customerIdentifier,
            evaluation,
          });
        }

        // Atomically reserve loyalty points and record ledger entry referencing the committed orderId
        if (loyaltyPointsRedeemed && loyaltyPointsRedeemed > 0 && customerId) {
          await reserveLoyaltyPointsInTransaction(tx, {
            restaurantId: restaurant.id,
            customerId,
            pointsToRedeem: loyaltyPointsRedeemed,
            orderId,
            orderNumber,
            rewardId: appliedLoyaltyRewardId,
          });
        }

        return order;
      },
      {
        maxWait: 30000,
        timeout: 30000,
      }
    );
  });

    const totalItemQuantity = items.reduce(
      (sum: number, item: { quantity?: number }) => sum + (Number(item.quantity) || 1),
      0
    );

    // Decouple non-critical post-order side effects (staff notifications & tenant webhooks)
    // Non-blocking asynchronous dispatch so client gets immediate sub-50ms response
    const backgroundSideEffects = [
      notifyOrderCreated({
        restaurantId: restaurant.id,
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        tableName: table.name,
        tableNumber: table.number,
        itemCount: totalItemQuantity,
        totalAmount: Number(createdOrder.total),
        customerName: cleanName,
      }),
      dispatchTenantWebhookEvent(restaurant.id, "order.created", {
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        tableName: table.name,
        subtotal: Number(createdOrder.subtotal),
        discountAmount: Number(createdOrder.discountAmount),
        loyaltyDiscountAmount: Number(createdOrder.loyaltyDiscountAmount),
        tax: Number(createdOrder.tax),
        total: Number(createdOrder.total),
        status: createdOrder.status,
        itemCount: totalItemQuantity,
      }),
    ];

    setImmediate(() => {
      Promise.all(backgroundSideEffects).catch((err) =>
        console.error("[ASYNC_ORDER_SIDE_EFFECT_ERROR]", err)
      );
    });

    let paymentResult: unknown = undefined;
    if (paymentMethod === "ONLINE") {
      paymentResult = await createOrderPayment({
        orderId: createdOrder.id,
        restaurantId: restaurant.id,
        tableId: table.id,
        currency,
        method: "ONLINE",
      });
    } else if (paymentMethod === "CASH" && createdOrder.payments?.[0]) {
      const createdCashPayment = createdOrder.payments[0];
      paymentResult = {
        paymentId: createdCashPayment.id,
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        amount: Number(createdOrder.total),
        currency,
        status: "PENDING",
        provider: "CASH",
        providerOrderId: null,
        isMockProvider: false,
      };
    }

    return NextResponse.json(
      {
        success: true,
        order: {
          id: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          paymentStatus: createdOrder.paymentStatus,
          subtotal: Number(createdOrder.subtotal),
          couponCode: createdOrder.couponCode,
          promotionName: createdOrder.promotionNameSnapshot,
          discountAmount: Number(createdOrder.discountAmount),
          loyaltyPointsRedeemed: createdOrder.loyaltyPointsRedeemed,
          loyaltyDiscountAmount: Number(createdOrder.loyaltyDiscountAmount || 0),
          loyaltyRewardName: appliedLoyaltyRewardName,
          tax: Number(createdOrder.tax),
          appliedTaxPercentage: Number(createdOrder.appliedTaxPercentage ?? 0),
          total: Number(createdOrder.total),
          specialInstructions: createdOrder.specialInstructions,
          createdAt: createdOrder.createdAt.toISOString(),
          items: createdOrder.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            variant: i.selectedVariant ? { name: i.selectedVariant.name } : null,
            addons: i.selectedAddons.map((a) => ({ name: a.name })),
          })),
        },
        ...(paymentResult ? { payment: paymentResult } : {}),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof PromotionRuleError || error instanceof LoyaltyRuleError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status }
      );
    }

    console.error("POST /api/v1/orders error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
