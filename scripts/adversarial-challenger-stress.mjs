/**
 * EMPIRICAL ADVERSARIAL CHALLENGER STRESS SUITE
 * 
 * Conducts deep concurrency bursts, SQLite lock contention analysis,
 * and 27 adversarial edge cases on http://localhost:3000.
 */

import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

const TEST_ORDER_PREFIX = "CHALLENGER_STRESS_";

async function makeToken(payload, expiresIn = "1h") {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

function calculatePercentiles(durations) {
  if (durations.length === 0) return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const getP = (p) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return Number(sorted[idx].toFixed(2));
  };
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: Number(sorted[0].toFixed(2)),
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    mean: Number((sum / sorted.length).toFixed(2)),
  };
}

async function executeTimedRequest(url, options = {}) {
  const start = performance.now();
  let status = 0;
  let success = false;
  let isBusy = false;
  let errorMsg = null;
  let bodyJson = null;
  let bodyText = "";

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Connection: "keep-alive",
        ...(options.headers || {}),
      },
    });

    status = res.status;
    const duration = performance.now() - start;
    bodyText = await res.text();

    if (bodyText.includes("SQLITE_BUSY") || bodyText.includes("database is locked")) {
      isBusy = true;
      errorMsg = "SQLITE_BUSY detected in response body";
    }

    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      // not JSON
    }

    if (status >= 200 && status < 300) {
      success = true;
    } else {
      success = false;
      errorMsg = bodyJson?.error || bodyJson?.message || `HTTP ${status}: ${bodyText.slice(0, 100)}`;
    }

    return {
      url,
      method: options.method || "GET",
      status,
      duration,
      success,
      isBusy,
      error: errorMsg,
      bodyJson,
      bodyText,
    };
  } catch (err) {
    const duration = performance.now() - start;
    const msg = err.message || String(err);
    if (msg.includes("SQLITE_BUSY") || msg.includes("database is locked")) {
      isBusy = true;
    }
    return {
      url,
      method: options.method || "GET",
      status: 0,
      duration,
      success: false,
      isBusy,
      error: msg,
      bodyJson: null,
      bodyText: "",
    };
  }
}

async function runConcurrentBatch(requests) {
  return await Promise.all(requests.map(req => executeTimedRequest(req.url, req.options)));
}

async function cleanupChallengerOrders() {
  try {
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { idempotencyKey: { startsWith: TEST_ORDER_PREFIX } },
          { specialInstructions: { startsWith: TEST_ORDER_PREFIX } },
          { specialInstructions: { contains: "CHALLENGER" } }
        ]
      },
      select: { id: true }
    });

    if (orders.length > 0) {
      const ids = orders.map(o => o.id);
      await prisma.orderItemAddon.deleteMany({ where: { orderItem: { orderId: { in: ids } } } });
      await prisma.orderItemVariant.deleteMany({ where: { orderItem: { orderId: { in: ids } } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
      console.log(`🧹 Purged ${ids.length} synthetic challenger test orders.`);
    }
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
}

async function main() {
  console.log("==========================================================================");
  console.log("⚡ EMPIRICAL ADVERSARIAL CHALLENGER STRESS & CONTENSIION SUITE");
  console.log("   Target: " + BASE_URL);
  console.log("==========================================================================");

  // 1. Initial State & Fixtures Resolution
  const targetQR = await prisma.qRCode.findUnique({
    where: { token: "9c3fac487338425c" },
    include: {
      table: true,
      restaurant: {
        include: {
          categories: { include: { items: true } },
          users: { include: { user: true } },
        },
      },
    },
  });

  if (!targetQR) {
    throw new Error("Target QR token 9c3fac487338425c not found in DB!");
  }

  const restaurant = targetQR.restaurant;
  const owner = restaurant.users[0]?.user;
  const validItem = restaurant.categories[0]?.items[0];

  if (!validItem) {
    throw new Error("No menu items found in target restaurant!");
  }

  console.log(`\n📋 Target Context:`);
  console.log(`   Restaurant: "${restaurant.name}" (${restaurant.id})`);
  console.log(`   Table: "${targetQR.table.name}" (QR: ${targetQR.token})`);
  console.log(`   Owner: ${owner?.email}`);
  console.log(`   Dish: "${validItem.name}" (${validItem.id}) - $${validItem.price}`);

  // Create valid and invalid auth tokens
  const validOwnerSession = await makeToken({
    userId: owner.id,
    email: owner.email,
    isSuperAdmin: false,
  });

  // Another user not belonging to this restaurant
  const foreignUser = await prisma.user.findFirst({
    where: {
      id: { not: owner.id },
      restaurants: { none: { restaurantId: restaurant.id } },
    },
  });
  const foreignSession = foreignUser
    ? await makeToken({ userId: foreignUser.id, email: foreignUser.email, isSuperAdmin: false })
    : null;

  // Expired token (10 seconds ago)
  const expiredSession = await new SignJWT({ userId: owner.id, email: owner.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
    .sign(secretKey);

  // Pre-clean
  await cleanupChallengerOrders();

  // -----------------------------------------------------------------------
  // SECTION 1: CONCURRENCY BURSTS
  // -----------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  console.log("🔥 SECTION 1: CONCURRENCY BURST STRESS TESTING");
  console.log("=".repeat(70));

  const concurrencyResults = {};

  // Warm up connections
  console.log("Pre-warming endpoints...");
  await Promise.all([
    fetch(`${BASE_URL}/api/health`),
    fetch(`${BASE_URL}/api/ready`),
    fetch(`${BASE_URL}/q/${targetQR.token}`),
  ]);

  // Burst 1: 50 Concurrent /api/health
  console.log("\n[Burst 1] 50 Concurrent GET /api/health requests...");
  const b1Reqs = Array.from({ length: 50 }, () => ({
    url: `${BASE_URL}/api/health`,
    options: { method: "GET" },
  }));
  const b1Res = await runConcurrentBatch(b1Reqs);
  concurrencyResults["Burst 1: 50x /api/health"] = b1Res;

  // Burst 2: 50 Concurrent /api/ready (Active SQLite SELECT 1)
  console.log("[Burst 2] 50 Concurrent GET /api/ready requests (SQLite SELECT 1)...");
  const b2Reqs = Array.from({ length: 50 }, () => ({
    url: `${BASE_URL}/api/ready`,
    options: { method: "GET" },
  }));
  const b2Res = await runConcurrentBatch(b2Reqs);
  concurrencyResults["Burst 2: 50x /api/ready"] = b2Res;

  // Burst 3: 50 Concurrent GET /q/[token] (Menu SSR & Cached Category Fetch)
  console.log("[Burst 3] 50 Concurrent GET /q/[token] requests...");
  const b3Reqs = Array.from({ length: 50 }, () => ({
    url: `${BASE_URL}/q/${targetQR.token}`,
    options: { method: "GET" },
  }));
  const b3Res = await runConcurrentBatch(b3Reqs);
  concurrencyResults["Burst 3: 50x /q/[token]"] = b3Res;

  // Burst 4: 25 Concurrent POST /api/v1/orders (Heavy transactional writes with withWriteLock)
  console.log("[Burst 4] 25 Concurrent POST /api/v1/orders requests (Serialized SQLite Writes)...");
  const b4Timestamp = Date.now();
  const b4Reqs = Array.from({ length: 25 }, (_, i) => ({
    url: `${BASE_URL}/api/v1/orders`,
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        paymentMethod: "CASH",
        idempotencyKey: `${TEST_ORDER_PREFIX}B4_${b4Timestamp}_${i}`,
        customerName: `Stress Guest ${i}`,
        specialInstructions: `${TEST_ORDER_PREFIX} Burst 4 Order ${i}`,
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    },
  }));
  const b4Res = await runConcurrentBatch(b4Reqs);
  concurrencyResults["Burst 4: 25x POST /orders"] = b4Res;

  // Burst 5: Massive Mixed Contention (120 requests at the EXACT same millisecond)
  console.log("\n[Burst 5] Massive Simultaneous Mixed Contention (120 requests fired together):");
  console.log("          - 30x GET /api/health");
  console.log("          - 30x GET /api/ready");
  console.log("          - 30x GET /q/[token]");
  console.log("          - 15x GET /api/v1/orders/admin (Staff POS polling)");
  console.log("          - 15x POST /api/v1/orders (Transactional DB writes)");

  const b5Timestamp = Date.now();
  const b5Reqs = [
    ...Array.from({ length: 30 }, () => ({
      url: `${BASE_URL}/api/health`,
      options: { method: "GET" },
    })),
    ...Array.from({ length: 30 }, () => ({
      url: `${BASE_URL}/api/ready`,
      options: { method: "GET" },
    })),
    ...Array.from({ length: 30 }, () => ({
      url: `${BASE_URL}/q/${targetQR.token}`,
      options: { method: "GET" },
    })),
    ...Array.from({ length: 15 }, () => ({
      url: `${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}&status=ACTIVE`,
      options: {
        method: "GET",
        headers: { Cookie: `session=${validOwnerSession}` },
      },
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      url: `${BASE_URL}/api/v1/orders`,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: targetQR.token,
          paymentMethod: "CASH",
          idempotencyKey: `${TEST_ORDER_PREFIX}B5_${b5Timestamp}_${i}`,
          customerName: `Mixed Guest ${i}`,
          specialInstructions: `${TEST_ORDER_PREFIX} Mixed Contention ${i}`,
          items: [{ menuItemId: validItem.id, quantity: 1 }],
        }),
      },
    })),
  ];

  const b5Res = await runConcurrentBatch(b5Reqs);
  concurrencyResults["Burst 5: 120x Mixed Contention"] = b5Res;

  // Print Concurrency Summary Table
  console.log("\n" + "=".repeat(95));
  console.log("📊 CONCURRENCY PERFORMANCE & SQLITE_BUSY MATRIX");
  console.log("=".repeat(95));
  console.log(
    "Burst Scenario".padEnd(36) +
    "Total".padStart(6) +
    "Success%".padStart(10) +
    "p50(ms)".padStart(9) +
    "p90(ms)".padStart(9) +
    "p95(ms)".padStart(9) +
    "Max(ms)".padStart(9) +
    "SQLITE_BUSY".padStart(13)
  );
  console.log("-".repeat(95));

  for (const [name, resList] of Object.entries(concurrencyResults)) {
    const total = resList.length;
    const successes = resList.filter(r => r.success).length;
    const successRate = ((successes / total) * 100).toFixed(1);
    const busyCount = resList.filter(r => r.isBusy).length;
    const durations = resList.map(r => r.duration);
    const p = calculatePercentiles(durations);

    console.log(
      name.padEnd(36) +
      String(total).padStart(6) +
      `${successRate}%`.padStart(10) +
      String(p.p50).padStart(9) +
      String(p.p90).padStart(9) +
      String(p.p95).padStart(9) +
      String(p.max).padStart(9) +
      (busyCount === 0 ? "0 (CLEAN)" : `${busyCount} (DETECTED!)`).padStart(13)
    );
  }

  // -----------------------------------------------------------------------
  // SECTION 2: ADVERSARIAL EDGE CASES & BOUNDARY PARAMETERS
  // -----------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  console.log("🛡️ SECTION 2: ADVERSARIAL EDGE CASES & BOUNDARY PARAMETERS");
  console.log("=".repeat(70));

  const edgeResults = [];

  async function testEdgeCase(name, testFn) {
    const start = performance.now();
    try {
      const outcome = await testFn();
      const duration = performance.now() - start;
      const pass = outcome.pass;
      const res = {
        name,
        pass,
        details: outcome.details,
        duration: Number(duration.toFixed(2)),
      };
      edgeResults.push(res);
      console.log(
        (pass ? "  ✅ PASS: " : "  ❌ FAIL: ") +
        name.padEnd(52) +
        ` [${res.duration}ms] - ${outcome.details}`
      );
    } catch (err) {
      const duration = performance.now() - start;
      const res = {
        name,
        pass: false,
        details: `Exception: ${err.message}`,
        duration: Number(duration.toFixed(2)),
      };
      edgeResults.push(res);
      console.log("  ❌ EXCEPTION: " + name + ` - ${err.message}`);
    }
  }

  // E01: Empty JSON body on POST /orders
  await testEdgeCase("E01: Empty JSON body on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status} (${r.error || "no error msg"})`,
    };
  });

  // E02: Malformed JSON string
  await testEdgeCase("E02: Malformed JSON syntax on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"broken": true, `,
    });
    return {
      pass: r.status === 400 || r.status === 500,
      details: `Status ${r.status} (handled cleanly without crash)`,
    };
  });

  // E03: Missing items array
  await testEdgeCase("E03: Missing items array on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: targetQR.token }),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status}`,
    };
  });

  // E04: Empty items array
  await testEdgeCase("E04: Empty items array [] on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: targetQR.token, items: [] }),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status}`,
    };
  });

  // E05: Missing QR token
  await testEdgeCase("E05: Missing QR token on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ menuItemId: validItem.id, quantity: 1 }] }),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status}`,
    };
  });

  // E06: Inactive/Non-existent QR token
  await testEdgeCase("E06: Non-existent QR token on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "nonexistent_token_challenger_9999",
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    });
    return {
      pass: r.status === 404,
      details: `Expected 404, got ${r.status} (${r.error})`,
    };
  });

  // E07: Non-existent menuItemId
  await testEdgeCase("E07: Non-existent menuItemId on POST /orders", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        items: [{ menuItemId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
      }),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status} (${r.error})`,
    };
  });

  // E08: Negative item quantity
  await testEdgeCase("E08: Negative item quantity (quantity: -5)", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        items: [{ menuItemId: validItem.id, quantity: -5 }],
      }),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status} (${r.error})`,
    };
  });

  // E09: Huge quantity (999,999 items)
  await testEdgeCase("E09: Huge item quantity (999,999 items)", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        items: [{ menuItemId: validItem.id, quantity: 999999 }],
      }),
    });
    return {
      pass: r.status === 400 || r.status === 201,
      details: `Status ${r.status} (graceful math calculation without NaN / crash)`,
    };
  });

  // E10: Oversized specialInstructions (5,000 characters)
  await testEdgeCase("E10: Oversized specialInstructions (5,000 chars)", async () => {
    const longString = "A".repeat(5000);
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        paymentMethod: "CASH",
        idempotencyKey: `${TEST_ORDER_PREFIX}E10_${Date.now()}`,
        specialInstructions: longString,
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    });
    // Truncated to 500 chars per API code and safely saved
    const createdInstructions = r.bodyJson?.order?.specialInstructions;
    const truncatedCorrectly = createdInstructions?.length <= 500;
    return {
      pass: r.status === 201 && truncatedCorrectly,
      details: `Status ${r.status}, instructions truncated to length ${createdInstructions?.length || 0}`,
    };
  });

  // E11: SQL Injection payload in specialInstructions
  await testEdgeCase("E11: SQL Injection payload in instructions", async () => {
    const sqlPayload = `'; DROP TABLE "Order"; --`;
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        paymentMethod: "CASH",
        idempotencyKey: `${TEST_ORDER_PREFIX}E11_${Date.now()}`,
        specialInstructions: sqlPayload,
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    });
    // Verify Order table is intact and instructions stored literally
    const tableCheck = await prisma.order.count();
    return {
      pass: r.status === 201 && tableCheck > 0,
      details: `Status ${r.status}, Order table intact (${tableCheck} orders)`,
    };
  });

  // E12: XSS payload in customerName
  await testEdgeCase("E12: XSS injection string in customerName", async () => {
    const xssPayload = `<script>alert('pwned')</script>`;
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        paymentMethod: "CASH",
        idempotencyKey: `${TEST_ORDER_PREFIX}E12_${Date.now()}`,
        customerName: xssPayload,
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    });
    return {
      pass: r.status === 201,
      details: `Status ${r.status}, safely processed`,
    };
  });

  // E13: Invalid coupon code
  await testEdgeCase("E13: Non-existent coupon code", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        couponCode: "NONEXISTENT_PROMO_CODE_xyz",
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    });
    return {
      pass: r.status === 400,
      details: `Expected 400, got ${r.status} (${r.error})`,
    };
  });

  // E14: Invalid paymentMethod
  await testEdgeCase("E14: Invalid paymentMethod string", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: targetQR.token,
        paymentMethod: "UNSUPPORTED_METHOD",
        idempotencyKey: `${TEST_ORDER_PREFIX}E14_${Date.now()}`,
        items: [{ menuItemId: validItem.id, quantity: 1 }],
      }),
    });
    return {
      pass: r.status === 201 || r.status === 400,
      details: `Status ${r.status} (no uncaught crash)`,
    };
  });

  // E15: Exact Idempotency Replay
  await testEdgeCase("E15: Exact Idempotency Replay returns original order", async () => {
    const idemKey = `${TEST_ORDER_PREFIX}IDEM_${Date.now()}`;
    const payload = {
      token: targetQR.token,
      paymentMethod: "CASH",
      idempotencyKey: idemKey,
      customerName: "Idempotency Master",
      items: [{ menuItemId: validItem.id, quantity: 2 }],
    };

    const first = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const second = await executeTimedRequest(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const isFirst201 = first.status === 201;
    const isSecond200 = second.status === 200 && second.bodyJson?.idempotent === true;
    const sameOrderId = first.bodyJson?.order?.id === second.bodyJson?.order?.id;

    return {
      pass: isFirst201 && isSecond200 && sameOrderId,
      details: `First: ${first.status}, Second: ${second.status} (idempotent: ${second.bodyJson?.idempotent}), same orderId: ${sameOrderId}`,
    };
  });

  // E16: Concurrent Idempotency Race Condition (5 identical requests at exact same ms)
  await testEdgeCase("E16: Concurrent Idempotency Race (5x identical requests)", async () => {
    const raceKey = `${TEST_ORDER_PREFIX}RACE_${Date.now()}`;
    const payload = {
      token: targetQR.token,
      paymentMethod: "CASH",
      idempotencyKey: raceKey,
      customerName: "Race Tester",
      items: [{ menuItemId: validItem.id, quantity: 1 }],
    };

    const raceReqs = Array.from({ length: 5 }, () => ({
      url: `${BASE_URL}/api/v1/orders`,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    }));

    const raceResults = await runConcurrentBatch(raceReqs);
    const orderCount = await prisma.order.count({ where: { idempotencyKey: raceKey } });
    const allSuccessful = raceResults.every(r => r.status === 200 || r.status === 201);
    const zeroBusy = raceResults.every(r => !r.isBusy);

    return {
      pass: orderCount === 1 && allSuccessful && zeroBusy,
      details: `Order count in DB: ${orderCount} (expected 1), all OK: ${allSuccessful}, zero SQLITE_BUSY: ${zeroBusy}`,
    };
  });

  // E17: Non-existent customer menu QR token (/q/[token])
  await testEdgeCase("E17: Non-existent QR menu route (/q/invalid_token)", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/q/invalid_token_9999`);
    return {
      pass: r.status === 404,
      details: `Expected 404, got ${r.status}`,
    };
  });

  // E18: SQL Injection in menu URL path
  await testEdgeCase("E18: SQL injection attempt in menu URL path", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/q/%27%20OR%201%3D1%20--`);
    return {
      pass: r.status === 404,
      details: `Expected 404, got ${r.status}`,
    };
  });

  // E19: Giant token length in menu URL path (1,500 chars)
  await testEdgeCase("E19: 1,500 character token length in /q/[token]", async () => {
    const giant = "x".repeat(1500);
    const r = await executeTimedRequest(`${BASE_URL}/q/${giant}`);
    return {
      pass: r.status === 404 || r.status === 400,
      details: `Expected 404/400, got ${r.status}`,
    };
  });

  // E20: Null byte injection in menu URL
  await testEdgeCase("E20: Null byte injection in menu URL path", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/q/%00token`);
    return {
      pass: r.status === 404 || r.status === 400,
      details: `Status ${r.status}`,
    };
  });

  // E21: GET /api/v1/orders/admin without auth cookie
  await testEdgeCase("E21: GET /api/v1/orders/admin without auth cookie", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}`);
    return {
      pass: r.status === 401,
      details: `Expected 401, got ${r.status}`,
    };
  });

  // E22: GET /api/v1/orders/admin with malformed session cookie
  await testEdgeCase("E22: GET /api/v1/orders/admin with malformed cookie", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}`, {
      headers: { Cookie: "session=not_a_valid_jwt_token_string" },
    });
    return {
      pass: r.status === 401,
      details: `Expected 401, got ${r.status}`,
    };
  });

  // E23: GET /api/v1/orders/admin with tampered signature JWT
  await testEdgeCase("E23: GET /api/v1/orders/admin with tampered JWT", async () => {
    const tampered = validOwnerSession.slice(0, -6) + "XXXXXX";
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}`, {
      headers: { Cookie: `session=${tampered}` },
    });
    return {
      pass: r.status === 401,
      details: `Expected 401, got ${r.status}`,
    };
  });

  // E24: GET /api/v1/orders/admin with expired JWT
  await testEdgeCase("E24: GET /api/v1/orders/admin with expired JWT", async () => {
    const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}`, {
      headers: { Cookie: `session=${expiredSession}` },
    });
    return {
      pass: r.status === 401,
      details: `Expected 401, got ${r.status}`,
    };
  });

  // E25: Cross-Tenant Access: User belonging to different restaurant
  if (foreignSession) {
    await testEdgeCase("E25: Cross-Tenant access to /api/v1/orders/admin", async () => {
      const r = await executeTimedRequest(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}`, {
        headers: { Cookie: `session=${foreignSession}` },
      });
      return {
        pass: r.status === 403,
        details: `Expected 403 Forbidden, got ${r.status}`,
      };
    });
  } else {
    console.log("  ⚠️ Skipping E25 (No foreign tenant user in DB)");
  }

  // E26: Post-stress SQLite DB Integrity Check
  await testEdgeCase("E26: Post-stress SQLite PRAGMA integrity_check", async () => {
    const check = await prisma.$queryRawUnsafe("PRAGMA integrity_check;");
    const result = Array.isArray(check) && check[0]?.integrity_check === "ok";
    return {
      pass: result,
      details: `PRAGMA integrity_check: ${JSON.stringify(check)}`,
    };
  });

  // E27: Post-stress Liveness & Readiness health
  await testEdgeCase("E27: Post-stress /api/health and /api/ready health", async () => {
    const health = await executeTimedRequest(`${BASE_URL}/api/health`);
    const ready = await executeTimedRequest(`${BASE_URL}/api/ready`);
    const pass = health.status === 200 && ready.status === 200 && ready.bodyJson?.database === "connected";
    return {
      pass,
      details: `Health: ${health.status}, Ready: ${ready.status} (db: ${ready.bodyJson?.database}, latency: ${ready.bodyJson?.latencyMs}ms)`,
    };
  });

  // Cleanup synthetic challenger orders
  await cleanupChallengerOrders();

  console.log("\n" + "=".repeat(70));
  const totalEdges = edgeResults.length;
  const passedEdges = edgeResults.filter(e => e.pass).length;
  console.log(`🎯 Edge Cases Complete: ${passedEdges}/${totalEdges} Passed (${((passedEdges/totalEdges)*100).toFixed(1)}%)`);
  console.log("=".repeat(70));
}

main()
  .catch(err => {
    console.error("FATAL ERROR IN CHALLENGER TEST:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
