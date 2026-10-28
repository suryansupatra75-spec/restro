const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

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

async function runE2ETests() {
  console.log("=================================================");
  console.log("  PHASE 9 E2E HTTP INTEGRATION & AUDIT SUITE");
  console.log("=================================================\n");

  try {
    // 0. Wait for server
    console.log("[0/6] Checking server availability at " + BASE_URL + "...");
    let serverReady = false;
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${BASE_URL}/`);
        if (res.status < 500) {
          serverReady = true;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!serverReady) {
      throw new Error("Server not responding at " + BASE_URL);
    }
    console.log("Server is online.\n");

    // 1. Fetch valid QR code and menu item from database
    console.log("[1/6] Retrieving context from database...");
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        status: "ACTIVE",
        tables: { some: { qrCodes: { some: { status: "ACTIVE" } } } },
        menuItems: { some: { status: "ACTIVE", isAvailable: true } },
      },
      include: {
        tables: {
          where: { status: "ACTIVE", qrCodes: { some: { status: "ACTIVE" } } },
          include: { qrCodes: { where: { status: "ACTIVE" } } },
        },
        menuItems: { where: { status: "ACTIVE", isAvailable: true } },
      },
    });

    if (!restaurant || restaurant.tables.length === 0 || restaurant.menuItems.length === 0) {
      throw new Error("Missing active restaurant, table, or items in DB");
    }

    const table = restaurant.tables[0];
    const qrCode = table.qrCodes[0];
    const menuItem = restaurant.menuItems[0];

    assert(!!qrCode && !!qrCode.token, `Found active QR Token: ${qrCode.token}`);

    // 2. Order Creation via Public Customer Endpoint
    console.log("\n[2/6] Customer Order Creation (Phase 6 Integration)...");
    const orderPayload = {
      token: qrCode.token,
      items: [
        {
          menuItemId: menuItem.id,
          quantity: 2,
        },
      ],
      specialInstructions: "Phase 9 Audit Order",
    };

    const orderRes = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await orderRes.json();

    assert(orderRes.status === 201 && orderData.success, "Customer placed order via /api/v1/orders");
    const orderId = orderData.order.id;
    const orderNumber = orderData.order.orderNumber;
    const trustedTotal = orderData.order.total;

    assert(orderData.order.status === "PENDING", "Initial order status is PENDING");

    // 3. Payment Creation via /api/v1/payments/create
    console.log("\n[3/6] Testing Payment Creation & Idempotency...");
    const idemKey = `idem_${Date.now()}`;
    const payCreateRes1 = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        token: qrCode.token,
        method: "ONLINE",
        idempotencyKey: idemKey,
      }),
    });
    const payCreateData1 = await payCreateRes1.json();

    assert(payCreateRes1.status === 200 && payCreateData1.success, "Payment created via /api/v1/payments/create");
    assert(payCreateData1.payment.amount === trustedTotal, "Payment amount strictly matches server order total");
    assert(payCreateData1.payment.status === "PENDING", "Payment record status is PENDING");

    const paymentId = payCreateData1.payment.paymentId;
    const providerOrderId = payCreateData1.payment.providerOrderId;

    // Idempotency: call again with same idempotency key
    const payCreateRes2 = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        token: qrCode.token,
        method: "ONLINE",
        idempotencyKey: idemKey,
      }),
    });
    const payCreateData2 = await payCreateRes2.json();

    assert(
      payCreateRes2.status === 200 && payCreateData2.payment.paymentId === paymentId,
      "Idempotent payment creation returns existing payment ID without creating duplicate charges"
    );

    // 4. Security & Tenant Isolation Tests
    console.log("\n[4/6] Testing Security, IDOR & Tenant Isolation...");
    const crossTenantRes = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        token: "unauthorized_fake_token_999",
        method: "ONLINE",
      }),
    });
    assert(crossTenantRes.status === 403, "Tampered/invalid QR token rejected with 403 Forbidden");

    const invalidOrderRes = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "fake-order-id-404",
        token: qrCode.token,
        method: "ONLINE",
      }),
    });
    assert(invalidOrderRes.status === 404, "Invalid orderId rejected with 404 Not Found");

    // 5. Cryptographic Verification via /api/v1/payments/verify
    console.log("\n[5/6] Testing Cryptographic Payment Verification...");
    // 5a. Tampered Signature
    const tamperedVerifyRes = await fetch(`${BASE_URL}/api/v1/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        paymentId,
        token: qrCode.token,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: "pay_tampered_123",
        razorpay_signature: "tampered_invalid_hex_signature",
      }),
    });
    const tamperedVerifyData = await tamperedVerifyRes.json();
    assert(tamperedVerifyRes.status === 400 && !tamperedVerifyData.success, "Tampered payment signature rejected by server");

    // 5b. Valid Cryptographic Signature
    const validPaymentId = `pay_valid_${Date.now()}`;
    const signRes = await fetch(`${BASE_URL}/api/v1/payments/test-sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: providerOrderId,
        razorpayPaymentId: validPaymentId,
      }),
    });
    const { signature } = await signRes.json();

    const validVerifyRes = await fetch(`${BASE_URL}/api/v1/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        paymentId,
        token: qrCode.token,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: validPaymentId,
        razorpay_signature: signature,
      }),
    });
    const validVerifyData = await validVerifyRes.json();

    assert(validVerifyRes.status === 200 && validVerifyData.success, "Valid payment signature verified by server");
    assert(validVerifyData.status === "PAID", "Payment transitioned to PAID status");

    // Verify status query endpoint
    const statusQueryRes = await fetch(`${BASE_URL}/api/v1/payments/status?orderId=${orderId}&token=${qrCode.token}`);
    const statusQueryData = await statusQueryRes.json();
    assert(statusQueryData.paymentStatus === "PAID", "Order paymentStatus is verified PAID in database");

    // Verify already-paid order rejection
    const alreadyPaidRes = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        token: qrCode.token,
        method: "ONLINE",
      }),
    });
    assert(alreadyPaidRes.status === 400, "Attempt to initiate payment on already-paid order rejected with 400");

    // 6. Webhook Processing via /api/v1/payments/webhook
    console.log("\n[6/6] Testing Webhook Signature Verification & Idempotency...");
    const whOrderRes = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: qrCode.token,
        items: [{ menuItemId: menuItem.id, quantity: 1 }],
      }),
    });
    const whOrderData = await whOrderRes.json();
    const whOrderId = whOrderData.order.id;

    const whPayRes = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: whOrderId,
        token: qrCode.token,
        method: "ONLINE",
      }),
    });
    const whPayData = await whPayRes.json();
    const whProviderOrderId = whPayData.payment.providerOrderId;

    const whEventId = `evt_audit_${Date.now()}`;
    const whPayload = JSON.stringify({
      event_id: whEventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_wh_${Date.now()}`,
            order_id: whProviderOrderId,
            method: "upi",
            amount: 5000,
          },
        },
      },
    });

    // 6a. Webhook invalid signature
    const invalidWhRes = await fetch(`${BASE_URL}/api/v1/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_sig",
      },
      body: whPayload,
    });
    assert(invalidWhRes.status === 400, "Webhook with invalid signature rejected with 400");

    // 6b. Webhook valid signature
    const TEST_SECRET = "rzp_test_secret_dev_key_2026";
    const validWhSig = crypto.createHmac("sha256", TEST_SECRET).update(whPayload).digest("hex");

    const validWhRes = await fetch(`${BASE_URL}/api/v1/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validWhSig,
      },
      body: whPayload,
    });
    assert(validWhRes.status === 200, "Webhook with authentic signature processed successfully (200 OK)");

    // 6c. Webhook duplicate delivery (Idempotency)
    const dupWhRes = await fetch(`${BASE_URL}/api/v1/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validWhSig,
      },
      body: whPayload,
    });
    const dupWhData = await dupWhRes.json();
    assert(dupWhRes.status === 200 && dupWhData.message.includes("idempotent"), "Duplicate webhook delivery recognized as idempotent and skipped safely");

    console.log("\n=================================================");
    console.log(`  E2E AUDIT RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("E2E Audit error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runE2ETests();
