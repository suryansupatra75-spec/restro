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

async function runPhase11CrmAudit() {
  console.log("=================================================================");
  console.log("  PHASE 11: CUSTOMER CRM & MANAGEMENT SECURITY & LOGIC AUDIT");
  console.log("=================================================================\n");

  try {
    // 0. Server Health Check
    console.log("[0/9] Checking server availability at " + BASE_URL + "...");
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE_URL}/login`);
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

    // 1. Setup Database Context for Multi-Tenant Isolation
    console.log("[1/9] Setting up test contexts for Tenant A and Tenant B...");
    const restaurantA = await prisma.restaurant.findFirst({
      where: { status: "ACTIVE" },
      include: {
        users: { include: { user: true } },
        tables: true,
      },
    });
    if (!restaurantA) throw new Error("No active restaurant found in database.");

    // Find Owner A
    const ownerAMembership = restaurantA.users.find((u) => u.role === "OWNER");
    const ownerAUser = ownerAMembership?.user;
    const ownerACookie = await createSessionCookie(ownerAUser.id, ownerAUser.email);
    assert(!!ownerACookie, `Owner A authenticated (${ownerAUser.email})`);

    // Ensure or find a Floor Staff user for Restaurant A (role: STAFF)
    let staffAMembership = restaurantA.users.find((u) => u.role === "STAFF");
    let staffAUser = staffAMembership?.user;
    if (!staffAUser) {
      staffAUser = await prisma.user.create({
        data: {
          name: "Floor Staff Alice",
          email: `p11_staff_${Date.now()}@test.com`,
          passwordHash: "hash_placeholder",
        },
      });
      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantA.id,
          userId: staffAUser.id,
          role: "STAFF",
          status: "ACTIVE",
        },
      });
    }
    const staffACookie = await createSessionCookie(staffAUser.id, staffAUser.email);
    assert(!!staffACookie, `Staff A authenticated (Role: STAFF)`);

    // Ensure or find a Kitchen Chef user for Restaurant A (role: KITCHEN)
    let kitchenAMembership = restaurantA.users.find((u) => u.role === "KITCHEN");
    let kitchenAUser = kitchenAMembership?.user;
    if (!kitchenAUser) {
      kitchenAUser = await prisma.user.create({
        data: {
          name: "Chef Gordon",
          email: `p11_kitchen_${Date.now()}@test.com`,
          passwordHash: "hash_placeholder",
        },
      });
      await prisma.restaurantUser.create({
        data: {
          restaurantId: restaurantA.id,
          userId: kitchenAUser.id,
          role: "KITCHEN",
          status: "ACTIVE",
        },
      });
    }
    const kitchenACookie = await createSessionCookie(kitchenAUser.id, kitchenAUser.email);
    assert(!!kitchenACookie, `Kitchen Chef authenticated (Role: KITCHEN)`);

    // Setup Tenant B for cross-tenant isolation testing
    let restaurantB = await prisma.restaurant.findFirst({
      where: { id: { not: restaurantA.id } },
      include: { users: { include: { user: true } }, tables: true },
    });
    let ownerBUser;
    if (!restaurantB) {
      ownerBUser = await prisma.user.create({
        data: {
          name: "Owner B",
          email: `p11_owner_b_${Date.now()}@test.com`,
          passwordHash: "hash_placeholder",
        },
      });
      restaurantB = await prisma.restaurant.create({
        data: {
          name: "Tenant B Bistro",
          slug: `tenant-b-${Date.now()}`,
          users: {
            create: {
              userId: ownerBUser.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
          tables: {
            create: { name: "B1", status: "ACTIVE" },
          },
        },
        include: { users: { include: { user: true } }, tables: true },
      });
    } else {
      ownerBUser = restaurantB.users[0]?.user;
      if (!ownerBUser) {
        ownerBUser = await prisma.user.create({
          data: {
            name: "Owner B",
            email: `p11_owner_b_${Date.now()}@test.com`,
            passwordHash: "hash_placeholder",
          },
        });
        await prisma.restaurantUser.create({
          data: {
            restaurantId: restaurantB.id,
            userId: ownerBUser.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        });
      }
    }
    const ownerBCookie = await createSessionCookie(ownerBUser.id, ownerBUser.email);
    assert(!!ownerBCookie, `Owner B authenticated for Tenant B (${restaurantB.name})`);

    // 2. Create Known Test Customers and Orders for Tenant A and Tenant B
    console.log("\n[2/9] Creating verified test customers & order history...");
    await prisma.customerNote.deleteMany({
      where: { customer: { name: { in: ["Samantha Miller", "David Cross-Tenant"] } } },
    });
    await prisma.order.deleteMany({
      where: { customer: { name: { in: ["Samantha Miller", "David Cross-Tenant"] } } },
    });
    await prisma.customer.deleteMany({
      where: { name: { in: ["Samantha Miller", "David Cross-Tenant"] } },
    });

    const customerA = await prisma.customer.create({
      data: {
        restaurantId: restaurantA.id,
        name: "Samantha Miller",
        phone: "+1 555-019-2834",
        email: "samantha.miller@example.com",
      },
    });

    const customerB = await prisma.customer.create({
      data: {
        restaurantId: restaurantB.id,
        name: "David Cross-Tenant",
        phone: "+1 555-999-0000",
        email: "david.tenantb@example.com",
      },
    });

    // Create 3 orders for Customer A:
    // Order 1: PAID ($50.00)
    // Order 2: PAID ($35.00)
    // Order 3: PENDING ($20.00, not paid yet)
    // Order 4: CANCELLED ($40.00)
    const tableA = restaurantA.tables[0] || (await prisma.table.create({
      data: { restaurantId: restaurantA.id, name: "T1", status: "ACTIVE" }
    }));

    const orderA1 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        customerId: customerA.id,
        orderNumber: `ORD-CRM-A1-${Date.now()}`,
        status: "COMPLETED",
        paymentStatus: "PAID",
        subtotal: 50,
        tax: 0,
        total: 50,
      },
    });

    const orderA2 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        customerId: customerA.id,
        orderNumber: `ORD-CRM-A2-${Date.now()}`,
        status: "COMPLETED",
        paymentStatus: "PAID",
        subtotal: 35,
        tax: 0,
        total: 35,
      },
    });

    const orderA3 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        customerId: customerA.id,
        orderNumber: `ORD-CRM-A3-${Date.now()}`,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal: 20,
        tax: 0,
        total: 20,
      },
    });

    const orderA4 = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        customerId: customerA.id,
        orderNumber: `ORD-CRM-A4-${Date.now()}`,
        status: "CANCELLED",
        paymentStatus: "FAILED",
        subtotal: 40,
        tax: 0,
        total: 40,
      },
    });

    assert(!!customerA.id && !!customerB.id, "Test customer records created in Tenant A and Tenant B");

    // 3. Customer List & Authoritative Metric Calculation Verification
    console.log("\n[3/9] Testing Customer List & Authoritative Metric Calculations...");
    const listRes = await fetch(`${BASE_URL}/api/v1/customers?search=Samantha`, {
      headers: { Cookie: ownerACookie },
    });
    const listData = await safeJson(listRes);

    assert(listRes.status === 200, "Owner can query customer list (200 OK)");
    assert(Array.isArray(listData.customers) && listData.customers.length >= 1, "Returns matching customer array");

    const samanthaItem = listData.customers.find((c) => c.id === customerA.id);
    assert(!!samanthaItem, "Customer record retrieved in list");
    // Samantha has 3 non-cancelled orders (A1, A2, A3) -> orderCount should be 3 (A4 is CANCELLED)
    assert(samanthaItem?.orderCount === 3, `Order count strictly excludes CANCELLED orders (Expected: 3, Got: ${samanthaItem?.orderCount})`);
    // Lifetime Spend strictly sums PAID orders (A1=$50 + A2=$35 = $85) -> PENDING ($20) and FAILED/CANCELLED ($40) excluded
    assert(samanthaItem?.lifetimeSpend === 85, `Lifetime spend strictly counts verified PAID orders only (Expected: 85, Got: ${samanthaItem?.lifetimeSpend})`);
    assert(samanthaItem?.paidOrderCount === 2, `Paid order count accurately reports 2 paid orders (Got: ${samanthaItem?.paidOrderCount})`);

    // 4. Role-Based Access Control & PII Masking Verification
    console.log("\n[4/9] Testing Role Permissions & Contact PII Masking...");

    // 4.1 Owner sees full unmasked contact details (has customers.viewContact)
    assert(samanthaItem?.phone === "+1 555-019-2834", "Owner sees unmasked phone number");
    assert(samanthaItem?.email === "samantha.miller@example.com", "Owner sees unmasked email address");
    assert(samanthaItem?.isContactMasked === false, "Owner response indicates isContactMasked: false");

    // 4.2 Floor Staff has customers.view but lacks customers.viewContact -> contact MUST BE MASKED
    const staffListRes = await fetch(`${BASE_URL}/api/v1/customers?search=Samantha`, {
      headers: { Cookie: staffACookie },
    });
    const staffListData = await safeJson(staffListRes);
    assert(staffListRes.status === 200, "Staff can access customer list (200 OK)");

    const staffSamanthaItem = staffListData.customers.find((c) => c.id === customerA.id);
    assert(staffSamanthaItem?.isContactMasked === true, "Staff response enforces isContactMasked: true");
    assert(staffSamanthaItem?.phone !== "+1 555-019-2834", "Staff cannot view raw phone number");
    assert(staffSamanthaItem?.phone?.includes("••"), "Phone number is securely masked for staff role");
    assert(staffSamanthaItem?.email !== "samantha.miller@example.com", "Staff cannot view raw email address");
    assert(staffSamanthaItem?.email?.includes("***"), "Email is securely masked for staff role");

    // 4.3 Kitchen Role has NO customer CRM permission -> MUST BE REJECTED WITH 403
    const kitchenListRes = await fetch(`${BASE_URL}/api/v1/customers`, {
      headers: { Cookie: kitchenACookie },
    });
    assert(kitchenListRes.status === 403, "Kitchen Chef is blocked from customer CRM API (403 Forbidden)");

    // 4.4 Unauthenticated request returns 401
    const unauthListRes = await fetch(`${BASE_URL}/api/v1/customers`);
    assert(unauthListRes.status === 401, "Unauthenticated request returns 401 Unauthorized");

    // 5. Customer Detail & Order History Verification
    console.log("\n[5/9] Testing Customer Detail & Order History...");
    const detailRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}`, {
      headers: { Cookie: ownerACookie },
    });
    const detailData = await safeJson(detailRes);

    assert(detailRes.status === 200, "Owner can fetch customer detail (200 OK)");
    assert(detailData.customer?.id === customerA.id, "Detail endpoint returns requested customer");
    assert(detailData.metrics?.lifetimeSpend === 85, "Detail metrics accurately report $85 lifetime spend");
    assert(detailData.metrics?.avgOrderValue === 42.5, "Detail metrics accurately calculate Average Order Value ($85 / 2 = $42.5)");
    assert(Array.isArray(detailData.orders) && detailData.orders.length === 4, "Detail returns complete 4 orders history");

    const orderNumbers = detailData.orders.map((o) => o.orderNumber);
    assert(orderNumbers.includes(orderA1.orderNumber), "Order history contains Order 1");
    assert(orderNumbers.includes(orderA2.orderNumber), "Order history contains Order 2");

    // 6. Internal Customer Notes & XSS Sanitization
    console.log("\n[6/9] Testing Internal Customer Notes & Security...");

    // 6.1 Kitchen cannot post notes -> 403
    const kitchenNoteRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: kitchenACookie,
      },
      body: JSON.stringify({ content: "Unauthorized note" }),
    });
    assert(kitchenNoteRes.status === 403, "Kitchen role cannot post customer notes (403 Forbidden)");

    // 6.2 Staff cannot post notes -> 403 (requires customers.manageNotes)
    const staffNoteRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: staffACookie,
      },
      body: JSON.stringify({ content: "Staff note attempt" }),
    });
    assert(staffNoteRes.status === 403, "Staff role cannot post customer notes (403 Forbidden)");

    // 6.3 Owner posts note with attempted XSS payload -> HTML tags stripped
    const xssPayload = "<script>alert('pwned')</script>VIP Guest - prefers booth seating <img src=x onerror=alert(1)>";
    const postNoteRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerACookie,
      },
      body: JSON.stringify({ content: xssPayload }),
    });
    const postNoteData = await safeJson(postNoteRes);

    assert(postNoteRes.status === 200, "Owner can post customer note (200 OK)");
    assert(postNoteData.note?.content && !postNoteData.note.content.includes("<script>"), "HTML/script tags sanitized from note content");
    assert(!postNoteData.note.content.includes("<img"), "Img tags stripped from note content");
    assert(postNoteData.note.authorName === ownerAUser.name, "Note author recorded correctly");

    const noteId = postNoteData.note.id;

    // 6.4 Delete Note
    const deleteNoteRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}/notes/${noteId}`, {
      method: "DELETE",
      headers: { Cookie: ownerACookie },
    });
    assert(deleteNoteRes.status === 200, "Owner can delete customer note (200 OK)");

    // Verify deleted
    const verifyDetailRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}`, {
      headers: { Cookie: ownerACookie },
    });
    const verifyDetailData = await safeJson(verifyDetailRes);
    assert(!verifyDetailData.notes.some((n) => n.id === noteId), "Note successfully removed from customer history");

    // 7. Multi-Tenant Isolation & IDOR Defense (Tenant A vs Tenant B)
    console.log("\n[7/9] Testing Multi-Tenant Isolation & Cross-Tenant IDOR...");

    // 7.1 Owner B listing customers -> MUST NOT contain Customer A
    const tenantBListRes = await fetch(`${BASE_URL}/api/v1/customers`, {
      headers: { Cookie: ownerBCookie },
    });
    const tenantBListData = await safeJson(tenantBListRes);
    const hasCustomerAInTenantB = (tenantBListData.customers || []).some((c) => c.id === customerA.id);
    assert(tenantBListRes.status === 200 && !hasCustomerAInTenantB, "Tenant B customer list contains NO customers from Tenant A");

    // 7.2 Owner A listing customers -> MUST NOT contain Customer B
    const tenantAListRes = await fetch(`${BASE_URL}/api/v1/customers`, {
      headers: { Cookie: ownerACookie },
    });
    const tenantAListData = await safeJson(tenantAListRes);
    const hasCustomerBInTenantA = (tenantAListData.customers || []).some((c) => c.id === customerB.id);
    assert(!hasCustomerBInTenantA, "Tenant A customer list contains NO customers from Tenant B");

    // 7.3 Cross-Tenant IDOR: Owner B attempts to view Customer A's detail -> MUST BE 404
    const idorDetailRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}`, {
      headers: { Cookie: ownerBCookie },
    });
    assert(idorDetailRes.status === 404, "Cross-Tenant IDOR: Owner B querying Tenant A customer returns 404 Not Found");

    // 7.4 Cross-Tenant IDOR: Owner B attempts to post note on Customer A -> MUST BE 404
    const idorNoteRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerBCookie,
      },
      body: JSON.stringify({ content: "Malicious cross-tenant note" }),
    });
    assert(idorNoteRes.status === 404, "Cross-Tenant IDOR: Owner B cannot add notes to Tenant A customer (404 Not Found)");

    // 7.5 Cross-Tenant IDOR: Owner B attempts to update Customer A -> MUST BE 404
    const idorPatchRes = await fetch(`${BASE_URL}/api/v1/customers/${customerA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerBCookie,
      },
      body: JSON.stringify({ name: "Tampered Name" }),
    });
    assert(idorPatchRes.status === 404, "Cross-Tenant IDOR: Owner B cannot modify Tenant A customer (404 Not Found)");

    // 8. Name Match Anti-Merge Rule & Server-Side Pagination
    console.log("\n[8/9] Testing Anti-Merge Integrity & Pagination...");

    // Create another customer with the SAME NAME "Samantha Miller" but no matching phone/email
    const samanthaDuplicate = await prisma.customer.create({
      data: {
        restaurantId: restaurantA.id,
        name: "Samantha Miller",
        phone: "+1 555-099-8877", // Different phone
        email: "samantha2@other.com", // Different email
      },
    });

    const verifyAntiMergeRes = await fetch(`${BASE_URL}/api/v1/customers?search=Samantha`, {
      headers: { Cookie: ownerACookie },
    });
    const verifyAntiMergeData = await safeJson(verifyAntiMergeRes);
    const samanthaProfiles = (verifyAntiMergeData.customers || []).filter((c) => c.name === "Samantha Miller");
    assert(samanthaProfiles.length === 2, "Matching names alone DO NOT merge into a single profile (Separate records preserved)");

    // Test Server-Side Pagination
    const page1Res = await fetch(`${BASE_URL}/api/v1/customers?page=1&limit=1`, {
      headers: { Cookie: ownerACookie },
    });
    const page1Data = await safeJson(page1Res);
    assert(page1Data.pagination?.page === 1 && page1Data.customers?.length === 1, "Server-side pagination limits results per page (limit: 1)");

    // 9. Clean-up Test Records
    console.log("\n[9/9] Cleaning up test customer & order records...");
    await prisma.customerNote.deleteMany({
      where: { customerId: { in: [customerA.id, customerB.id, samanthaDuplicate.id] } },
    });
    await prisma.order.deleteMany({
      where: { id: { in: [orderA1.id, orderA2.id, orderA3.id, orderA4.id] } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerA.id, customerB.id, samanthaDuplicate.id] } },
    });
    assert(true, "Test records cleaned up safely");

    console.log("\n=================================================================");
    console.log(`  AUDIT COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test Suite Execution Failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase11CrmAudit();
