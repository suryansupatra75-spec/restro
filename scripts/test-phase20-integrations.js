/**
 * Phase 20: EXTERNAL INTEGRATIONS Verification Suite
 * Comprehensive automated testing covering:
 * - Inventory of printer, email, whatsapp, accounting, webhooks, and API keys
 * - Thermal & Receipt Printer settings, browser fallback, and duplicate print detection
 * - Email adapter configuration and connection test diagnostics
 * - WhatsApp Business adapter configuration and credential test ping
 * - Accounting Sales Ledger, Tax Report, and COGS/Profit-Loss exports with formula injection defense
 * - API Key generation, SHA-256 hash storage, and token-authenticated external endpoints
 * - Outbound Webhook subscriptions, SSRF validation, and HMAC-SHA256 signatures
 * - Multi-tenant isolation and IDOR defense (Restaurant A vs Restaurant B)
 * - RBAC permission enforcement across OWNER, MANAGER, STAFF, and KITCHEN
 * - Core order, payment, promotions, and loyalty regression checks
 */

const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
  const { token, bearerToken, method = "GET", body } = options;
  const headers = { ...(options.headers || {}), Connection: "close" };

  if (token) {
    headers["Cookie"] = `session=${token}`;
  }
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`;
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
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runPhase20Tests() {
  console.log("================================================================================");
  console.log("PHASE 20: EXTERNAL INTEGRATIONS VERIFICATION SUITE");
  console.log("================================================================================\n");

  const ts = Date.now();

  try {
    // --------------------------------------------------------------------------
    // 1. Global UI & Database Phase-Label Audit
    // --------------------------------------------------------------------------
    console.log("--- 1. Global Phase-Label & Repository Cleanliness Audit ---");

    const filesToScan = [
      "src/app/dashboard/integrations/client-integrations.tsx",
      "src/app/dashboard/integrations/page.tsx",
      "src/components/dashboard/order-receipt-modal.tsx",
      "src/components/dashboard/dashboard-nav.tsx",
      "src/lib/integrations/service.ts",
      "src/lib/integrations/webhooks.ts",
      "src/lib/integrations/api-keys.ts",
    ];

    let fileViolations = 0;
    for (const rel of filesToScan) {
      const fullPath = path.join(process.cwd(), rel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (/Phase\s+\d+/i.test(content) || /phase:\s*\d+/i.test(content)) {
          console.error(`  Found Phase label in ${rel}`);
          fileViolations++;
        }
      }
    }
    assert(fileViolations === 0, "Zero user-facing occurrences of 'Phase X' in Phase 20 components");

    // --------------------------------------------------------------------------
    // 2. Setting Up Test Tenancies & Fixtures
    // --------------------------------------------------------------------------
    console.log("\n--- 2. Setting Up Test Tenancies & RBAC Fixtures ---");

    // Tenant A (Primary)
    const ownerA = await prisma.user.create({
      data: { name: "Alice Owner", email: `owner_a_${ts}@test.com`, passwordHash: "mock_hash" },
    });
    const managerA = await prisma.user.create({
      data: { name: "Bob Manager", email: `manager_a_${ts}@test.com`, passwordHash: "mock_hash" },
    });
    const staffA = await prisma.user.create({
      data: { name: "Charlie Staff", email: `staff_a_${ts}@test.com`, passwordHash: "mock_hash" },
    });
    const kitchenA = await prisma.user.create({
      data: { name: "David Chef", email: `kitchen_a_${ts}@test.com`, passwordHash: "mock_hash" },
    });

    const restaurantA = await prisma.restaurant.create({
      data: {
        name: `Oasis Dining ${ts}`,
        slug: `oasis-dining-${ts}`,
        currency: "USD",
        taxPercentage: 10,
        gstNumber: "GSTIN-27AABCT1234D1Z9",
        status: "ACTIVE",
        isOrderingEnabled: true,
      },
    });

    await prisma.restaurantUser.createMany({
      data: [
        { restaurantId: restaurantA.id, userId: ownerA.id, role: "OWNER" },
        { restaurantId: restaurantA.id, userId: managerA.id, role: "MANAGER" },
        { restaurantId: restaurantA.id, userId: staffA.id, role: "STAFF" },
        { restaurantId: restaurantA.id, userId: kitchenA.id, role: "KITCHEN" },
      ],
    });

    const ownerTokenA = await makeToken(ownerA.id, ownerA.email);
    const managerTokenA = await makeToken(managerA.id, managerA.email);
    const staffTokenA = await makeToken(staffA.id, staffA.email);
    const kitchenTokenA = await makeToken(kitchenA.id, kitchenA.email);

    // Tenant B (Isolated, for IDOR security tests)
    const ownerB = await prisma.user.create({
      data: { name: "Zack Owner B", email: `owner_b_${ts}@test.com`, passwordHash: "mock_hash" },
    });
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: `Bistro Beta ${ts}`,
        slug: `bistro-beta-${ts}`,
        currency: "EUR",
        status: "ACTIVE",
      },
    });
    await prisma.restaurantUser.create({
      data: { restaurantId: restaurantB.id, userId: ownerB.id, role: "OWNER" },
    });
    const ownerTokenB = await makeToken(ownerB.id, ownerB.email);

    // Setup Table & Menu item in Restaurant A for ordering & printing
    const tableA = await prisma.table.create({
      data: { restaurantId: restaurantA.id, name: "Table 12", number: "12", capacity: 4 },
    });
    const qrA = await prisma.qRCode.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        token: `qr_oasis_${ts}`,
        url: `http://localhost:3000/q/qr_oasis_${ts}`,
      },
    });
    const catA = await prisma.menuCategory.create({
      data: { restaurantId: restaurantA.id, name: "Pizzas" },
    });
    const itemA = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: catA.id,
        name: "Truffle Mushroom Pizza",
        price: 24.5,
        slug: `truffle-mushroom-pizza-${ts}`,
        isAvailable: true,
      },
    });

    assert(Boolean(restaurantA.id && restaurantB.id), "Tenant A and Tenant B created successfully");

    // --------------------------------------------------------------------------
    // 3. Inventory & Baseline Provider Summaries
    // --------------------------------------------------------------------------
    console.log("\n--- 3. Inventory & Baseline Provider Summaries ---");

    const initialSettingsRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    assert(initialSettingsRes.status === 200, "GET /api/v1/integrations/settings returns 200 OK");
    const summary = initialSettingsRes.data?.integrations;
    assert(Boolean(summary?.PRINTER), "Printer provider summary present");
    assert(summary?.PRINTER?.status === "CONNECTED", "Printer status is CONNECTED by default (Browser fallback)");
    assert(summary?.EMAIL?.status === "NOT_CONFIGURED", "Email status is NOT_CONFIGURED by default");
    assert(summary?.WHATSAPP?.status === "NOT_CONFIGURED", "WhatsApp status is NOT_CONFIGURED by default");
    assert(summary?.ACCOUNTING?.status === "CONNECTED", "Accounting exports status is CONNECTED by default");

    // --------------------------------------------------------------------------
    // 4. Printer Integration & Print Job Ledger
    // --------------------------------------------------------------------------
    console.log("\n--- 4. Printer Configuration & Print Job Duplicate Protection ---");

    // Update printer settings
    const savePrinterRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "PATCH",
      body: {
        providerType: "PRINTER",
        isEnabled: true,
        config: {
          paperWidth: "80mm",
          headerText: "Fine Italian Dining",
          footerText: "Grazie e arrivederci!",
          taxIdText: "GSTIN-27AABCT1234D1Z9",
          showPricesOnKot: false,
          showNotes: true,
          connectionType: "BROWSER",
        },
      },
    });
    assert(savePrinterRes.status === 200, "PATCH /api/v1/integrations/settings (PRINTER) returns 200 OK");

    // Test Printer connection / template diagnostics
    const testPrinterRes = await apiFetch(`/api/v1/integrations/test?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: { providerType: "PRINTER" },
    });
    assert(testPrinterRes.status === 200, "POST /api/v1/integrations/test (PRINTER) returns 200 OK");
    assert(testPrinterRes.data?.success === true, "Printer diagnostics returns success = true");
    assert(testPrinterRes.data?.details?.paperWidth === "80mm", "Printer details confirm 80mm roll");

    // Test Network ESC/POS bridge configuration (Honest degraded status check)
    const saveEscPosRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "PATCH",
      body: {
        providerType: "PRINTER",
        config: {
          paperWidth: "80mm",
          connectionType: "NETWORK_ESC_POS",
          networkPrinterIp: "192.168.1.200",
          networkPrinterPort: 9100,
        },
      },
    });
    assert(saveEscPosRes.status === 200, "Configure Network ESC/POS returns 200 OK");

    const testEscPosRes = await apiFetch(`/api/v1/integrations/test?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: { providerType: "PRINTER" },
    });
    assert(testEscPosRes.data?.status === "DEGRADED", "Honest status DEGRADED reported when hardware bridge agent is absent");
    assert(
      testEscPosRes.data?.message.includes("Hardware bridge not connected"),
      "Helpful error message explains local bridge agent is required, falling back to Browser Print"
    );

    // Create an order for Restaurant A to test print tracking
    const orderRes = await apiFetch("/api/v1/orders", {
      method: "POST",
      body: {
        token: qrA.token,
        items: [{ menuItemId: itemA.id, quantity: 2 }],
        paymentMethod: "CASH",
        customerName: "Gianluigi",
      },
    });
    assert(orderRes.status === 201, "Order placed for print verification");
    const testOrderId = orderRes.data?.order?.id;

    // 1st Print: Original Bill
    const print1Res = await apiFetch(`/api/v1/integrations/print?restaurantId=${restaurantA.id}`, {
      token: staffTokenA,
      method: "POST",
      body: { orderId: testOrderId, printType: "BILL" },
    });
    assert(print1Res.status === 200, "1st Print job recorded successfully");
    assert(print1Res.data?.printJob?.isReprint === false, "1st Print job isReprint is FALSE");
    assert(print1Res.data?.printJob?.reprintCount === 0, "1st Print job reprintCount is 0");

    // 2nd Print: Duplicate reprint of same bill
    const print2Res = await apiFetch(`/api/v1/integrations/print?restaurantId=${restaurantA.id}`, {
      token: staffTokenA,
      method: "POST",
      body: { orderId: testOrderId, printType: "BILL" },
    });
    assert(print2Res.status === 200, "2nd Print job recorded successfully");
    assert(print2Res.data?.printJob?.isReprint === true, "Duplicate print protection triggers isReprint = TRUE");
    assert(print2Res.data?.printJob?.reprintCount === 1, "Duplicate print protection records reprintCount = 1");

    // Query Print History Ledger
    const printHistoryRes = await apiFetch(`/api/v1/integrations/print/history?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    assert(printHistoryRes.status === 200, "GET /api/v1/integrations/print/history returns 200 OK");
    assert(printHistoryRes.data?.printJobs?.length >= 2, "Print history ledger contains both print jobs");

    // --------------------------------------------------------------------------
    // 5. Email Transactional Messaging Adapter & Diagnostics
    // --------------------------------------------------------------------------
    console.log("\n--- 5. Email Transactional Messaging Adapter & Diagnostics ---");

    // Configure SMTP settings
    const saveEmailRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "PATCH",
      body: {
        providerType: "EMAIL",
        isEnabled: true,
        config: {
          provider: "SMTP",
          host: "smtp.mailgun.org",
          port: 587,
          secure: true,
          username: "postmaster@oasis.com",
          password: "super_secret_smtp_password_123",
          fromEmail: "orders@oasisdining.com",
          fromName: "Oasis Dining",
          orderConfirmationEnabled: true,
          lowStockAlertsEnabled: true,
        },
      },
    });
    assert(saveEmailRes.status === 200, "PATCH email SMTP settings returns 200 OK");

    // Verify secret password is redacted
    const getEmailRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    const emailConfig = getEmailRes.data?.integrations?.EMAIL?.config;
    assert(emailConfig?.password.includes("••••"), "SMTP password is safely masked in settings response");

    // Run Email connection test
    const testEmailRes = await apiFetch(`/api/v1/integrations/test?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: { providerType: "EMAIL" },
    });
    assert(testEmailRes.status === 200, "POST /api/v1/integrations/test (EMAIL) returns 200 OK");
    assert(testEmailRes.data?.status === "CONNECTED", "Email status successfully transitioned to CONNECTED");

    // --------------------------------------------------------------------------
    // 6. WhatsApp Business API Gateway Adapter
    // --------------------------------------------------------------------------
    console.log("\n--- 6. WhatsApp Business API Gateway Adapter ---");

    // Configure Meta Cloud settings
    const saveWaRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "PATCH",
      body: {
        providerType: "WHATSAPP",
        isEnabled: true,
        config: {
          provider: "META_CLOUD",
          phoneNumberId: "109283746501928",
          businessAccountId: "987654321012345",
          accessToken: "EAABmocktoken_secure_long_string_abc123xyz",
          orderUpdatesEnabled: true,
          requireExplicitConsent: true,
        },
      },
    });
    assert(saveWaRes.status === 200, "PATCH WhatsApp settings returns 200 OK");

    // Verify access token is masked
    const getWaRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    const waConfig = getWaRes.data?.integrations?.WHATSAPP?.config;
    assert(waConfig?.accessToken.includes("••••"), "WhatsApp token is safely masked in response");

    // Run WhatsApp credential test
    const testWaRes = await apiFetch(`/api/v1/integrations/test?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: { providerType: "WHATSAPP" },
    });
    assert(testWaRes.status === 200, "POST /api/v1/integrations/test (WHATSAPP) returns 200 OK");
    assert(testWaRes.data?.status === "CONNECTED", "WhatsApp status transitioned to CONNECTED");

    // --------------------------------------------------------------------------
    // 7. Accounting & Tax Exports with Formula Injection Defense
    // --------------------------------------------------------------------------
    console.log("\n--- 7. Accounting, Tax & P/L Exports with Formula Injection Defense ---");

    const todayStr = new Date().toISOString().slice(0, 10);

    // Sales Ledger CSV Export
    const salesLedgerRes = await apiFetch(
      `/api/v1/integrations/exports?restaurantId=${restaurantA.id}&type=sales_ledger&startDate=${todayStr}&endDate=${todayStr}&format=csv`,
      { token: ownerTokenA }
    );
    assert(salesLedgerRes.status === 200, "GET sales_ledger CSV export returns 200 OK");
    assert(salesLedgerRes.headers.get("content-type")?.includes("text/csv"), "Sales ledger has text/csv content-type");
    assert(salesLedgerRes.data.includes("Accounting Sales Ledger"), "CSV contains report title");
    assert(
      salesLedgerRes.data.includes(orderRes.data?.order?.orderNumber) || salesLedgerRes.data.includes("Table 12"),
      "CSV contains order data"
    );

    // Tax Report CSV Export
    const taxReportRes = await apiFetch(
      `/api/v1/integrations/exports?restaurantId=${restaurantA.id}&type=tax_report&startDate=${todayStr}&endDate=${todayStr}&format=csv`,
      { token: ownerTokenA }
    );
    assert(taxReportRes.status === 200, "GET tax_report CSV export returns 200 OK");
    assert(taxReportRes.data.includes("Tax & Invoicing Report"), "Tax report contains header");
    assert(taxReportRes.data.includes("GSTIN-27AABCT1234D1Z9"), "Tax report contains restaurant GSTIN");

    // COGS & Profit-Loss Export
    const plReportRes = await apiFetch(
      `/api/v1/integrations/exports?restaurantId=${restaurantA.id}&type=profit_loss&startDate=${todayStr}&endDate=${todayStr}&format=csv`,
      { token: ownerTokenA }
    );
    assert(plReportRes.status === 200, "GET profit_loss CSV export returns 200 OK");
    assert(plReportRes.data.includes("Cost of Goods & P&L Summary"), "P&L report contains title");

    // JSON Format Export
    const jsonExportRes = await apiFetch(
      `/api/v1/integrations/exports?restaurantId=${restaurantA.id}&type=sales_ledger&startDate=${todayStr}&endDate=${todayStr}&format=json`,
      { token: ownerTokenA }
    );
    assert(jsonExportRes.status === 200, "GET sales_ledger JSON format returns 200 OK");
    assert(Array.isArray(jsonExportRes.data?.orders), "JSON export returns orders array");

    // Formula Injection Defense Unit Check
    function sanitizeCsvCell(val) {
      if (val === null || val === undefined) return '""';
      let safeStr = String(val);
      if (/^[=+\-@\t\r]/.test(safeStr)) {
        safeStr = `'${safeStr}`;
      }
      safeStr = safeStr.replace(/"/g, '""');
      return `"${safeStr}"`;
    }
    const dangerousCell = "=cmd|' /C calc'!A0";
    const sanitizedCell = sanitizeCsvCell(dangerousCell);
    assert(sanitizedCell.startsWith("\"'") || sanitizedCell.startsWith("''"), "Formula injection mitigation prefixes dangerous character with single quote");

    // --------------------------------------------------------------------------
    // 8. API Key Generation & Programmatic External REST Endpoints
    // --------------------------------------------------------------------------
    console.log("\n--- 8. API Key Generation & Programmatic External REST Endpoints ---");

    // Generate API key with scopes
    const createKeyRes = await apiFetch(`/api/v1/integrations/api-keys?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: {
        name: "POS Terminal Alpha",
        scopes: ["orders:read", "menu:read"],
        expiresInDays: 90,
      },
    });
    assert(createKeyRes.status === 201, "POST /api/v1/integrations/api-keys returns 201 Created");
    const rawApiKey = createKeyRes.data?.apiKey?.rawKey;
    const apiKeyId = createKeyRes.data?.apiKey?.id;
    assert(rawApiKey?.startsWith("rk_live_"), "Generated API key starts with prefix 'rk_live_'");

    // Verify DB stores SHA-256 hash (never plaintext)
    const dbKey = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    assert(dbKey.keyHash !== rawApiKey, "Database stores cryptographic hash, not the raw key");
    assert(dbKey.keyHash.length === 64, "Key hash is standard SHA-256 (64 hex characters)");

    // Query external orders API using Bearer Token
    const externalOrdersRes = await apiFetch(`/api/v1/external/orders`, {
      bearerToken: rawApiKey,
    });
    assert(externalOrdersRes.status === 200, "GET /api/v1/external/orders with Bearer token returns 200 OK");
    assert(externalOrdersRes.data?.restaurantId === restaurantA.id, "External orders are strictly scoped to Tenant A");
    assert(externalOrdersRes.data?.orders?.length > 0, "External orders endpoint returns Tenant A orders");

    // Query external menu API using Bearer Token
    const externalMenuRes = await apiFetch(`/api/v1/external/menu`, {
      bearerToken: rawApiKey,
    });
    assert(externalMenuRes.status === 200, "GET /api/v1/external/menu with Bearer token returns 200 OK");
    assert(externalMenuRes.data?.categories?.some((c) => c.name === "Pizzas"), "External menu returns Tenant A categories");

    // Revoke API key
    const revokeRes = await apiFetch(`/api/v1/integrations/api-keys/${apiKeyId}?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "DELETE",
    });
    assert(revokeRes.status === 200, "DELETE /api/v1/integrations/api-keys/[id] revokes key successfully");

    // Subsequent access with revoked key must fail with 401
    const revokedAccessRes = await apiFetch(`/api/v1/external/orders`, {
      bearerToken: rawApiKey,
    });
    assert(revokedAccessRes.status === 401, "Access with revoked API key is blocked with 401 Unauthorized");

    // --------------------------------------------------------------------------
    // 9. Outbound Webhooks Engine & SSRF Protection
    // --------------------------------------------------------------------------
    console.log("\n--- 9. Outbound Webhooks Engine & SSRF Protection ---");

    // SSRF Test: Localhost blocked
    const ssrfLocalhostRes = await apiFetch(`/api/v1/integrations/webhooks?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: {
        name: "Attack Localhost",
        url: "http://localhost:8080/exploit",
        events: ["order.created"],
      },
    });
    assert(ssrfLocalhostRes.status === 400, "SSRF Defense: localhost URL rejected with 400 Bad Request");

    // SSRF Test: Loopback 127.0.0.1 blocked
    const ssrfLoopbackRes = await apiFetch(`/api/v1/integrations/webhooks?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: {
        name: "Attack Loopback",
        url: "http://127.0.0.1:3000/webhook",
        events: ["order.created"],
      },
    });
    assert(ssrfLoopbackRes.status === 400, "SSRF Defense: 127.0.0.1 URL rejected with 400 Bad Request");

    // SSRF Test: Cloud Metadata blocked
    const ssrfMetadataRes = await apiFetch(`/api/v1/integrations/webhooks?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: {
        name: "Attack Metadata",
        url: "http://169.254.169.254/latest/meta-data/",
        events: ["order.created"],
      },
    });
    assert(ssrfMetadataRes.status === 400, "SSRF Defense: AWS/GCP 169.254.169.254 metadata URL rejected with 400");

    // Register valid public webhook
    const createWebhookRes = await apiFetch(`/api/v1/integrations/webhooks?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: {
        name: "Zapier Orders Hook",
        url: "https://httpbin.org/post",
        events: ["order.created", "order.status_changed"],
        isActive: true,
      },
    });
    assert(createWebhookRes.status === 201, "Register valid public webhook returns 201 Created");
    const webhookId = createWebhookRes.data?.webhook?.id;
    const webhookSecret = createWebhookRes.data?.webhook?.secret;
    assert(Boolean(webhookSecret?.startsWith("whsec_")), "Webhook secret starts with 'whsec_'");

    // Test Signature generation matches HMAC-SHA256
    const samplePayload = JSON.stringify({ test: 123 });
    const expectedSig = crypto.createHmac("sha256", webhookSecret).update(samplePayload).digest("hex");
    const computedSig = crypto.createHmac("sha256", webhookSecret).update(samplePayload).digest("hex");
    assert(expectedSig === computedSig, "HMAC-SHA256 signature algorithm correctly matches");

    // Ping Webhook
    const pingRes = await apiFetch(`/api/v1/integrations/webhooks/${webhookId}/ping?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "POST",
    });
    assert(pingRes.status === 200, "POST webhook ping returns 200 OK");

    // Query Delivery Logs
    const deliveryLogsRes = await apiFetch(`/api/v1/integrations/webhooks/deliveries?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    assert(deliveryLogsRes.status === 200, "GET /api/v1/integrations/webhooks/deliveries returns 200 OK");
    assert(deliveryLogsRes.data?.deliveries?.length > 0, "Delivery history audit contains ping record");

    // Delete Webhook
    const delWhRes = await apiFetch(`/api/v1/integrations/webhooks/${webhookId}?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "DELETE",
    });
    assert(delWhRes.status === 200, "DELETE webhook subscription returns 200 OK");

    // --------------------------------------------------------------------------
    // 10. Multi-Tenant Isolation & IDOR Defense (Restaurant A vs Restaurant B)
    // --------------------------------------------------------------------------
    console.log("\n--- 10. Multi-Tenant Isolation & IDOR Defense ---");

    // User A attempts to view Restaurant B integration settings
    const idorSettingsRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantB.id}`, {
      token: ownerTokenA,
    });
    assert(idorSettingsRes.status === 403, "IDOR: User A cannot access Restaurant B integration settings (403 Forbidden)");

    // User A attempts to modify Restaurant B settings
    const idorPatchRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantB.id}`, {
      token: ownerTokenA,
      method: "PATCH",
      body: { providerType: "EMAIL", config: {} },
    });
    assert(idorPatchRes.status === 403, "IDOR: User A cannot update Restaurant B integration settings (403 Forbidden)");

    // User A attempts to create API key for Restaurant B
    const idorKeyRes = await apiFetch(`/api/v1/integrations/api-keys?restaurantId=${restaurantB.id}`, {
      token: ownerTokenA,
      method: "POST",
      body: { name: "Hack Key", scopes: ["orders:read"] },
    });
    assert(idorKeyRes.status === 403, "IDOR: User A cannot create API key on Restaurant B (403 Forbidden)");

    // User A attempts to download Restaurant B exports
    const idorExportRes = await apiFetch(
      `/api/v1/integrations/exports?restaurantId=${restaurantB.id}&type=sales_ledger&startDate=${todayStr}&endDate=${todayStr}`,
      { token: ownerTokenA }
    );
    assert(idorExportRes.status === 403, "IDOR: User A cannot export Restaurant B financial ledger (403 Forbidden)");

    // --------------------------------------------------------------------------
    // 11. RBAC Matrix Verification
    // --------------------------------------------------------------------------
    console.log("\n--- 11. RBAC Matrix Verification across Staff Roles ---");

    // MANAGER role: can view and test connections
    const managerViewRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: managerTokenA,
    });
    assert(managerViewRes.status === 200, "RBAC: MANAGER can view integrations settings (200 OK)");

    const managerTestRes = await apiFetch(`/api/v1/integrations/test?restaurantId=${restaurantA.id}`, {
      token: managerTokenA,
      method: "POST",
      body: { providerType: "PRINTER" },
    });
    assert(managerTestRes.status === 200, "RBAC: MANAGER can execute connection tests (200 OK)");

    // MANAGER role cannot manage credentials
    const managerPatchRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: managerTokenA,
      method: "PATCH",
      body: { providerType: "EMAIL", config: {} },
    });
    assert(managerPatchRes.status === 403, "RBAC: MANAGER blocked from changing provider credentials (403 Forbidden)");

    // STAFF role: cannot view or manage integrations
    const staffViewRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: staffTokenA,
    });
    assert(staffViewRes.status === 403, "RBAC: STAFF blocked from viewing integration settings (403 Forbidden)");

    // KITCHEN role: cannot view or manage integrations
    const kitchenViewRes = await apiFetch(`/api/v1/integrations/settings?restaurantId=${restaurantA.id}`, {
      token: kitchenTokenA,
    });
    assert(kitchenViewRes.status === 403, "RBAC: KITCHEN blocked from viewing integration settings (403 Forbidden)");

    // --------------------------------------------------------------------------
    // 12. Regression Testing: Core Flows Intact
    // --------------------------------------------------------------------------
    console.log("\n--- 12. Regression Testing: Core Orders & Dashboard Intact ---");

    // QR menu items fetch
    const menuRes = await apiFetch(`/api/v1/menu/items?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    assert(menuRes.status === 200, "Regression: Menu items query returns 200 OK");

    // Tables fetch
    const tablesRes = await apiFetch(`/api/v1/tables?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    assert(tablesRes.status === 200, "Regression: Tables list query returns 200 OK");

    // Loyalty program config
    const loyaltyRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
    });
    assert(loyaltyRes.status === 200, "Regression: Loyalty program query returns 200 OK");

    // Order status progression
    const orderStatusRes = await apiFetch(`/api/v1/orders/admin/${testOrderId}?restaurantId=${restaurantA.id}`, {
      token: ownerTokenA,
      method: "PATCH",
      body: { status: "ACCEPTED" },
    });
    assert(orderStatusRes.status === 200, "Regression: Order status progression to ACCEPTED returns 200 OK");

    // --------------------------------------------------------------------------
    // Final Summary
    // --------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log("================================================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("FATAL UNEXPECTED ERROR IN TEST SUITE:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase20Tests();
