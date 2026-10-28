import { prisma } from "@/lib/db";
import {
  PaymentStatus,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookResult,
} from "./types";
import {
  createRazorpayOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  getRazorpayKeyId,
  isRealRazorpayConfigured,
} from "./razorpay";
import { notifyPaymentStatusChanged } from "@/lib/notifications/service";
import { generateReceiptSnapshot } from "@/lib/receipts/service";

/**
 * Creates or retrieves an existing payment record for an order
 * Strictly enforces server-side validation of order total and tenant isolation.
 */
export async function createOrderPayment(
  input: CreatePaymentInput
): Promise<CreatePaymentResult> {
  const { orderId, restaurantId, idempotencyKey, method = "ONLINE" } = input;

  // 1. Fetch order from DB to validate ownership and calculate trusted total
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: true,
      table: true,
      payments: {
        where: {
          status: { in: ["CREATED", "PENDING", "PROCESSING"] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  // Tenant isolation check
  if (order.restaurantId !== restaurantId) {
    throw new Error("Forbidden: Order does not belong to this restaurant");
  }

  // Check if order is already paid
  if (order.paymentStatus === "PAID") {
    throw new Error("Order has already been paid");
  }

  if (order.status === "CANCELLED" || order.status === "REJECTED") {
    throw new Error("Cannot make payment for a cancelled or rejected order");
  }

  const trustedAmount = Number(order.total);
  if (trustedAmount <= 0) {
    throw new Error("Invalid order total amount");
  }

  const currency = order.restaurant.currency || input.currency || "USD";

  // 2. Check Idempotency key if provided
  if (idempotencyKey) {
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      if (existingPayment.restaurantId !== restaurantId) {
        throw new Error("Unauthorized idempotency key reuse");
      }
      return {
        paymentId: existingPayment.id,
        orderId: existingPayment.orderId,
        orderNumber: order.orderNumber,
        amount: Number(existingPayment.amount),
        currency: existingPayment.currency,
        status: existingPayment.status as PaymentStatus,
        provider: existingPayment.provider,
        providerOrderId: existingPayment.providerOrderId,
        keyId: getRazorpayKeyId(),
        isMockProvider: !isRealRazorpayConfigured(),
      };
    }
  }

  const existingPendingPayment = order.payments[0];

  // 3. Handle Cash Flow (idempotent: reuse existing pending CASH payment if present)
  if (method === "CASH") {
    if (
      existingPendingPayment &&
      existingPendingPayment.provider === "CASH" &&
      Number(existingPendingPayment.amount) === trustedAmount
    ) {
      return {
        paymentId: existingPendingPayment.id,
        orderId,
        orderNumber: order.orderNumber,
        amount: Number(existingPendingPayment.amount),
        currency: existingPendingPayment.currency,
        status: existingPendingPayment.status as PaymentStatus,
        provider: "CASH",
        providerOrderId: null,
        isMockProvider: false,
      };
    }

    const cashPayment = await prisma.payment.create({
      data: {
        restaurantId,
        orderId,
        provider: "CASH",
        paymentMethod: "CASH",
        amount: trustedAmount,
        currency,
        status: "PENDING",
        idempotencyKey: idempotencyKey || null,
      },
    });

    return {
      paymentId: cashPayment.id,
      orderId,
      orderNumber: order.orderNumber,
      amount: trustedAmount,
      currency,
      status: "PENDING",
      provider: "CASH",
      providerOrderId: null,
      isMockProvider: false,
    };
  }

  // 4. Reuse active pending provider payment if available (prevents double charges)
  if (
    existingPendingPayment &&
    existingPendingPayment.provider === "RAZORPAY" &&
    existingPendingPayment.providerOrderId &&
    Number(existingPendingPayment.amount) === trustedAmount
  ) {
    return {
      paymentId: existingPendingPayment.id,
      orderId,
      orderNumber: order.orderNumber,
      amount: Number(existingPendingPayment.amount),
      currency: existingPendingPayment.currency,
      status: existingPendingPayment.status as PaymentStatus,
      provider: "RAZORPAY",
      providerOrderId: existingPendingPayment.providerOrderId,
      keyId: getRazorpayKeyId(),
      isMockProvider: !isRealRazorpayConfigured(),
    };
  }

  // 5. Create provider order (Razorpay)
  const providerOrder = await createRazorpayOrder({
    amount: trustedAmount,
    currency,
    receipt: order.orderNumber,
    notes: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurantId: order.restaurantId,
    },
  });

  // 6. Record Payment in DB
  const payment = await prisma.payment.create({
    data: {
      restaurantId,
      orderId,
      provider: "RAZORPAY",
      providerOrderId: providerOrder.providerOrderId,
      amount: trustedAmount,
      currency,
      status: "PENDING",
      paymentMethod: "ONLINE",
      idempotencyKey: idempotencyKey || null,
    },
  });

  return {
    paymentId: payment.id,
    orderId,
    orderNumber: order.orderNumber,
    amount: trustedAmount,
    currency,
    status: "PENDING",
    provider: "RAZORPAY",
    providerOrderId: providerOrder.providerOrderId,
    keyId: getRazorpayKeyId(),
    isMockProvider: !isRealRazorpayConfigured(),
  };
}

/**
 * Server-side payment verification
 * Validates cryptographic signature and transitions Payment & Order to PAID in a transaction.
 */
export async function verifyOrderPayment(
  input: VerifyPaymentInput
): Promise<VerifyPaymentResult> {
  const {
    paymentId,
    orderId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = input;

  // 1. Fetch payment and order
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });

  if (!payment) {
    return {
      success: false,
      paymentId,
      orderId,
      amount: 0,
      status: "FAILED",
      error: "Payment record not found",
    };
  }

  if (payment.orderId !== orderId) {
    return {
      success: false,
      paymentId,
      orderId,
      amount: Number(payment.amount),
      status: "FAILED",
      error: "Payment does not match the specified order",
    };
  }

  // If already paid, return idempotent success
  if (payment.status === "PAID") {
    return {
      success: true,
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      amount: Number(payment.amount),
      status: "PAID",
    };
  }

  const providerOrderId = razorpay_order_id || payment.providerOrderId;
  if (!providerOrderId) {
    return {
      success: false,
      paymentId,
      orderId,
      amount: Number(payment.amount),
      status: "FAILED",
      error: "Missing provider order ID",
    };
  }

  // 2. Cryptographic signature check
  const isValid = verifyRazorpayPaymentSignature({
    razorpayOrderId: providerOrderId,
    razorpayPaymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValid) {
    // Record failure in DB for audit trail
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureReason: "Invalid cryptographic signature",
        providerPaymentId: razorpay_payment_id || null,
        providerSignature: razorpay_signature || null,
      },
    });

    await notifyPaymentStatusChanged({
      restaurantId: payment.restaurantId,
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      status: "FAILED",
      amount: Number(payment.amount),
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      failureReason: "Invalid cryptographic signature",
    });

    return {
      success: false,
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      status: "FAILED",
      error: "Payment verification failed: Invalid signature",
    };
  }

  // 3. Update Payment and Order in a strict ACID transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        providerPaymentId: razorpay_payment_id,
        providerSignature: razorpay_signature,
        paidAt: new Date(),
        failureReason: null,
      },
    });

    return await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus: "PAID",
      },
    });
  });

  await notifyPaymentStatusChanged({
    restaurantId: payment.restaurantId,
    paymentId: payment.id,
    orderId: payment.orderId,
    orderNumber: updatedOrder.orderNumber,
    status: "PAID",
    amount: Number(payment.amount),
    currency: payment.currency,
    paymentMethod: payment.paymentMethod,
  });

  try {
    await generateReceiptSnapshot({
      orderId: payment.orderId,
      restaurantId: payment.restaurantId,
      paymentId: payment.id,
      actor: "PAYMENT_GATEWAY",
    });
  } catch (err) {
    console.error("Failed to generate digital receipt snapshot:", err);
  }

  return {
    success: true,
    paymentId: payment.id,
    orderId: payment.orderId,
    orderNumber: updatedOrder.orderNumber,
    amount: Number(payment.amount),
    status: "PAID",
  };
}

/**
 * Handles incoming provider webhooks with strict idempotency and signature verification
 */
export async function processPaymentWebhook({
  rawBody,
  signature,
}: {
  rawBody: string;
  signature: string;
}): Promise<WebhookResult> {
  // 1. Verify signature
  const isValid = verifyRazorpayWebhookSignature({
    rawBody,
    signature,
  });

  if (!isValid) {
    return {
      success: false,
      message: "Invalid webhook signature",
      status: 400,
    };
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      message: "Invalid JSON payload",
      status: 400,
    };
  }

  const eventId = String(event.event_id || event.id || `evt_${Date.now()}`);
  const eventType = String(event.event || "");

  // 2. Check Idempotency via PaymentWebhookEvent
  const existingEvent = await prisma.paymentWebhookEvent.findUnique({
    where: { eventId },
  });

  if (existingEvent && existingEvent.processed) {
    return {
      success: true,
      message: "Webhook event already processed (idempotent)",
      eventId,
      status: 200,
    };
  }

  // Record incoming event
  if (!existingEvent) {
    await prisma.paymentWebhookEvent.create({
      data: {
        eventId,
        provider: "RAZORPAY",
        eventType: eventType || "UNKNOWN",
        payload: rawBody,
        processed: false,
      },
    });
  }

  // 3. Process Event Types
  // Razorpay events: order.paid, payment.captured, payment.failed
  const payloadObj = event.payload as Record<string, unknown> | undefined;
  const paymentObj = payloadObj?.payment as Record<string, unknown> | undefined;
  const orderObj = payloadObj?.order as Record<string, unknown> | undefined;
  const paymentEntity = paymentObj?.entity as Record<string, unknown> | undefined;
  const orderEntity = orderObj?.entity as Record<string, unknown> | undefined;

  if (eventType === "order.paid" || eventType === "payment.captured") {
    const providerOrderId = (orderEntity?.id as string | undefined) || (paymentEntity?.order_id as string | undefined);
    const providerPaymentId = paymentEntity?.id as string | undefined;
    const paymentMethod = paymentEntity?.method as string | undefined;

    if (providerOrderId) {
      const payment = await prisma.payment.findFirst({
        where: { providerOrderId },
        include: { order: true },
      });

      if (payment && payment.status !== "PAID") {
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "PAID",
              providerPaymentId: providerPaymentId || payment.providerPaymentId,
              paymentMethod: paymentMethod || payment.paymentMethod,
              paidAt: new Date(),
              failureReason: null,
            },
          });

          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              paymentStatus: "PAID",
            },
          });
        });

        await notifyPaymentStatusChanged({
          restaurantId: payment.restaurantId,
          paymentId: payment.id,
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          status: "PAID",
          amount: Number(payment.amount),
          currency: payment.currency,
          paymentMethod: paymentMethod || payment.paymentMethod,
        });

        try {
          await generateReceiptSnapshot({
            orderId: payment.orderId,
            restaurantId: payment.restaurantId,
            paymentId: payment.id,
            actor: "PAYMENT_WEBHOOK",
          });
        } catch (err) {
          console.error("Failed to generate digital receipt via webhook:", err);
        }
      }
    }
  } else if (eventType === "payment.failed") {
    const providerOrderId = paymentEntity?.order_id as string | undefined;
    const failureReason =
      (paymentEntity?.error_description as string | undefined) || "Payment failed at gateway";

    if (providerOrderId) {
      const payment = await prisma.payment.findFirst({
        where: { providerOrderId },
        include: { order: true },
      });

      if (payment && payment.status !== "PAID") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            failureReason,
            providerPaymentId: (paymentEntity?.id as string | undefined) || null,
          },
        });

        await notifyPaymentStatusChanged({
          restaurantId: payment.restaurantId,
          paymentId: payment.id,
          orderId: payment.orderId,
          orderNumber: payment.order.orderNumber,
          status: "FAILED",
          amount: Number(payment.amount),
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          failureReason,
        });
      }
    }
  }

  // Mark event processed
  await prisma.paymentWebhookEvent.update({
    where: { eventId },
    data: { processed: true },
  });

  return {
    success: true,
    message: "Webhook processed successfully",
    eventId,
    status: 200,
  };
}

/**
 * Admin action to mark cash payment as paid
 */
export async function markCashPaymentPaid({
  orderId,
  restaurantId,
}: {
  orderId: string;
  restaurantId: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.restaurantId !== restaurantId) {
    throw new Error("Forbidden: Order does not belong to this restaurant");
  }

  let cashPaymentId = "";
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Find or create cash payment record
    const existingPayment = order.payments.find((p) => p.provider === "CASH");
    if (existingPayment) {
      cashPaymentId = existingPayment.id;
      await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
        },
      });
    } else {
      const created = await tx.payment.create({
        data: {
          restaurantId,
          orderId,
          provider: "CASH",
          paymentMethod: "CASH",
          amount: order.total,
          currency: "USD",
          status: "PAID",
          paidAt: new Date(),
        },
      });
      cashPaymentId = created.id;
    }

    return await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
      },
    });
  });

  if (cashPaymentId) {
    await notifyPaymentStatusChanged({
      restaurantId,
      paymentId: cashPaymentId,
      orderId,
      orderNumber: updatedOrder.orderNumber,
      status: "PAID",
      amount: Number(order.total),
      currency: "USD",
      paymentMethod: "CASH",
    });

    try {
      await generateReceiptSnapshot({
        orderId,
        restaurantId,
        paymentId: cashPaymentId,
        actor: "STAFF_CASH_CONFIRM",
      });
    } catch (err) {
      console.error("Failed to generate digital receipt for cash payment:", err);
    }
  }

  return updatedOrder;
}
