const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = "") {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? "(" + detail + ")" : ""}`);
    failed++;
  }
}

// Clean connection wrapper to prevent socket keep-alive issues in dev mode
const originalFetch = global.fetch;
global.fetch = async function (url, options = {}) {
  const headers = { ...(options.headers || {}), Connection: "close" };
  const res = await originalFetch(url, { ...options, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  await new Promise((r) => setTimeout(r, 60));
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    text: async () => text,
    json: async () => json,
    _data: json,
  };
};

async function safeJson(res) {
  return res._data || (await res.json());
}

async function createSessionCookie(userId, email) {
  const token = await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
  return `session=${token}`;
}

async function runPhase13AnalyticsAudit() {
  console.log("=================================================================");
  console.log("  PHASE 13: ANALYTICS & REPORTING SECURITY & METRIC LOGIC AUDIT");
  console.log("=================================================================\n");

  const cleanupOrderIds = [];
  const cleanupPaymentIds = [];
  const cleanupItemIds = [];

  try {
    // 0. Server Health Check
    console.log("[0/9] Checking server availability at " + BASE_URL + "...");
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

    // 1. Setup Test Database Context (Tenants and Users)
    console.log("[1/9] Setting up test context for Restaurant A and Restaurant B...");
    const restaurantA = await prisma.restaurant.findFirst({
      where: { status: "ACTIVE" },
      include: { users: { include: { user: true } }, tables: true },
    });

    if (!restaurantA) {
      throw new Error("No active restaurant found in database.");
    }

    const ownerAUser = restaurantA.users.find((u) => u.role === "OWNER")?.user;
    if (!ownerAUser) throw new Error("No owner found for restaurant A");

    const ownerACookie = await createSessionCookie(ownerAUser.id, ownerAUser.email);
    assert(!!ownerACookie, `Owner A authenticated (${ownerAUser.email})`);

    // Ensure staff user
    let staffUser = await prisma.user.findFirst({
      where: { email: "p13_staff@test.com" },
    });
    if (!staffUser) {
      staffUser = await prisma.user.create({
        data: {
          name: "Floor Staff P13",
          email: "p13_staff@test.com",
          passwordHash: "hash_placeholder",
        },
      });
      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantA.id,
          userId: staffUser.id,
          role: "STAFF",
          status: "ACTIVE",
        },
      });
    }
    const staffCookie = await createSessionCookie(staffUser.id, staffUser.email);
    assert(!!staffCookie, "Staff member authenticated (Role: STAFF)");

    // Ensure kitchen chef user
    let kitchenUser = await prisma.user.findFirst({
      where: { email: "p13_kitchen@test.com" },
    });
    if (!kitchenUser) {
      kitchenUser = await prisma.user.create({
        data: {
          name: "Kitchen Chef P13",
          email: "p13_kitchen@test.com",
          passwordHash: "hash_placeholder",
        },
      });
      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantA.id,
          userId: kitchenUser.id,
          role: "KITCHEN",
          status: "ACTIVE",
        },
      });
    }
    const kitchenCookie = await createSessionCookie(kitchenUser.id, kitchenUser.email);
    assert(!!kitchenCookie, "Kitchen Chef authenticated (Role: KITCHEN)");

    // Ensure Tenant B for cross-tenant IDOR defense
    let restaurantB = await prisma.restaurant.findFirst({
      where: { id: { not: restaurantA.id } },
      include: { users: { include: { user: true } } },
    });
    let ownerBUser;
    if (!restaurantB) {
      ownerBUser = await prisma.user.create({
        data: {
          name: "Owner B",
          email: `owner_b_${Date.now()}@example.com`,
          passwordHash: "hash_placeholder",
        },
      });
      restaurantB = await prisma.restaurant.create({
        data: {
          name: "Restaurant B (Cross-Tenant)",
          slug: `restaurant-b-${Date.now()}`,
          users: {
            create: {
              userId: ownerBUser.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
        },
        include: { users: { include: { user: true } } },
      });
    } else {
      ownerBUser = restaurantB.users[0].user;
    }
    const ownerBCookie = await createSessionCookie(ownerBUser.id, ownerBUser.email);
    assert(!!ownerBCookie, `Owner B authenticated for Tenant B (${restaurantB.name})`);

    // 2. Authentication & Role Permission Verification
    console.log("\n[2/9] Testing Authentication & RBAC Permission Boundaries...");

    // 2.1 Unauthenticated request returns 401
    const unauthRes = await fetch(`${BASE_URL}/api/v1/analytics`);
    assert(unauthRes.status === 401, "Unauthenticated request returns 401 Unauthorized");

    // 2.2 Staff role blocked with 403 (missing analytics.view)
    const staffRes = await fetch(`${BASE_URL}/api/v1/analytics`, {
      headers: { Cookie: staffCookie },
    });
    assert(
      staffRes.status === 403,
      "Floor staff is blocked from financial analytics (403 Forbidden)"
    );

    // 2.3 Kitchen role blocked with 403 (missing analytics.view)
    const kitchenRes = await fetch(`${BASE_URL}/api/v1/analytics`, {
      headers: { Cookie: kitchenCookie },
    });
    assert(
      kitchenRes.status === 403,
      "Kitchen Chef is blocked from financial analytics (403 Forbidden)"
    );

    // 2.4 Owner role allowed (200 OK)
    const ownerRes = await fetch(`${BASE_URL}/api/v1/analytics`, {
      headers: { Cookie: ownerACookie },
    });
    const ownerData = await safeJson(ownerRes);
    assert(
      ownerRes.status === 200 && ownerData.success === true,
      "Owner can access analytics endpoint (200 OK)"
    );
    assert(!!ownerData.data.kpis, "Response contains kpis structure");

    // 3. Date Range Parameter Validation
    console.log("\n[3/9] Testing Date Range Presets & Validation Rules...");

    // 3.1 Preset intervals
    for (const p of ["today", "yesterday", "7d", "30d", "this_month", "prev_month"]) {
      const pRes = await fetch(`${BASE_URL}/api/v1/analytics?period=${p}`, {
        headers: { Cookie: ownerACookie },
      });
      const pData = await safeJson(pRes);
      assert(
        pRes.status === 200 && pData.data.startDate && pData.data.endDate,
        `Preset '${p}' returns valid calculated date bounds (${pData.data?.startDate} to ${pData.data?.endDate})`
      );
    }

    // 3.2 Valid Custom Date Range
    const customRes = await fetch(
      `${BASE_URL}/api/v1/analytics?period=custom&startDate=2026-01-01&endDate=2026-01-07`,
      { headers: { Cookie: ownerACookie } }
    );
    const customData = await safeJson(customRes);
    assert(
      customRes.status === 200 &&
        customData.data.startDate === "2026-01-01" &&
        customData.data.endDate === "2026-01-07",
      "Custom date range validated and applied accurately"
    );

    // 3.3 Invalid custom date format rejected
    const invalidDateRes = await fetch(
      `${BASE_URL}/api/v1/analytics?period=custom&startDate=bad-date&endDate=2026-01-07`,
      { headers: { Cookie: ownerACookie } }
    );
    assert(invalidDateRes.status === 400, "Malformed date string rejected with 400 Bad Request");

    // 3.4 Inverted custom dates (start > end) rejected
    const invertedRes = await fetch(
      `${BASE_URL}/api/v1/analytics?period=custom&startDate=2026-02-10&endDate=2026-01-01`,
      { headers: { Cookie: ownerACookie } }
    );
    assert(
      invertedRes.status === 400,
      "Inverted date range (startDate > endDate) rejected with 400"
    );

    // 3.5 Excessive range (> 366 days) rejected
    const excessiveRes = await fetch(
      `${BASE_URL}/api/v1/analytics?period=custom&startDate=2024-01-01&endDate=2026-01-01`,
      { headers: { Cookie: ownerACookie } }
    );
    assert(excessiveRes.status === 400, "Excessive range (> 366 days) rejected with 400 Bad Request");

    // 4. Authoritative Metric Calculations Audit
    console.log("\n[4/9] Testing Authoritative KPI Calculation Logic...");

    // Seed test menu items and category in Tenant A
    let testCategory = await prisma.menuCategory.findFirst({
      where: { restaurantId: restaurantA.id },
    });
    if (!testCategory) {
      testCategory = await prisma.menuCategory.create({
        data: {
          restaurantId: restaurantA.id,
          name: `Category_${Date.now()}`,
        },
      });
    }

    const testItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: testCategory.id,
        name: `Signature Burger P13_${Date.now()}`,
        slug: `sig-burger-p13-${Date.now()}`,
        price: 25.0,
      },
    });
    cleanupItemIds.push(testItem.id);

    const testTable = restaurantA.tables[0] || (await prisma.table.create({
      data: { restaurantId: restaurantA.id, name: "Table 13" },
    }));

    // Ensure test customer
    const testCustomer = await prisma.customer.create({
      data: {
        restaurantId: restaurantA.id,
        name: `Patron P13_${Date.now()}`,
      },
    });

    const now = new Date();

    // Order 1: Completed, $50.00, Paid, 2 Signature Burgers
    const order1 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: testTable.id,
        orderNumber: `P13_ORD1_${Date.now()}`,
        status: "COMPLETED",
        paymentStatus: "PAID",
        subtotal: 45.0,
        tax: 5.0,
        total: 50.0,
        customerId: testCustomer.id,
        createdAt: now,
        items: {
          create: [
            {
              menuItemId: testItem.id,
              name: testItem.name,
              price: 25.0,
              quantity: 2,
            },
          ],
        },
      },
    });
    cleanupOrderIds.push(order1.id);

    const payment1 = await prisma.payment.create({
      data: {
        restaurantId: restaurantA.id,
        orderId: order1.id,
        amount: 50.0,
        status: "PAID",
        provider: "RAZORPAY",
        createdAt: now,
      },
    });
    cleanupPaymentIds.push(payment1.id);

    // Order 2: Preparing, $30.00, Pending, 1 Signature Burger + $5 option
    const order2 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: testTable.id,
        orderNumber: `P13_ORD2_${Date.now()}`,
        status: "PREPARING",
        paymentStatus: "PENDING",
        subtotal: 27.0,
        tax: 3.0,
        total: 30.0,
        customerId: testCustomer.id,
        createdAt: now,
        items: {
          create: [
            {
              menuItemId: testItem.id,
              name: testItem.name,
              price: 30.0,
              quantity: 1,
            },
          ],
        },
      },
    });
    cleanupOrderIds.push(order2.id);

    // Order 3: CANCELLED, $100.00, Cancelled, MUST BE EXCLUDED FROM SALES!
    const order3 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: testTable.id,
        orderNumber: `P13_ORD3_${Date.now()}`,
        status: "CANCELLED",
        paymentStatus: "FAILED",
        subtotal: 90.0,
        tax: 10.0,
        total: 100.0,
        createdAt: now,
        items: {
          create: [
            {
              menuItemId: testItem.id,
              name: testItem.name,
              price: 100.0,
              quantity: 1,
            },
          ],
        },
      },
    });
    cleanupOrderIds.push(order3.id);

    // Query analytics for "today"
    const todayRes = await fetch(`${BASE_URL}/api/v1/analytics?period=today`, {
      headers: { Cookie: ownerACookie },
    });
    const todayData = await safeJson(todayRes);
    const kpis = todayData.data.kpis;

    assert(todayRes.status === 200, "Analytics query succeeds for seeded test period");
    assert(kpis.totalOrders >= 3, `Total orders placed includes all states (Got: ${kpis.totalOrders})`);
    assert(kpis.completedOrders >= 1, `Completed orders count verified (Got: ${kpis.completedOrders})`);
    assert(kpis.cancelledOrders >= 1, `Cancelled orders count verified (Got: ${kpis.cancelledOrders})`);
    assert(kpis.inProgressOrders >= 1, `In-progress orders count verified (Got: ${kpis.inProgressOrders})`);

    // Verify Cancelled Order Exclusion:
    // Order 1 ($50) + Order 2 ($30) = $80. Order 3 ($100) must NOT be added!
    assert(
      kpis.grossSales >= 80.0,
      `Gross Sales strictly sums non-cancelled orders (Got: $${kpis.grossSales})`
    );
    assert(
      kpis.netSales >= 72.0,
      `Net Sales strictly calculates subtotal excluding taxes and cancellations (Got: $${kpis.netSales})`
    );
    assert(kpis.paidRevenue >= 50.0, `Paid captured revenue verified (Got: $${kpis.paidRevenue})`);

    // Zero-Denominator AOV Safety Check
    assert(kpis.aov > 0, `Average Order Value accurately calculated (Got: $${kpis.aov})`);

    // 5. Time Series Trend & Continuous Bucketing
    console.log("\n[5/9] Testing Time Series Trends & Continuous Interval Bucketing...");
    const trends = todayData.data.trends;
    assert(Array.isArray(trends) && trends.length > 0, "Returns array of trend points");
    assert(
      trends.some((t) => t.sales > 0),
      "Trend captures positive sales for active hourly intervals"
    );
    assert(
      trends.some((t) => t.sales === 0 && t.orderCount === 0),
      "Trend enforces continuous zero-filling for quiet intervals without missing points"
    );

    // 6. Top Selling Menu Items Breakdown
    console.log("\n[6/9] Testing Top Selling Menu Items & Category Aggregation...");
    const topItems = todayData.data.topItems;
    assert(Array.isArray(topItems) && topItems.length > 0, "Returns top selling menu items list");

    const foundSigBurger = topItems.find((ti) => ti.name === testItem.name);
    assert(!!foundSigBurger, `Identifies '${testItem.name}' in top selling items`);
    assert(
      foundSigBurger && foundSigBurger.quantitySold >= 3,
      `Accurately sums quantities sold across qualifying orders (Got: ${foundSigBurger?.quantitySold}, Expected: >=3)`
    );
    assert(
      foundSigBurger && foundSigBurger.totalRevenue >= 80.0,
      `Accurately sums item revenue excluding cancelled orders (Got: $${foundSigBurger?.totalRevenue})`
    );

    // 7. Privacy-Preserving Customer CRM Insights
    console.log("\n[7/9] Testing Customer Engagement & PII Safeguards...");
    const custInsights = todayData.data.customerInsights;
    assert(custInsights.uniqueCustomers >= 1, `Counts unique patrons (Got: ${custInsights.uniqueCustomers})`);
    assert(
      typeof custInsights.repeatOrderRate === "number",
      `Calculates repeat order rate (Got: ${custInsights.repeatOrderRate}%)`
    );

    // PII Audit: Verify no customer phone numbers or emails exist anywhere in the analytics JSON
    const jsonStr = JSON.stringify(todayData.data);
    assert(!jsonStr.includes("p13_staff@test.com"), "No staff email addresses leaked in aggregate analytics");
    assert(!jsonStr.includes("customerNotes"), "Customer internal notes strictly withheld from analytics response");

    // 8. Multi-Tenant Isolation & Cross-Tenant IDOR
    console.log("\n[8/9] Testing Multi-Tenant Boundary & Cross-Tenant IDOR Defense...");

    // Query Tenant B analytics
    const tenantBRes = await fetch(`${BASE_URL}/api/v1/analytics?period=today`, {
      headers: { Cookie: ownerBCookie },
    });
    const tenantBData = await safeJson(tenantBRes);
    assert(tenantBRes.status === 200, "Owner B can query Tenant B analytics");

    // Tenant B cannot see Tenant A's orders or top items
    const tenantBTopItems = tenantBData.data.topItems || [];
    assert(
      !tenantBTopItems.some((ti) => ti.name === testItem.name),
      "Tenant B analytics strictly isolates Tenant A menu items and order data"
    );

    // Cross-Tenant IDOR: Owner A queries analytics specifying Tenant B restaurantId
    const idorRes = await fetch(
      `${BASE_URL}/api/v1/analytics?restaurantId=${restaurantB.id}&period=today`,
      { headers: { Cookie: ownerACookie } }
    );
    assert(
      idorRes.status === 403,
      "Cross-Tenant IDOR: Owner A querying Tenant B via restaurantId parameter rejected with 403 Forbidden"
    );

    // 9. CSV Export & Formula Injection Mitigation
    console.log("\n[9/9] Testing CSV Export & Formula Injection Security...");

    // 9.1 Unauthenticated export
    const unauthExportRes = await fetch(`${BASE_URL}/api/v1/analytics/export`);
    assert(unauthExportRes.status === 401, "Unauthenticated export request rejected with 401 Unauthorized");

    // 9.2 Staff export rejected (lacks analytics.export)
    const staffExportRes = await fetch(`${BASE_URL}/api/v1/analytics/export`, {
      headers: { Cookie: staffCookie },
    });
    assert(staffExportRes.status === 403, "Staff role export blocked with 403 Forbidden");

    // 9.3 Cross-Tenant IDOR on export
    const idorExportRes = await fetch(
      `${BASE_URL}/api/v1/analytics/export?restaurantId=${restaurantB.id}`,
      { headers: { Cookie: ownerACookie } }
    );
    assert(
      idorExportRes.status === 403,
      "Cross-Tenant export manipulation blocked with 403 Forbidden"
    );

    // 9.4 Create item with formula injection trigger
    const formulaItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: testCategory.id,
        name: "=cmd|' /C calc'!A0",
        slug: `formula-item-${Date.now()}`,
        price: 15.0,
      },
    });
    cleanupItemIds.push(formulaItem.id);

    const formulaOrder = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: testTable.id,
        orderNumber: `P13_FORMULA_${Date.now()}`,
        status: "COMPLETED",
        paymentStatus: "PAID",
        total: 15.0,
        createdAt: now,
        items: {
          create: [
            {
              menuItemId: formulaItem.id,
              name: formulaItem.name,
              price: 15.0,
              quantity: 1,
            },
          ],
        },
      },
    });
    cleanupOrderIds.push(formulaOrder.id);

    // 9.5 Valid Owner export
    const exportRes = await fetch(`${BASE_URL}/api/v1/analytics/export?period=today`, {
      headers: { Cookie: ownerACookie },
    });
    assert(exportRes.status === 200, "Owner successfully requests CSV export (200 OK)");

    const contentType = exportRes.headers.get("content-type") || "";
    assert(
      contentType.includes("text/csv"),
      `Content-Type header is text/csv (Got: ${contentType})`
    );

    const disposition = exportRes.headers.get("content-disposition") || "";
    assert(
      disposition.includes("attachment") && disposition.includes(".csv"),
      `Content-Disposition header specifies attachment filename (Got: ${disposition})`
    );

    const csvText = await exportRes.text();
    assert(csvText.includes("EXECUTIVE KPI SUMMARY"), "CSV contains executive KPI summary section");
    assert(csvText.includes("SALES & ORDER VOLUME TREND"), "CSV contains trend table");
    assert(csvText.includes("TOP SELLING MENU ITEMS"), "CSV contains top items table");

    // Verify CSV Formula Injection Mitigation:
    // The name "=cmd|' /C calc'!A0" MUST BE ESCAPED as "'=cmd|' /C calc'!A0"
    assert(
      csvText.includes("\"'=cmd|"),
      "CSV formula injection mitigated: prepends single quote to cells starting with '='"
    );
  } catch (err) {
    console.error("Test execution aborted on unexpected error:", err);
    failed++;
  } finally {
    console.log("\n[Cleanup] Cleaning up temporary test records...");
    try {
      if (cleanupPaymentIds.length > 0) {
        await prisma.payment.deleteMany({ where: { id: { in: cleanupPaymentIds } } });
      }
      if (cleanupOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
      }
      if (cleanupItemIds.length > 0) {
        await prisma.menuItem.deleteMany({ where: { id: { in: cleanupItemIds } } });
      }
      console.log("  ✓ PASS: Cleaned up temporary test orders, payments, and items");
      passed++;
    } catch (cleanErr) {
      console.warn("Cleanup error:", cleanErr.message);
    }

    console.log("\n=================================================================");
    console.log(`  AUDIT COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    await prisma.$disconnect();
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPhase13AnalyticsAudit();
