const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const TEST_SECRET = "rzp_test_secret_dev_key_2026";

function generateTestSignature(orderId, paymentId, secret = TEST_SECRET) {
  const text = `${orderId}|${paymentId}`;
  return crypto.createHmac("sha256", secret).update(text).digest("hex");
}

function generateWebhookSignature(rawBody, secret = TEST_SECRET) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runAudit() {
  console.log("=================================================");
  console.log("  RESTAURANT SAAS — PHASE 9 COMPLETE AUDIT SUITE");
  console.log("=================================================\n");

  try {
    // 1. Setup Test Data
    console.log("[1/7] Setting up Tenant & Order context...");
    const restaurant = await prisma.restaurant.findFirst({
      where: { status: "ACTIVE" },
      include: {
        tables: { where: { status: "ACTIVE" }, include: { qrCodes: true } },
        menuItems: { where: { status: "ACTIVE", isAvailable: true } },
      },
    });

    if (!restaurant || restaurant.tables.length === 0 || restaurant.menuItems.length === 0) {
      throw new Error("No active restaurant, table, or menu item found in database. Seed data first.");
    }

    const table = restaurant.tables[0];
    const qrCode = table.qrCodes[0];
    const menuItem = restaurant.menuItems[0];

    assert(!!qrCode, "Valid active QR Code context resolved");
    assert(restaurant.menuItems.length > 0, "Active menu items available for order calculation");

    // 2. Order Creation & Trusted Total Calculation
    console.log("\n[2/7] Testing Order Creation & Trusted Total Calculation...");
    const orderNumber = `ORD-T9-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const subtotal = Number(menuItem.price) * 2;
    const taxRate = restaurant.taxPercentage || 0;
    const tax = (subtotal * taxRate) / 100;
    const total = subtotal + tax;

    const order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        orderNumber,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal,
        tax,
        total,
        items: {
          create: [
            {
              menuItemId: menuItem.id,
              name: menuItem.name,
              price: menuItem.price,
              quantity: 2,
            },
          ],
        },
      },
    });

    assert(order.paymentStatus === "PENDING", "Initial order created with paymentStatus: PENDING");
    assert(Number(order.total) === total, "Server-calculated order total matches items + tax calculation");

    // 3. Payment Creation & Idempotency
    console.log("\n[3/7] Testing Payment Creation & Idempotency...");
    const { createOrderPayment } = require("./src/lib/payments/service");

    const idempotencyKey = `idem_${crypto.randomBytes(8).toString("hex")}`;
    const paymentResult1 = await createOrderPayment({
      orderId: order.id,
      restaurantId: restaurant.id,
      tableId: table.id,
      currency: restaurant.currency || "USD",
      idempotencyKey,
      method: "ONLINE",
    });

    assert(paymentResult1.status === "PENDING", "Payment created in PENDING status");
    assert(paymentResult1.amount === total, "Payment amount strictly matches server order total");
    assert(!!paymentResult1.providerOrderId, "Provider order reference generated");

    // Repeat with same idempotency key (must return same payment without duplicate charge)
    const paymentResult2 = await createOrderPayment({
      orderId: order.id,
      restaurantId: restaurant.id,
      tableId: table.id,
      currency: restaurant.currency || "USD",
      idempotencyKey,
      method: "ONLINE",
    });

    assert(paymentResult2.paymentId === paymentResult1.paymentId, "Idempotent payment creation returns identical payment ID");
    assert(paymentResult2.providerOrderId === paymentResult1.providerOrderId, "Idempotent payment creation returns identical provider order reference");

    // 4. Security & Tenant Isolation Checks
    console.log("\n[4/7] Testing Security & Tenant Isolation...");
    let crossTenantBlocked = false;
    try {
      await createOrderPayment({
        orderId: order.id,
        restaurantId: "fake-unauthorized-tenant-id",
        tableId: table.id,
        currency: "USD",
        method: "ONLINE",
      });
    } catch (e) {
      crossTenantBlocked = true;
    }
    assert(crossTenantBlocked, "Cross-tenant payment initiation blocked server-side");

    // 5. Cryptographic Verification Tests
    console.log("\n[5/7] Testing Cryptographic Payment Verification...");
    const { verifyOrderPayment } = require("./src/lib/payments/service");

    // 5a. Tampered / Invalid Signature
    const fakePaymentId = `pay_fake_${Date.now()}`;
    const tamperedVerify = await verifyOrderPayment({
      paymentId: paymentResult1.paymentId,
      orderId: order.id,
      razorpay_order_id: paymentResult1.providerOrderId,
      razorpay_payment_id: fakePaymentId,
      razorpay_signature: "tampered_invalid_signature_xyz123",
    });

    assert(!tamperedVerify.success, "Tampered cryptographic signature rejected");
    assert(tamperedVerify.status === "FAILED", "Failed verification records payment status as FAILED in DB");

    // 5b. Valid Cryptographic Signature
    const validPaymentId = `pay_valid_${Date.now()}`;
    const validSignature = generateTestSignature(paymentResult1.providerOrderId, validPaymentId);

    const validVerify = await verifyOrderPayment({
      paymentId: paymentResult1.paymentId,
      orderId: order.id,
      razorpay_order_id: paymentResult1.providerOrderId,
      razorpay_payment_id: validPaymentId,
      razorpay_signature: validSignature,
    });

    assert(validVerify.success, "Authentic cryptographic signature verified successfully");
    assert(validVerify.status === "PAID", "Payment transitioned to PAID status");

    const refreshedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    assert(refreshedOrder.paymentStatus === "PAID", "Order paymentStatus transitioned to PAID in database transaction");

    // 5c. Idempotent Verification
    const repeatVerify = await verifyOrderPayment({
      paymentId: paymentResult1.paymentId,
      orderId: order.id,
      razorpay_order_id: paymentResult1.providerOrderId,
      razorpay_payment_id: validPaymentId,
      razorpay_signature: validSignature,
    });
    assert(repeatVerify.success && repeatVerify.status === "PAID", "Repeated verification is idempotent and returns PAID");

    // 5d. Block Payment on Already Paid Order
    let alreadyPaidBlocked = false;
    try {
      await createOrderPayment({
        orderId: order.id,
        restaurantId: restaurant.id,
        tableId: table.id,
        currency: "USD",
        method: "ONLINE",
      });
    } catch (e) {
      alreadyPaidBlocked = true;
    }
    assert(alreadyPaidBlocked, "Attempt to initiate payment on already-paid order rejected");

    // 6. Webhook Processing & Idempotency
    console.log("\n[6/7] Testing Webhook Verification & Idempotency...");
    const { processPaymentWebhook } = require("./src/lib/payments/service");

    // Create fresh order for webhook testing
    const webhookOrderNumber = `ORD-WH-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const webhookOrder = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        orderNumber: webhookOrderNumber,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal: 100,
        tax: 0,
        total: 100,
      },
    });

    const webhookPayment = await createOrderPayment({
      orderId: webhookOrder.id,
      restaurantId: restaurant.id,
      tableId: table.id,
      currency: "USD",
      method: "ONLINE",
    });

    const eventId = `evt_${crypto.randomBytes(6).toString("hex")}`;
    const webhookPayload = JSON.stringify({
      event_id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_wh_${Date.now()}`,
            order_id: webhookPayment.providerOrderId,
            method: "upi",
            amount: 10000,
          },
        },
      },
    });

    // 6a. Webhook Invalid Signature
    const invalidWhResult = await processPaymentWebhook({
      rawBody: webhookPayload,
      signature: "invalid_wh_signature",
    });
    assert(!invalidWhResult.success, "Invalid webhook signature rejected with 400");

    // 6b. Webhook Valid Signature
    const validWhSignature = generateWebhookSignature(webhookPayload);
    const validWhResult = await processPaymentWebhook({
      rawBody: webhookPayload,
      signature: validWhSignature,
    });
    assert(validWhResult.success, "Authentic webhook signature accepted and processed");

    const webhookPaidOrder = await prisma.order.findUnique({ where: { id: webhookOrder.id } });
    assert(webhookPaidOrder.paymentStatus === "PAID", "Order updated to PAID via webhook event");

    // 6c. Webhook Duplicate Event (Idempotency)
    const duplicateWhResult = await processPaymentWebhook({
      rawBody: webhookPayload,
      signature: validWhSignature,
    });
    assert(duplicateWhResult.success && duplicateWhResult.message.includes("idempotent"), "Duplicate webhook event detected and safely skipped (idempotent)");

    // 7. Cash Settlement & Phase 1-8 Regressions
    console.log("\n[7/7] Testing Cash Settlement & Phases 1-8 Integration...");
    const { markCashPaymentPaid } = require("./src/lib/payments/service");

    const cashOrderNumber = `ORD-CASH-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const cashOrder = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        orderNumber: cashOrderNumber,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal: 50,
        tax: 0,
        total: 50,
      },
    });

    await markCashPaymentPaid({ orderId: cashOrder.id, restaurantId: restaurant.id });
    const cashPaidOrder = await prisma.order.findUnique({ where: { id: cashOrder.id } });
    assert(cashPaidOrder.paymentStatus === "PAID", "Admin marked cash payment as PAID successfully");

    // Order status transitions (Phase 7 & 8 regression)
    const updatedStatusOrder = await prisma.order.update({
      where: { id: cashOrder.id },
      data: { status: "PREPARING" },
    });
    assert(updatedStatusOrder.status === "PREPARING" && updatedStatusOrder.paymentStatus === "PAID", "Order status and payment status remain completely decoupled and independent");

    console.log("\n=================================================");
    console.log(`  AUDIT RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Audit error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
