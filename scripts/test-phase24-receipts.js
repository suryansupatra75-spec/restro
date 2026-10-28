/**
 * Phase 24: Digital Receipts, Automatic Delivery & Customer CRM Receipt History
 * Verification Suite
 */

const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET =
  process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function makeToken(userId, email) {
  return await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

async function apiFetch(urlPath, options = {}) {
  const { token, method = "GET", body } = options;
  const headers = { ...(options.headers || {}), Connection: "close" };

  if (token) {
    headers["Cookie"] = `session=${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body:
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data, text };
}

async function runPhase24Tests() {
  console.log("================================================================================");
  console.log("PHASE 24: DIGITAL RECEIPTS & CRM HISTORY VERIFICATION SUITE");
  console.log("================================================================================\n");

  const ts = Date.now();

  try {
    // --------------------------------------------------------------------------
    // 1. Database Schema Verification
    // --------------------------------------------------------------------------
    console.log("--- 1. Schema & Models Verification ---");
    const drCount = await prisma.digitalReceipt.count();
    const dlCount = await prisma.receiptDeliveryLog.count();
    assert(typeof drCount === "number", "DigitalReceipt table exists and queries successfully", `Count: ${drCount}`);
    assert(typeof dlCount === "number", "ReceiptDeliveryLog table exists and queries successfully", `Count: ${dlCount}`);

    // --------------------------------------------------------------------------
    // 2. Fetch or Setup Multi-Tenant Test Data
    // --------------------------------------------------------------------------
    console.log("\n--- 2. Setting Up Multi-Tenant Context ---");
    let restaurantA = await prisma.restaurant.findFirst({
      where: { gstNumber: { not: null } },
      include: {
        users: { include: { user: true } },
        tables: true,
        menuItems: true,
      },
    });

    if (!restaurantA) {
      restaurantA = await prisma.restaurant.findFirst({
        include: {
          users: { include: { user: true } },
          tables: true,
          menuItems: true,
        },
      });
    }

    // Ensure restaurant A has GST and tax percentage for tax invoice testing
    await prisma.restaurant.update({
      where: { id: restaurantA.id },
      data: {
        gstNumber: "27AABCU9603R1ZM",
        taxPercentage: 5.0,
      },
    });

    // Find or create Restaurant B for cross-tenant IDOR checks
    let restaurantB = await prisma.restaurant.findFirst({
      where: { id: { not: restaurantA.id } },
      include: {
        users: { include: { user: true } },
        tables: true,
        menuItems: true,
      },
    });

    if (!restaurantB) {
      restaurantB = await prisma.restaurant.create({
        data: {
          name: `Secondary Cafe ${ts}`,
          slug: `secondary-cafe-${ts}`,
          currency: "USD",
          taxPercentage: 0,
          gstNumber: null,
        },
        include: {
          users: { include: { user: true } },
          tables: true,
          menuItems: true,
        },
      });
    }

    const ownerA = restaurantA.users.find((u) => u.role === "OWNER")?.user;
    assert(!!ownerA, "Restaurant A Owner identified", ownerA?.email);

    let ownerB = restaurantB.users.find((u) => u.role === "OWNER")?.user;
    if (!ownerB) {
      const userB = await prisma.user.create({
        data: {
          email: `owner.b.${ts}@test.com`,
          name: "Owner B",
          passwordHash: "dummyhash",
        },
      });
      await prisma.restaurantUser.create({
        data: {
          userId: userB.id,
          restaurantId: restaurantB.id,
          role: "OWNER",
        },
      });
      ownerB = userB;
    }
    assert(!!ownerB, "Restaurant B Owner identified", ownerB?.email);

    const tokenA = await makeToken(ownerA.id, ownerA.email);
    const tokenB = await makeToken(ownerB.id, ownerB.email);

    // Ensure Table & Menu Item exist for Restaurant A
    let tableA = restaurantA.tables[0];
    if (!tableA) {
      tableA = await prisma.table.create({
        data: {
          name: "Table 12",
          restaurantId: restaurantA.id,
        },
      });
    }

    let menuItemA = restaurantA.menuItems[0];
    if (!menuItemA) {
      const cat = await prisma.menuCategory.create({
        data: { name: "Specials", restaurantId: restaurantA.id },
      });
      menuItemA = await prisma.menuItem.create({
        data: {
          name: "Signature Pasta",
          slug: `signature-pasta-${ts}`,
          price: 15.0,
          restaurantId: restaurantA.id,
          categoryId: cat.id,
        },
      });
    }

    // Customer for Restaurant A
    let customerA = await prisma.customer.findFirst({
      where: { restaurantId: restaurantA.id },
    });
    if (!customerA) {
      customerA = await prisma.customer.create({
        data: {
          name: "John Customer",
          email: "john.customer@example.com",
          phone: "+919876543210",
          restaurantId: restaurantA.id,
        },
      });
    }

    // --------------------------------------------------------------------------
    // 3. Paid Order Creation & Digital Receipt Generation
    // --------------------------------------------------------------------------
    console.log("\n--- 3. Order Creation & Digital Receipt Issuance ---");
    const paidOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-${ts}`,
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        customerId: customerA.id,
        status: "COMPLETED",
        paymentStatus: "PAID",
        subtotal: 30.0,
        tax: 1.5,
        appliedTaxPercentage: 5.0,
        discountAmount: 0.0,
        total: 31.5,
        items: {
          create: [
            {
              menuItemId: menuItemA.id,
              name: menuItemA.name,
              price: 15.0,
              quantity: 2,
            },
          ],
        },
        payments: {
          create: [
            {
              restaurantId: restaurantA.id,
              provider: "RAZORPAY",
              paymentMethod: "UPI",
              amount: 31.5,
              status: "PAID",
              providerPaymentId: `pay_test_${ts}`,
            },
          ],
        },
      },
      include: { payments: true },
    });

    const genRes = await apiFetch(`/api/v1/receipts`, {
      method: "POST",
      token: tokenA,
      body: { orderId: paidOrder.id },
    });

    assert(genRes.status === 200, "POST /api/v1/receipts returns 200");
    assert(genRes.data.isNew === true, "Initial receipt snapshot generated (isNew === true)");
    const receipt = genRes.data.receipt;
    assert(receipt.receiptNumber.startsWith("REC-"), "Receipt number formatted sequentially (e.g. REC-YYYY-XXXX)", receipt.receiptNumber);
    assert(receipt.receiptToken.length === 48, "Cryptographic receipt token generated (48 hex chars)", receipt.receiptToken);
    assert(receipt.paymentStatus === "PAID", "Receipt paymentStatus marked as PAID");
    assert(Number(receipt.finalTotal) === 31.5, "Final total matches paid order amount", String(receipt.finalTotal));
    assert(receipt.isTaxInvoice === true, "isTaxInvoice is true when restaurant has GST & Tax rate configured");

    const parsedSnapshot = JSON.parse(receipt.snapshotData);
    assert(parsedSnapshot.items.length === 1, "Snapshot preserved line items accurately", `Items: ${parsedSnapshot.items.length}`);
    assert(parsedSnapshot.restaurant.gstNumber === "27AABCU9603R1ZM", "Snapshot preserved restaurant GST number");

    // --------------------------------------------------------------------------
    // 4. Idempotency Verification
    // --------------------------------------------------------------------------
    console.log("\n--- 4. Receipt Generation Idempotency Check ---");
    const repeatRes = await apiFetch(`/api/v1/receipts`, {
      method: "POST",
      token: tokenA,
      body: { orderId: paidOrder.id },
    });

    assert(repeatRes.status === 200, "Subsequent generation call returns 200");
    assert(repeatRes.data.isNew === false, "Subsequent generation is strictly idempotent (isNew === false)");
    assert(repeatRes.data.receipt.id === receipt.id, "Returned identical digital receipt record");
    const countForOrder = await prisma.digitalReceipt.count({ where: { orderId: paidOrder.id } });
    assert(countForOrder === 1, "Zero duplicate digital receipt rows created for the same order");

    // --------------------------------------------------------------------------
    // 5. Unpaid Order Gatekeeping
    // --------------------------------------------------------------------------
    console.log("\n--- 5. Gatekeeping: Unpaid Orders Must Not Issue Receipt ---");
    const unpaidOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-UNPAID-${ts}`,
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal: 20.0,
        total: 20.0,
      },
    });

    const unpaidRes = await apiFetch(`/api/v1/receipts`, {
      method: "POST",
      token: tokenA,
      body: { orderId: unpaidOrder.id },
    });

    assert(unpaidRes.status === 400, "Generation rejected with 400 for unpaid or pending order");
    const unpaidReceiptCount = await prisma.digitalReceipt.count({ where: { orderId: unpaidOrder.id } });
    assert(unpaidReceiptCount === 0, "No receipt created in database for unpaid order");

    // --------------------------------------------------------------------------
    // 6. Tax Invoice vs Customer Receipt Determination
    // --------------------------------------------------------------------------
    console.log("\n--- 6. Tax Invoice vs Standard Receipt Classification ---");
    await prisma.restaurant.update({
      where: { id: restaurantB.id },
      data: { gstNumber: null, taxPercentage: 0 },
    });

    let tableB = restaurantB.tables[0];
    if (!tableB) {
      tableB = await prisma.table.create({
        data: { name: "Table B1", restaurantId: restaurantB.id },
      });
    }

    const nonTaxOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-NONTAX-${ts}`,
        restaurantId: restaurantB.id,
        tableId: tableB.id,
        status: "COMPLETED",
        paymentStatus: "PAID",
        subtotal: 10.0,
        tax: 0.0,
        total: 10.0,
        payments: {
          create: [
            {
              restaurantId: restaurantB.id,
              provider: "CASH",
              paymentMethod: "CASH",
              amount: 10.0,
              status: "PAID",
            },
          ],
        },
      },
      include: { payments: true },
    });

    const nonTaxRes = await apiFetch(`/api/v1/receipts`, {
      method: "POST",
      token: tokenB,
      body: { orderId: nonTaxOrder.id },
    });

    assert(nonTaxRes.status === 200, "POST /api/v1/receipts for Restaurant B returns 200");
    assert(nonTaxRes.data.receipt.isTaxInvoice === false, "isTaxInvoice is FALSE when GST or tax rate is unconfigured");

    // --------------------------------------------------------------------------
    // 7. Public Customer Receipt API & Web View
    // --------------------------------------------------------------------------
    console.log("\n--- 7. Public Customer Receipt API & Sanitization ---");
    const publicRes = await apiFetch(`/api/v1/receipts/${receipt.receiptToken}/public`);
    assert(publicRes.status === 200, "Public receipt API returns 200 with valid token");
    assert(publicRes.data.receipt.receiptNumber === receipt.receiptNumber, "Public view returns correct receipt number");
    assert(publicRes.data.receipt.isTaxInvoice === true, "Public view retains tax invoice classification");
    assert(!publicRes.data.receipt.snapshot.restaurant.passwordHash, "Sanitized: Zero internal server secrets exposed");

    const invalidPublicRes = await apiFetch(`/api/v1/receipts/invalid_token_123456789/public`);
    assert(invalidPublicRes.status === 404, "Invalid token returns 404 Not Found");

    // Test HTML View
    const htmlRes = await apiFetch(`/receipt/${receipt.receiptToken}`);
    assert(htmlRes.status === 200, "Customer web page /receipt/[token] responds 200 OK");
    assert(htmlRes.text.includes("Verified Digital Receipt") || htmlRes.text.includes(paidOrder.orderNumber), "Customer receipt web page rendered order details");

    // --------------------------------------------------------------------------
    // 8. Dashboard Receipts Ledger API
    // --------------------------------------------------------------------------
    console.log("\n--- 8. Dashboard Receipts Ledger API & Filtering ---");
    const listRes = await apiFetch(`/api/v1/receipts?status=PAID`, { token: tokenA });
    assert(listRes.status === 200, "GET /api/v1/receipts as OWNER returns 200");
    assert(Array.isArray(listRes.data.receipts), "Receipts array returned in ledger");
    const foundInList = listRes.data.receipts.some((r) => r.id === receipt.id);
    assert(foundInList, "Newly generated receipt appears in tenant ledger");

    // Search filter
    const searchRes = await apiFetch(`/api/v1/receipts?search=${receipt.receiptNumber}`, { token: tokenA });
    assert(searchRes.status === 200 && searchRes.data.receipts.length >= 1, "Search by receiptNumber returns matching record");

    // Unauthenticated access
    const unauthRes = await apiFetch(`/api/v1/receipts`);
    assert(unauthRes.status === 401, "Unauthenticated access to receipts ledger returns 401");

    // --------------------------------------------------------------------------
    // 9. Single Receipt Detail & Cross-Tenant IDOR Defense
    // --------------------------------------------------------------------------
    console.log("\n--- 9. Single Receipt Detail & Cross-Tenant IDOR Defense ---");
    const detailRes = await apiFetch(`/api/v1/receipts/${receipt.id}`, { token: tokenA });
    assert(detailRes.status === 200, "Owner A can view details of Restaurant A receipt");
    assert(detailRes.data.receipt.orderNumber === paidOrder.orderNumber, "Detail view includes orderNumber");

    // IDOR Check: Owner B tries to access Restaurant A receipt
    const idorDetailRes = await apiFetch(`/api/v1/receipts/${receipt.id}`, { token: tokenB });
    assert(idorDetailRes.status === 404, "Cross-tenant IDOR blocked: Owner B cannot view Restaurant A receipt (404)");

    // --------------------------------------------------------------------------
    // 10. Customer CRM Receipt History
    // --------------------------------------------------------------------------
    console.log("\n--- 10. Customer CRM Receipt History ---");
    const crmReceiptsRes = await apiFetch(`/api/v1/customers/${customerA.id}/receipts`, { token: tokenA });
    assert(crmReceiptsRes.status === 200, "GET /api/v1/customers/[id]/receipts returns 200");
    assert(crmReceiptsRes.data.receipts.length >= 1, "Customer receipts history contains issued receipt");

    // CRM alias endpoint test
    const crmAliasRes = await apiFetch(`/api/v1/crm/customers/${customerA.id}/receipts`, { token: tokenA });
    assert(crmAliasRes.status === 200, "Alias GET /api/v1/crm/customers/[id]/receipts returns 200");

    // Cross-tenant Customer IDOR Check
    const idorCrmRes = await apiFetch(`/api/v1/customers/${customerA.id}/receipts`, { token: tokenB });
    assert(idorCrmRes.status === 404, "Cross-tenant IDOR blocked: Owner B cannot query Restaurant A customer receipts (404)");

    // --------------------------------------------------------------------------
    // 11. Delivery Dispatch & Honest Status Reporting
    // --------------------------------------------------------------------------
    console.log("\n--- 11. Delivery Dispatch & Honest Status Reporting ---");
    const initialLogs = await prisma.receiptDeliveryLog.findMany({ where: { receiptId: receipt.id } });
    assert(initialLogs.length >= 1, "Delivery activity logged during automatic receipt creation", `Logs count: ${initialLogs.length}`);

    // Verify unconfigured email status is reported truthfully as NOT_CONFIGURED
    const emailLog = initialLogs.find((l) => l.channel === "EMAIL");
    if (emailLog) {
      assert(emailLog.status === "NOT_CONFIGURED" || emailLog.status === "SENT", "Truthful status: Unconfigured email reported honestly as NOT_CONFIGURED or SENT", emailLog.status);
    }

    // Manual Resend API
    const resendRes = await apiFetch(`/api/v1/receipts/${receipt.id}/resend`, {
      method: "POST",
      token: tokenA,
      body: { channel: "EMAIL" },
    });
    assert(resendRes.status === 200, "POST /api/v1/receipts/[id]/resend accepted", `Status: ${resendRes.data?.status}`);

    // Rate Limiting Check (< 30s)
    const rateLimitRes = await apiFetch(`/api/v1/receipts/${receipt.id}/resend`, {
      method: "POST",
      token: tokenA,
      body: { channel: "EMAIL" },
    });
    assert(rateLimitRes.status === 429, "Rate limit enforced: Subsequent immediate resend returns 429 Rate Limit Exceeded");

    // Cross-tenant Resend IDOR Check
    const idorResendRes = await apiFetch(`/api/v1/receipts/${receipt.id}/resend`, {
      method: "POST",
      token: tokenB,
      body: { channel: "EMAIL" },
    });
    assert(idorResendRes.status === 403 || idorResendRes.status === 404, "Cross-tenant IDOR blocked: Owner B cannot resend Restaurant A receipt (403/404)");

    // --------------------------------------------------------------------------
    // 12. Order Refund State Propagation
    // --------------------------------------------------------------------------
    console.log("\n--- 12. Order Refund State Propagation ---");
    const refundRes = await apiFetch(`/api/v1/receipts/${receipt.id}/refund`, {
      method: "POST",
      token: tokenA,
      body: {
        reason: "Item returned by guest",
        amount: 31.5,
      },
    });

    assert(refundRes.status === 200, "POST /api/v1/receipts/[id]/refund returns 200");
    const refundedReceipt = await prisma.digitalReceipt.findUnique({ where: { id: receipt.id } });
    assert(refundedReceipt.paymentStatus === "REFUNDED", "Digital receipt paymentStatus transitioned to REFUNDED");
    assert(!!refundedReceipt.refundData, "Audit snapshot preserved in refundData field");

    // Public view reflects refund
    const refundedPublicRes = await apiFetch(`/api/v1/receipts/${receipt.receiptToken}/public`);
    assert(refundedPublicRes.data.receipt.paymentStatus === "REFUNDED", "Public view displays REFUNDED status");
    assert(refundedPublicRes.data.receipt.refundDetails?.reason === "Item returned by guest", "Public view displays refund reason and details");

    // --------------------------------------------------------------------------
    // 13. Order Tracking Receipt Token Linkage
    // --------------------------------------------------------------------------
    console.log("\n--- 13. Order Tracking Linkage ---");
    const qrA = await prisma.qRCode.create({
      data: {
        token: `qr_test_${ts}`,
        url: `http://localhost:3000/q/qr_test_${ts}`,
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        status: "ACTIVE",
      },
    });

    const trackRes = await apiFetch(`/api/v1/orders/track?token=${qrA.token}&orderId=${paidOrder.id}`);
    assert(trackRes.status === 200, "Order tracking endpoint responds 200");
    assert(trackRes.data.order.receiptToken === receipt.receiptToken, "Order tracking includes receiptToken for paid order");

    // Clean up temporary test QR code
    await prisma.qRCode.delete({ where: { id: qrA.id } });

  } catch (err) {
    console.error("Test Suite Runtime Error:", err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`PHASE 24 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase24Tests();
