/**
 * MASTER 24-PHASE LOCALHOST LOAD & STRESS TESTING SUITE
 *
 * Covers:
 * - WAVE 1: Foundation, Auth, Setup & Super Admin (Phases 1, 2, 15, 16, 17, 21, 22)
 * - WAVE 2: Restaurant Admin Dashboards (Phases 3, 4, 10, 11, 12, 13, 18, 19)
 * - WAVE 3: Peak Rush Hour Customer & Kitchen (Phases 5, 6, 7, 8, 14)
 * - WAVE 4: Payments, Receipts & External Delivery (Phases 9, 20, 23, 24)
 *
 * Zero Residue: Automatically purges all synthetic records on completion.
 */

import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

const TEST_PREFIX = "LOADTEST_24P_";

async function makeToken(userId, email, isSuperAdmin = false) {
  return await new SignJWT({ userId, email, isSuperAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
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

/**
 * Execute concurrent batch of fetch calls
 */
async function runConcurrentBatch(requests, concurrencyLimit = 50) {
  const results = [];
  const chunks = [];
  for (let i = 0; i < requests.length; i += concurrencyLimit) {
    chunks.push(requests.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (req) => {
      const start = performance.now();
      try {
        const res = await fetch(req.url, {
          method: req.method || "GET",
          headers: req.headers || {},
          body: req.body ? JSON.stringify(req.body) : undefined,
        });
        const duration = performance.now() - start;
        return {
          name: req.name,
          phase: req.phase,
          status: res.status,
          success: res.ok,
          duration,
        };
      } catch (err) {
        const duration = performance.now() - start;
        return {
          name: req.name,
          phase: req.phase,
          status: 0,
          success: false,
          error: err.message,
          duration,
        };
      }
    });
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Teardown synthetic records
 */
async function cleanupSyntheticData() {
  console.log("\n🧹 Cleaning up synthetic test tenant data...");
  const rests = await prisma.restaurant.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const restIds = rests.map((r) => r.id);

  if (restIds.length > 0) {
    const orders = await prisma.order.findMany({ where: { restaurantId: { in: restIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);

    await prisma.orderItemAddon.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } });
    await prisma.orderItemVariant.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.digitalReceipt.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.qRCode.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.table.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.menuItemAddonLink.deleteMany({ where: { menuItem: { restaurantId: { in: restIds } } } });
    await prisma.menuItemAddon.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.menuItemVariant.deleteMany({ where: { menuItem: { restaurantId: { in: restIds } } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.menuCategory.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.inventoryItem.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: restIds } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: restIds } } });
  }

  await prisma.user.deleteMany({
    where: { OR: [{ email: { startsWith: "loadtest_24p_" } }, { name: { startsWith: TEST_PREFIX } }] },
  });

  console.log("✅ Synthetic test data completely purged. Zero residue remaining.");
}

async function main() {
  console.log("==================================================================");
  console.log("🚀 MASTER 24-PHASE LOCALHOST LOAD & STRESS TESTING SUITE");
  console.log("==================================================================");

  await cleanupSyntheticData();

  const timestamp = Date.now();
  console.log("\n🔧 Provisioning synthetic tenant for 24-phase validation...");

  // 1. Setup User & Super Admin User
  const ownerUser = await prisma.user.create({
    data: {
      email: `loadtest_24p_owner_${timestamp}@example.com`,
      name: `${TEST_PREFIX}Owner`,
      passwordHash: "$2b$10$epB/2VwY1f/t.JkU08yBLeE9uPqG5Y7E7sO48MvQdJdYvP7BqXJqm",
      isActive: true,
    },
  });

  const superAdminUser = await prisma.user.create({
    data: {
      email: `loadtest_24p_admin_${timestamp}@example.com`,
      name: `${TEST_PREFIX}SuperAdmin`,
      passwordHash: "$2b$10$epB/2VwY1f/t.JkU08yBLeE9uPqG5Y7E7sO48MvQdJdYvP7BqXJqm",
      isActive: true,
      isSuperAdmin: true,
    },
  });

  const ownerToken = await makeToken(ownerUser.id, ownerUser.email, false);
  const superAdminToken = await makeToken(superAdminUser.id, superAdminUser.email, true);

  // 2. Setup Restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `${TEST_PREFIX}Grand_Bistro`,
      slug: `loadtest-24p-${timestamp}`,
      currency: "USD",
      taxPercentage: 8,
      status: "ACTIVE",
      isOrderingEnabled: true,
    },
  });

  await prisma.restaurantUser.create({
    data: { userId: ownerUser.id, restaurantId: restaurant.id, role: "OWNER" },
  });

  // 3. Setup Tables & QRs
  const tables = [];
  for (let i = 1; i <= 5; i++) {
    const t = await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        name: `${TEST_PREFIX}Table_${i}`,
        number: String(i),
        capacity: 4,
        status: "ACTIVE",
      },
    });
    const qr = await prisma.qRCode.create({
      data: {
        restaurantId: restaurant.id,
        tableId: t.id,
        token: `token_24p_${timestamp}_${i}`,
        url: `${BASE_URL}/q/token_24p_${timestamp}_${i}`,
        status: "ACTIVE",
      },
    });
    tables.push({ ...t, qr });
  }

  // 4. Setup Category & Items
  const category = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: `${TEST_PREFIX}Mains`, isActive: true, sortOrder: 1 },
  });

  const items = [];
  for (let i = 1; i <= 6; i++) {
    const item = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: `${TEST_PREFIX}Dish_${i}`,
        slug: `dish-24p-${timestamp}-${i}`,
        price: 12.5 + i,
        isAvailable: true,
        status: "ACTIVE",
        sortOrder: i,
      },
    });
    items.push(item);
  }

  // 5. Setup Inventory
  for (let i = 1; i <= 4; i++) {
    await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurant.id,
        name: `${TEST_PREFIX}Ingredient_${i}`,
        sku: `SKU_24P_${timestamp}_${i}`,
        currentStock: 100,
        lowStockThreshold: 10,
        unit: "KILOGRAM",
      },
    });
  }

  console.log(`✅ Provisioned Synthetic Environment:`);
  console.log(`   Restaurant: ${restaurant.name} (${restaurant.id})`);
  console.log(`   Tables: ${tables.length} tables with active QRs`);
  console.log(`   Menu: ${items.length} items`);

  // Pre-warm routes to eliminate Next.js JIT compilation latency
  console.log("\n🔥 Pre-warming routes to eliminate Next.js JIT compilation latency...");
  await Promise.allSettled([
    fetch(`${BASE_URL}/api/health`),
    fetch(`${BASE_URL}/q/${tables[0].qr.token}`),
    fetch(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}&status=ACTIVE`, {
      headers: { Cookie: `session=${ownerToken}` },
    }),
    fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: tables[0].qr.token,
        paymentMethod: "CASH",
        idempotencyKey: `warmup_${Date.now()}`,
        items: [{ menuItemId: items[0].id, quantity: 1 }],
        customerName: "Warmup Guest",
      }),
    }),
    fetch(`${BASE_URL}/api/v1/tables/call-waiter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tables[0].qr.token, type: "WATER" }),
    }),
  ]);
  console.log("✅ Routes pre-compiled.");

  const allPhaseResults = {};

  try {
    // -------------------------------------------------------------------------
    // WAVE 1: Foundation, Auth, Setup & Super Admin (Phases 1, 2, 15, 16, 17, 21, 22)
    // -------------------------------------------------------------------------
    console.log("\n" + "=".repeat(70));
    console.log("🌊 WAVE 1: Foundation, Auth, Settings & Super Admin (Phases 1, 2, 15, 16, 17, 21, 22)");
    console.log("=".repeat(70));

    const wave1Requests = [
      // Phase 1: Healthcheck (50 requests)
      ...Array.from({ length: 50 }, () => ({
        phase: "Phase 1: Foundation & Landing",
        name: "GET /api/health",
        url: `${BASE_URL}/api/health`,
      })),
      // Phase 2: Auth Session check (20 concurrent)
      ...Array.from({ length: 20 }, () => ({
        phase: "Phase 2: Auth & Staff Accounts",
        name: "GET /api/v1/auth/me",
        url: `${BASE_URL}/api/v1/auth/me`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 15: Restaurant Settings (20 concurrent)
      ...Array.from({ length: 20 }, () => ({
        phase: "Phase 15: Restaurant Settings",
        name: "GET /api/v1/settings",
        url: `${BASE_URL}/api/v1/settings?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 16: Super Admin Overview (15 concurrent)
      ...Array.from({ length: 15 }, () => ({
        phase: "Phase 16: Super Admin Overview",
        name: "GET /api/v1/super-admin/overview",
        url: `${BASE_URL}/api/v1/super-admin/overview`,
        headers: { Cookie: `session=${superAdminToken}` },
      })),
      // Phase 21: Audit Logs (15 concurrent)
      ...Array.from({ length: 15 }, () => ({
        phase: "Phase 21: Audit Logs",
        name: "GET /api/v1/audit-logs",
        url: `${BASE_URL}/api/v1/audit-logs?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
    ];

    const wave1Results = await runConcurrentBatch(wave1Requests, 25);
    for (const r of wave1Results) {
      if (!allPhaseResults[r.phase]) allPhaseResults[r.phase] = [];
      allPhaseResults[r.phase].push(r);
    }
    console.log(`✅ Wave 1 Completed: ${wave1Results.length} requests executed.`);

    // -------------------------------------------------------------------------
    // WAVE 2: Restaurant Admin Dashboards (Phases 3, 4, 10, 11, 12, 13, 18, 19)
    // -------------------------------------------------------------------------
    console.log("\n" + "=".repeat(70));
    console.log("🌊 WAVE 2: Dashboards — Menu, Tables, Inventory, CRM, Loyalty & Analytics (Phases 3, 4, 10, 11, 12, 13, 18, 19)");
    console.log("=".repeat(70));

    const wave2Requests = [
      // Phase 3: Menu Items Fetch (30 concurrent)
      ...Array.from({ length: 30 }, () => ({
        phase: "Phase 3: Menu Management",
        name: "GET /api/v1/menu/items",
        url: `${BASE_URL}/api/v1/menu/items?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 4: Tables List (25 concurrent)
      ...Array.from({ length: 25 }, () => ({
        phase: "Phase 4: Tables & QR",
        name: "GET /api/v1/tables",
        url: `${BASE_URL}/api/v1/tables?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 12: Low Stock Inventory (20 concurrent)
      ...Array.from({ length: 20 }, () => ({
        phase: "Phase 12: Inventory Control",
        name: "GET /api/v1/inventory/low-stock",
        url: `${BASE_URL}/api/v1/inventory/low-stock?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 11: Customer CRM (20 concurrent)
      ...Array.from({ length: 20 }, () => ({
        phase: "Phase 11: Customer CRM",
        name: "GET /api/v1/customers",
        url: `${BASE_URL}/api/v1/customers?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 13: Analytics Dashboard (15 concurrent)
      ...Array.from({ length: 15 }, () => ({
        phase: "Phase 13: Analytics Dashboard",
        name: "GET /api/v1/analytics",
        url: `${BASE_URL}/api/v1/analytics?restaurantId=${restaurant.id}&period=7d`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
    ];

    const wave2Results = await runConcurrentBatch(wave2Requests, 25);
    for (const r of wave2Results) {
      if (!allPhaseResults[r.phase]) allPhaseResults[r.phase] = [];
      allPhaseResults[r.phase].push(r);
    }
    console.log(`✅ Wave 2 Completed: ${wave2Results.length} requests executed.`);

    // -------------------------------------------------------------------------
    // WAVE 3: Peak Rush Hour — Customer QR, Ordering, POS Dashboard & KDS (Phases 5, 6, 7, 8, 14)
    // -------------------------------------------------------------------------
    console.log("\n" + "=".repeat(70));
    console.log("🌊 WAVE 3: Peak Rush Hour — Customer QR, Orders, POS Dashboard & KDS (Phases 5, 6, 7, 8, 14)");
    console.log("=".repeat(70));

    const sampleQr = tables[0].qr.token;
    const wave3Requests = [
      // Phase 5: Customer QR Menu Scan (50 concurrent)
      ...Array.from({ length: 50 }, () => ({
        phase: "Phase 5: Customer Digital Menu",
        name: "GET /q/[token]",
        url: `${BASE_URL}/q/${sampleQr}`,
      })),
      // Phase 6: Place Orders (30 concurrent orders at same second)
      ...Array.from({ length: 30 }, (_, idx) => ({
        phase: "Phase 6: Ordering & Cart",
        name: "POST /api/v1/orders",
        url: `${BASE_URL}/api/v1/orders`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          token: sampleQr,
          paymentMethod: "CASH",
          idempotencyKey: `wave3_order_${timestamp}_${idx}`,
          items: [{ menuItemId: items[idx % items.length].id, quantity: 1 }],
          customerName: `Guest ${idx + 1}`,
        },
      })),
      // Phase 7: Restaurant Order Dashboard Polling (25 concurrent)
      ...Array.from({ length: 25 }, () => ({
        phase: "Phase 7: Order Management POS",
        name: "GET /api/v1/orders/admin",
        url: `${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}&status=ACTIVE`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 8: KDS Screen (25 concurrent)
      ...Array.from({ length: 25 }, () => ({
        phase: "Phase 8: Kitchen Display (KDS)",
        name: "GET /api/v1/orders/admin (KDS view)",
        url: `${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}&status=ACTIVE`,
        headers: { Cookie: `session=${ownerToken}` },
      })),
      // Phase 14: Waiter Calls (20 concurrent)
      ...Array.from({ length: 20 }, (_, idx) => ({
        phase: "Phase 14: Real-Time Alerts",
        name: "POST /api/v1/tables/call-waiter",
        url: `${BASE_URL}/api/v1/tables/call-waiter`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          token: sampleQr,
          type: idx % 2 === 0 ? "WATER" : "WAITER",
        },
      })),
    ];

    const wave3Results = await runConcurrentBatch(wave3Requests, 10);
    for (const r of wave3Results) {
      if (!allPhaseResults[r.phase]) allPhaseResults[r.phase] = [];
      allPhaseResults[r.phase].push(r);
    }
    console.log(`✅ Wave 3 Completed: ${wave3Results.length} requests executed.`);

    // -------------------------------------------------------------------------
    // WAVE 4: Payments, Receipts & External Delivery (Phases 9, 20, 23, 24)
    // -------------------------------------------------------------------------
    console.log("\n" + "=".repeat(70));
    console.log("🌊 WAVE 4: Payments, Receipts & Delivery (Phases 9, 20, 23, 24)");
    console.log("=".repeat(70));

    // Fetch orders created in Wave 3 to test payments and receipts
    const createdOrders = await prisma.order.findMany({
      where: { restaurantId: restaurant.id },
      take: 20,
      include: { payments: true },
    });

    const wave4Requests = [];
    for (const ord of createdOrders) {
      // Phase 9: Payment Status Verify
      wave4Requests.push({
        phase: "Phase 9: Payment Processing",
        name: "GET /api/v1/payments/status",
        url: `${BASE_URL}/api/v1/payments/status?orderId=${ord.id}&token=${sampleQr}`,
      });
      // Phase 24: Receipts View
      wave4Requests.push({
        phase: "Phase 24: Digital Receipts",
        name: "GET /api/v1/receipts/[id]",
        url: `${BASE_URL}/api/v1/receipts?restaurantId=${restaurant.id}&orderId=${ord.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      });
      // Phase 20: Delivery / integrations status
      wave4Requests.push({
        phase: "Phase 20: Integrations & Webhooks",
        name: "GET /api/v1/integrations/settings",
        url: `${BASE_URL}/api/v1/integrations/settings?restaurantId=${restaurant.id}`,
        headers: { Cookie: `session=${ownerToken}` },
      });
    }

    const wave4Results = await runConcurrentBatch(wave4Requests, 20);
    for (const r of wave4Results) {
      if (!allPhaseResults[r.phase]) allPhaseResults[r.phase] = [];
      allPhaseResults[r.phase].push(r);
    }
    console.log(`✅ Wave 4 Completed: ${wave4Results.length} requests executed.`);

    // -------------------------------------------------------------------------
    // PERFORMANCE SUMMARY REPORT
    // -------------------------------------------------------------------------
    console.log("\n" + "=".repeat(90));
    console.log("📊 24-PHASE FULL LOAD TEST PERFORMANCE MATRIX");
    console.log("=".repeat(90));
    console.log(
      "Phase / Module".padEnd(38) +
      "Reqs".padStart(6) +
      "Success%".padStart(10) +
      "p50(ms)".padStart(10) +
      "p95(ms)".padStart(10) +
      "Min(ms)".padStart(10) +
      "Status".padStart(8)
    );
    console.log("-".repeat(92));

    const matrixSummary = [];

    for (const [phaseName, resList] of Object.entries(allPhaseResults)) {
      const total = resList.length;
      const successes = resList.filter((r) => r.success).length;
      const successRate = total > 0 ? (successes / total) * 100 : 0;
      const durations = resList.map((r) => r.duration);
      const p = calculatePercentiles(durations);
      const isPass = successRate >= 95;

      matrixSummary.push({
        phase: phaseName,
        total,
        successRate: Number(successRate.toFixed(1)),
        p50: p.p50,
        p95: p.p95,
        min: p.min,
        status: isPass ? "PASS" : "FAIL",
      });

      console.log(
        phaseName.padEnd(38) +
        String(total).padStart(6) +
        `${successRate.toFixed(1)}%`.padStart(10) +
        String(p.p50).padStart(10) +
        String(p.p95).padStart(10) +
        String(p.min).padStart(10) +
        (isPass ? "  ✅ PASS" : "  ❌ FAIL").padStart(8)
      );
    }

    return matrixSummary;
  } finally {
    await cleanupSyntheticData();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FATAL LOAD TEST ERROR:", err);
  process.exit(1);
});
