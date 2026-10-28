/**
 * Phase 16 — Production Readiness, Ordering/Status Latency Benchmarks & End-to-End Verification Suite
 */
const http = require("http");

const BASE_URL = "http://localhost:3000";

function request(method, path, body = null, sessionToken = null) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const url = new URL(path, BASE_URL);
    const headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["Cookie"] = `session=${sessionToken}`;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          const latencyMs = Math.round((performance.now() - start) * 100) / 100;
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw };
          }
          const setCookie = res.headers["set-cookie"] || [];
          let extractedToken = null;
          for (const c of setCookie) {
            const m = c.match(/session=([^;]+)/);
            if (m) extractedToken = m[1];
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: json,
            token: extractedToken,
            latencyMs,
          });
        });
      }
    );
    req.on("error", reject);
    if (body !== null) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}${detail ? " — " + detail : ""}`);
  }
}

async function main() {
  console.log("=============================================================");
  console.log("PHASE 16 — PRODUCTION READINESS & ORDERING LATENCY BENCHMARKS");
  console.log("=============================================================\n");

  const ts = Date.now();

  // 1. Health & Security Headers Check
  console.log("1. System Health, SQLite WAL Mode & Production Security Headers");
  const healthRes = await request("GET", "/api/v1/health");
  assert(healthRes.status === 200, "GET /api/v1/health returns 200", `Got ${healthRes.status}`);
  assert(
    healthRes.data?.status === "healthy" && healthRes.data?.database?.connected === true,
    "Health check confirms DB connected and healthy"
  );
  assert(
    healthRes.data?.uptimeSeconds === undefined && healthRes.data?.version === undefined,
    "Public health endpoint does not leak internal runtime metadata to unauthenticated callers"
  );
  assert(
    healthRes.headers["x-content-type-options"] === "nosniff" &&
      healthRes.headers["x-frame-options"] === "SAMEORIGIN" &&
      healthRes.headers["referrer-policy"] === "strict-origin-when-cross-origin",
    "Production security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy) are present"
  );
  assert(
    (healthRes.headers["cache-control"] || "").includes("no-store"),
    "Health endpoint sets Cache-Control: no-store"
  );

  // 2. End-to-End Tenant Onboarding, Menu, Table/QR & Inventory Setup
  console.log("\n2. End-to-End Restaurant Setup (Auth -> Onboarding -> Settings -> Menu -> Inventory -> Table/QR)");
  const regRes = await request("POST", "/api/v1/auth/register", {
    name: "Phase 16 Owner",
    email: `p16_owner_${ts}@example.com`,
    password: "Password123!",
  });
  const ownerToken = regRes.token;
  assert(regRes.status === 201 && Boolean(ownerToken), "Owner registered and authenticated");

  const onboardRes = await request(
    "POST",
    "/api/v1/onboarding/restaurant",
    {
      name: `Phase 16 Bistro ${ts}`,
      phone: "+15550116",
      email: `bistro_${ts}@example.com`,
      address: "1600 Grand Ave",
      city: "Chicago",
      state: "IL",
      country: "US",
      pincode: "60601",
    },
    ownerToken
  );
  assert(
    onboardRes.status === 201 || onboardRes.status === 200,
    "Restaurant onboarded via POST /api/v1/onboarding/restaurant",
    `Status ${onboardRes.status}: ${JSON.stringify(onboardRes.data)}`
  );

  const setPatch = await request(
    "PATCH",
    "/api/v1/settings",
    {
      taxPercentage: 10,
      accentColor: "#B91C1C",
      openingTime: "08:00",
      closingTime: "23:00",
      isOrderingEnabled: true,
      allowSpecialInstructions: true,
    },
    ownerToken
  );
  assert(setPatch.status === 200, "Settings configured (10% tax, #B91C1C accent, hours)");

  const catRes = await request(
    "POST",
    "/api/v1/menu/categories",
    { name: "Signature Dishes", description: "Chef specials" },
    ownerToken
  );
  const catId = catRes.data?.id || catRes.data?.category?.id;

  const itemRes = await request(
    "POST",
    "/api/v1/menu/items",
    {
      categoryId: catId,
      name: "Truffle Burger",
      description: "Aged cheddar and truffle aioli",
      price: 20,
      isAvailable: true,
      isVegetarian: false,
      isVegan: false,
    },
    ownerToken
  );
  const menuItemId = itemRes.data?.id || itemRes.data?.item?.id;
  assert(Boolean(menuItemId), "Menu item created ($20.00)");

  // Create inventory ingredient and recipe to test concurrent stock deduction during status transitions
  const invRes = await request(
    "POST",
    "/api/v1/inventory",
    {
      name: `Brioche Bun ${ts}`,
      sku: `BUN-${ts}`,
      category: "Bakery",
      unit: "PIECE",
      openingStock: 50,
      lowStockThreshold: 10,
      costPerUnit: 1.25,
    },
    ownerToken
  );
  const invItemId = invRes.data?.item?.id;
  assert(
    invRes.status === 201 && Boolean(invItemId),
    "Inventory ingredient created (50 PIECE)",
    `Status ${invRes.status}: ${JSON.stringify(invRes.data)}`
  );

  const recipeRes = await request(
    "POST",
    "/api/v1/inventory/recipes",
    {
      menuItemId,
      inventoryItemId: invItemId,
      quantity: 2,
      unit: "PIECE",
    },
    ownerToken
  );
  assert(
    recipeRes.status === 201,
    "Recipe mapped (2 PIECE Brioche Bun per Truffle Burger)",
    `Status ${recipeRes.status}: ${JSON.stringify(recipeRes.data)}`
  );

  const tableRes = await request(
    "POST",
    "/api/v1/tables",
    { name: `T16-${ts}`, number: "16", capacity: 4 },
    ownerToken
  );
  const tableId = tableRes.data?.id || tableRes.data?.table?.id;
  const qrRes = await request("POST", `/api/v1/tables/${tableId}/qr`, {}, ownerToken);
  const qrToken = qrRes.data?.token || qrRes.data?.qrCode?.token;
  assert(Boolean(qrToken), "Table and active QR token generated");

  // 3. Warm-up & Benchmark Ordering + Single-Round-Trip Payment Initialization
  console.log("\n3. Ordering & Single-Round-Trip Payment Creation Latency Benchmark");
  // Warm up route compilation once
  const warmupOrder = await request("POST", "/api/v1/orders", {
    token: qrToken,
    customerName: "Warmup Guest",
    paymentMethod: "CASH",
    items: [{ menuItemId, quantity: 1 }],
  });

  // Benchmark 3 consecutive orders
  const orderLatencies = [];
  let benchmarkedOrder = null;
  for (let i = 1; i <= 3; i++) {
    const oRes = await request("POST", "/api/v1/orders", {
      token: qrToken,
      customerName: `Speed Guest ${i}`,
      customerPhone: `+1555999000${i}`,
      paymentMethod: "CASH",
      items: [{ menuItemId, quantity: 2, specialInstructions: "Medium well" }],
      specialInstructions: "Fast table service",
    });
    orderLatencies.push(oRes.latencyMs);
    if (i === 1) benchmarkedOrder = oRes;
  }

  const avgOrderMs =
    Math.round((orderLatencies.reduce((a, b) => a + b, 0) / orderLatencies.length) * 100) / 100;
  console.log(
    `  ⏱️  Order + Payment + Notification latencies: [${orderLatencies.join("ms, ")}ms] (avg: ${avgOrderMs}ms)`
  );

  assert(benchmarkedOrder.status === 201, "POST /api/v1/orders returns 201 Created");
  assert(
    benchmarkedOrder.data?.payment?.provider === "CASH" &&
      benchmarkedOrder.data?.payment?.status === "PENDING",
    "POST /api/v1/orders initializes CASH payment inline in 1 round-trip"
  );
  assert(
    Array.isArray(benchmarkedOrder.data?.order?.items) &&
      benchmarkedOrder.data.order.items.length === 1 &&
      Boolean(benchmarkedOrder.data?.order?.createdAt),
    "POST /api/v1/orders returns full trackedOrder payload (items + createdAt) so UI needs 0 extra tracking fetches"
  );
  assert(
    benchmarkedOrder.data?.order?.subtotal === 40 &&
      benchmarkedOrder.data?.order?.tax === 4 &&
      benchmarkedOrder.data?.order?.appliedTaxPercentage === 10 &&
      benchmarkedOrder.data?.order?.total === 44,
    "Server-side pricing and tax snapshot (10% -> $4.00 tax, $44.00 total) are accurate"
  );
  assert(
    avgOrderMs < 1500,
    `Average order creation + payment + notification latency is fast (< 1500ms, measured ${avgOrderMs}ms)`
  );

  // 4. Benchmark Status Transition Pipeline (PENDING -> ACCEPTED -> PREPARING -> READY -> COMPLETED)
  console.log("\n4. Order Status Change Latency & Single-Request State Merge Benchmark");
  const targetOrderId = benchmarkedOrder.data.order.id;

  // Warm up admin GET & PATCH route compilation once on warmupOrder
  const warmupOrdersRes = await request("GET", "/api/v1/orders/admin?status=ACTIVE", null, ownerToken);
  if (warmupOrder.data?.order?.id) {
    await request(
      "PATCH",
      `/api/v1/orders/admin/${warmupOrder.data.order.id}`,
      { status: "REJECTED" },
      ownerToken
    );
  }
  assert(
    warmupOrdersRes.status === 200 &&
      (warmupOrdersRes.headers["cache-control"] || "").includes("no-store"),
    "GET /api/v1/orders/admin sets Cache-Control: no-store"
  );

  const statuses = ["ACCEPTED", "PREPARING", "READY", "COMPLETED"];
  const statusLatencies = [];
  let lastPatchRes = null;

  for (const nextStatus of statuses) {
    const pRes = await request(
      "PATCH",
      `/api/v1/orders/admin/${targetOrderId}`,
      { status: nextStatus },
      ownerToken
    );
    statusLatencies.push({ status: nextStatus, ms: pRes.latencyMs });
    lastPatchRes = pRes;
    assert(
      pRes.status === 200 && pRes.data?.order?.status === nextStatus,
      `Transition to ${nextStatus} succeeded in ${pRes.latencyMs}ms`,
      `Status ${pRes.status}: ${JSON.stringify(pRes.data)}`
    );
  }

  const avgStatusMs =
    Math.round(
      (statusLatencies.reduce((sum, s) => sum + s.ms, 0) / statusLatencies.length) * 100
    ) / 100;
  console.log(
    `  ⏱️  Status transition latencies: [${statusLatencies
      .map((s) => `${s.status}: ${s.ms}ms`)
      .join(", ")}] (avg: ${avgStatusMs}ms)`
  );

  assert(
    Array.isArray(lastPatchRes?.data?.order?.items) &&
      lastPatchRes.data.order.items.length === 1,
    "PATCH /api/v1/orders/admin/[id] returns full order items for instant client state merge without second GET"
  );
  assert(
    avgStatusMs < 1500,
    `Average status transition latency is fast (< 1500ms, measured ${avgStatusMs}ms)`
  );

  // 5. Verify Side Effects (Inventory Deduction, Notifications, Payment Settlement & Analytics)
  console.log("\n5. Cross-Module Integrity (Inventory Deduction, Notifications, Payment & Analytics)");
  const invCheck = await request("GET", "/api/v1/inventory", null, ownerToken);
  const updatedBun = (invCheck.data?.items || []).find((i) => i.id === invItemId);
  assert(
    Number(updatedBun?.currentStock) === 46,
    "Inventory automatically deducted 4 PIECE (2 burgers x 2 buns) during ACCEPTED transition (50 -> 46) and did NOT double-deduct on PREPARING",
    `Got stock ${updatedBun?.currentStock}`
  );

  const settleRes = await request(
    "PATCH",
    `/api/v1/orders/admin/${targetOrderId}`,
    { paymentStatus: "PAID" },
    ownerToken
  );
  assert(
    settleRes.status === 200 && settleRes.data?.order?.paymentStatus === "PAID",
    `Cash payment settled to PAID in ${settleRes.latencyMs}ms`
  );

  const notifRes = await request("GET", "/api/v1/notifications?limit=20", null, ownerToken);
  const notifList = notifRes.data?.notifications || notifRes.data?.items || [];
  assert(
    notifRes.status === 200 && notifList.length >= 3,
    `In-app notifications dispatched for order creation and payment (${notifList.length} notifications)`
  );

  const analyticsRes = await request("GET", "/api/v1/analytics?period=7d", null, ownerToken);
  const grossSales = Number(
    analyticsRes.data?.data?.kpis?.grossSales ??
      analyticsRes.data?.data?.kpis?.paidRevenue ??
      0
  );
  assert(
    analyticsRes.status === 200 && grossSales >= 44,
    `Phase 13 Analytics recognizes completed & paid order revenue ($${grossSales.toFixed(2)})`
  );

  console.log("\n=============================================================");
  console.log(`PHASE 16 SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("=============================================================");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
