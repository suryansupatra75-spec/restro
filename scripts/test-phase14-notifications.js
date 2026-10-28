const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const crypto = require("crypto");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const JWT_SECRET =
  process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const RAZORPAY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "rzp_test_secret_dev_key_2026";
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

async function runPhase14NotificationsAudit() {
  console.log(
    "======================================================================="
  );
  console.log(
    "  PHASE 14: NOTIFICATIONS & REAL-TIME UPDATES SECURITY & LOGIC AUDIT"
  );
  console.log(
    "=======================================================================\n"
  );

  const suffix = Date.now();
  const cleanupRestaurantIds = [];
  const cleanupUserIds = [];

  try {
    // -------------------------------------------------------------------------
    // 1. UNAUTHENTICATED ACCESS & SECURITY HEADERS
    // -------------------------------------------------------------------------
    console.log("1. Testing Unauthenticated Access & Security Headers...");

    const unauthList = await fetch(`${BASE_URL}/api/v1/notifications`);
    assert(
      unauthList.status === 401,
      "Unauthenticated GET /api/v1/notifications returns 401",
      `Got ${unauthList.status}`
    );

    const unauthRead = await fetch(
      `${BASE_URL}/api/v1/notifications/fake-id/read`,
      { method: "PATCH" }
    );
    assert(
      unauthRead.status === 401,
      "Unauthenticated PATCH /api/v1/notifications/[id]/read returns 401",
      `Got ${unauthRead.status}`
    );

    const unauthReadAll = await fetch(
      `${BASE_URL}/api/v1/notifications/read-all`,
      { method: "POST" }
    );
    assert(
      unauthReadAll.status === 401,
      "Unauthenticated POST /api/v1/notifications/read-all returns 401",
      `Got ${unauthReadAll.status}`
    );

    const unauthPrefsGet = await fetch(
      `${BASE_URL}/api/v1/notifications/preferences`
    );
    assert(
      unauthPrefsGet.status === 401,
      "Unauthenticated GET /api/v1/notifications/preferences returns 401",
      `Got ${unauthPrefsGet.status}`
    );

    const unauthPrefsPut = await fetch(
      `${BASE_URL}/api/v1/notifications/preferences`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCreated: false }),
      }
    );
    assert(
      unauthPrefsPut.status === 401,
      "Unauthenticated PUT /api/v1/notifications/preferences returns 401",
      `Got ${unauthPrefsPut.status}`
    );

    // -------------------------------------------------------------------------
    // 2. MULTI-TENANT & ROLE PROVISIONING (TENANT A + TENANT B)
    // -------------------------------------------------------------------------
    console.log("\n2. Provisioning Tenant A (4 Roles) & Tenant B (Competitor)...");

    const restA = await prisma.restaurant.create({
      data: {
        name: `Phase14 Bistro A ${suffix}`,
        slug: `p14-bistro-a-${suffix}`,
        currency: "USD",
        taxPercentage: 10,
      },
    });
    cleanupRestaurantIds.push(restA.id);

    const restB = await prisma.restaurant.create({
      data: {
        name: `Phase14 Bistro B ${suffix}`,
        slug: `p14-bistro-b-${suffix}`,
        currency: "USD",
      },
    });
    cleanupRestaurantIds.push(restB.id);

    async function createRoleUser(restaurantId, roleLabel, emailPrefix) {
      const user = await prisma.user.create({
        data: {
          name: `${roleLabel} User`,
          email: `${emailPrefix}-${suffix}@test.local`,
          passwordHash: "hashed_pw",
        },
      });
      cleanupUserIds.push(user.id);
      const membership = await prisma.restaurantUser.create({
        data: {
          restaurantId,
          userId: user.id,
          role: roleLabel,
          status: "ACTIVE",
        },
      });
      const cookie = await createSessionCookie(user.id, user.email);
      return { user, membership, cookie };
    }

    const ownerA = await createRoleUser(restA.id, "OWNER", "p14-owner-a");
    const managerA = await createRoleUser(restA.id, "MANAGER", "p14-manager-a");
    const staffA = await createRoleUser(restA.id, "STAFF", "p14-staff-a");
    const kitchenA = await createRoleUser(restA.id, "KITCHEN", "p14-kitchen-a");
    const ownerB = await createRoleUser(restB.id, "OWNER", "p14-owner-b");

    // Verify initial notification feed & Cache-Control header
    const initOwnerRes = await fetch(`${BASE_URL}/api/v1/notifications`, {
      headers: { Cookie: ownerA.cookie },
    });
    const initOwnerJson = await safeJson(initOwnerRes);
    const cacheControl = initOwnerRes.headers.get("cache-control") || "";

    assert(
      initOwnerRes.status === 200 && initOwnerJson.unreadCount === 0,
      "Initial notification feed for Tenant A OWNER is empty (unreadCount = 0)",
      `status=${initOwnerRes.status}, unread=${initOwnerJson.unreadCount}`
    );
    assert(
      cacheControl.includes("no-store") && cacheControl.includes("private"),
      "GET /api/v1/notifications sets Cache-Control: private, no-store",
      `Got: ${cacheControl}`
    );

    // -------------------------------------------------------------------------
    // 3. EVENT 1: ORDER_CREATED & ROLE PAYLOAD MINIMIZATION
    // -------------------------------------------------------------------------
    console.log(
      "\n3. Testing ORDER_CREATED Trigger & Role-Scoped Payload Minimization..."
    );

    const categoryA = await prisma.menuCategory.create({
      data: {
        restaurantId: restA.id,
        name: "Mains",
      },
    });

    const menuItemA = await prisma.menuItem.create({
      data: {
        restaurantId: restA.id,
        categoryId: categoryA.id,
        name: "Truffle Pasta",
        slug: `truffle-pasta-${suffix}`,
        price: 25.0,
        isAvailable: true,
        status: "ACTIVE",
      },
    });

    const tableA = await prisma.table.create({
      data: {
        restaurantId: restA.id,
        number: "T1",
        name: "Table 1",
        capacity: 4,
        status: "ACTIVE",
      },
    });

    const qrTokenA = `qr-p14-${suffix}`;
    await prisma.qRCode.create({
      data: {
        restaurantId: restA.id,
        tableId: tableA.id,
        token: qrTokenA,
        url: `${BASE_URL}/q/${qrTokenA}`,
        status: "ACTIVE",
      },
    });

    // Place customer order via POST /api/v1/orders
    const orderCreateRes = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: qrTokenA,
        customerName: "Alice Gourmet",
        customerPhone: "+15550199",
        items: [{ menuItemId: menuItemA.id, quantity: 2 }],
      }),
    });
    const orderCreateJson = await safeJson(orderCreateRes);
    assert(
      orderCreateRes.status === 201 && orderCreateJson.order?.id,
      "Customer order placed via POST /api/v1/orders",
      `status=${orderCreateRes.status}`
    );
    const orderId = orderCreateJson.order.id;
    const orderNumber = orderCreateJson.order.orderNumber;

    // Check OWNER notifications
    const ownerNotifs1 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    const ownerOrderNotif = ownerNotifs1.notifications.find(
      (n) => n.eventType === "ORDER_CREATED" && n.entityId === orderId
    );
    assert(
      Boolean(ownerOrderNotif) && ownerNotifs1.unreadCount === 1,
      "OWNER receives ORDER_CREATED notification with unreadCount = 1"
    );
    assert(
      ownerOrderNotif?.actionUrl === "/dashboard/orders" &&
        ownerOrderNotif?.metadata?.totalAmount === 55,
      "OWNER ORDER_CREATED notification includes financial totalAmount ($55.00) and links to /dashboard/orders",
      JSON.stringify(ownerOrderNotif)
    );

    // Check KITCHEN notifications (Role Payload Minimization!)
    const kitchenNotifs1 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: kitchenA.cookie },
      })
    );
    const kitchenOrderNotif = kitchenNotifs1.notifications.find(
      (n) => n.eventType === "ORDER_CREATED" && n.entityId === orderId
    );
    assert(
      Boolean(kitchenOrderNotif) && kitchenNotifs1.unreadCount === 1,
      "KITCHEN receives ORDER_CREATED notification"
    );
    assert(
      kitchenOrderNotif?.actionUrl === "/dashboard/kitchen" &&
        kitchenOrderNotif?.metadata?.totalAmount === undefined &&
        kitchenOrderNotif?.metadata?.customerName === undefined &&
        !kitchenOrderNotif?.message?.includes("$55"),
      "KITCHEN ORDER_CREATED notification strips financial totalAmount & customer PII and routes to /dashboard/kitchen",
      JSON.stringify(kitchenOrderNotif)
    );

    // Check Tenant B isolation
    const ownerBNotifs = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: ownerB.cookie },
      })
    );
    assert(
      ownerBNotifs.unreadCount === 0 && ownerBNotifs.notifications.length === 0,
      "Tenant B OWNER receives 0 notifications from Tenant A's order"
    );

    // -------------------------------------------------------------------------
    // 4. EVENT 2: ORDER_STATUS_CHANGED
    // -------------------------------------------------------------------------
    console.log("\n4. Testing ORDER_STATUS_CHANGED Lifecycle Notifications...");

    const patchAcceptedRes = await fetch(
      `${BASE_URL}/api/v1/orders/admin/${orderId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: staffA.cookie,
        },
        body: JSON.stringify({ status: "ACCEPTED" }),
      }
    );
    assert(
      patchAcceptedRes.status === 200,
      "Order transitioned PENDING -> ACCEPTED"
    );

    const patchPreparingRes = await fetch(
      `${BASE_URL}/api/v1/orders/admin/${orderId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: kitchenA.cookie,
        },
        body: JSON.stringify({ status: "PREPARING" }),
      }
    );
    assert(
      patchPreparingRes.status === 200,
      "Order transitioned ACCEPTED -> PREPARING"
    );

    const patchReadyRes = await fetch(
      `${BASE_URL}/api/v1/orders/admin/${orderId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: kitchenA.cookie,
        },
        body: JSON.stringify({ status: "READY" }),
      }
    );
    assert(
      patchReadyRes.status === 200,
      "Order transitioned PREPARING -> READY"
    );

    const ownerNotifs2 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    const statusNotifs = ownerNotifs2.notifications.filter(
      (n) => n.eventType === "ORDER_STATUS_CHANGED" && n.entityId === orderId
    );
    const readyNotif = statusNotifs.find(
      (n) => n.metadata?.newStatus === "READY"
    );
    assert(
      statusNotifs.length === 3 && readyNotif?.priority === "HIGH",
      "3 distinct ORDER_STATUS_CHANGED notifications created (ACCEPTED, PREPARING, READY with HIGH priority)",
      `count=${statusNotifs.length}, readyPriority=${readyNotif?.priority}`
    );

    // -------------------------------------------------------------------------
    // 5. EVENT 3: PAYMENT_STATUS_CHANGED & ROLE BOUNDARY
    // -------------------------------------------------------------------------
    console.log(
      "\n5. Testing PAYMENT_STATUS_CHANGED (Verified Failure & Success + KITCHEN Exclusion)..."
    );

    const payCreateRes = await fetch(`${BASE_URL}/api/v1/payments/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        token: qrTokenA,
        method: "ONLINE",
      }),
    });
    const payCreateJson = await safeJson(payCreateRes);
    const paymentId = payCreateJson.payment?.paymentId;
    const providerOrderId = payCreateJson.payment?.providerOrderId;
    assert(
      payCreateRes.status === 200 && Boolean(paymentId),
      "Created PENDING online payment record"
    );

    // Verify PENDING payment creation did NOT trigger PAYMENT_STATUS_CHANGED yet
    const ownerBeforeVerify = await safeJson(
      await fetch(
        `${BASE_URL}/api/v1/notifications?eventType=PAYMENT_STATUS_CHANGED`,
        {
          headers: { Cookie: ownerA.cookie },
        }
      )
    );
    assert(
      ownerBeforeVerify.notifications.length === 0,
      "Unverified PENDING payment creation does NOT emit premature PAYMENT_STATUS_CHANGED notification"
    );

    // Attempt verification with forged signature -> triggers FAILED payment notification
    const badVerifyRes = await fetch(`${BASE_URL}/api/v1/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId,
        orderId,
        token: qrTokenA,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: `pay_bad_${suffix}`,
        razorpay_signature: "0000deadbeefinvalid",
      }),
    });
    assert(
      badVerifyRes.status === 400,
      "Forged payment signature rejected with 400"
    );

    const ownerAfterFail = await safeJson(
      await fetch(
        `${BASE_URL}/api/v1/notifications?eventType=PAYMENT_STATUS_CHANGED`,
        {
          headers: { Cookie: ownerA.cookie },
        }
      )
    );
    const failPaymentNotif = ownerAfterFail.notifications.find(
      (n) => n.entityId === paymentId && n.metadata?.status === "FAILED"
    );
    assert(
      Boolean(failPaymentNotif) && failPaymentNotif.priority === "HIGH",
      "Verified FAILED payment emits HIGH priority PAYMENT_STATUS_CHANGED notification to OWNER"
    );

    // Now verify with valid HMAC signature -> triggers PAID payment notification
    const validPaymentId = `pay_ok_${suffix}`;
    const validSig = crypto
      .createHmac("sha256", RAZORPAY_SECRET)
      .update(`${providerOrderId}|${validPaymentId}`)
      .digest("hex");

    const goodVerifyRes = await fetch(`${BASE_URL}/api/v1/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId,
        orderId,
        token: qrTokenA,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: validPaymentId,
        razorpay_signature: validSig,
      }),
    });
    assert(
      goodVerifyRes.status === 200,
      "Valid HMAC signature verifies payment as PAID"
    );

    // Re-send identical verify request to test notification deduplication
    await fetch(`${BASE_URL}/api/v1/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId,
        orderId,
        token: qrTokenA,
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: validPaymentId,
        razorpay_signature: validSig,
      }),
    });

    const ownerAfterPaid = await safeJson(
      await fetch(
        `${BASE_URL}/api/v1/notifications?eventType=PAYMENT_STATUS_CHANGED`,
        {
          headers: { Cookie: ownerA.cookie },
        }
      )
    );
    const paidNotifs = ownerAfterPaid.notifications.filter(
      (n) => n.entityId === paymentId && n.metadata?.status === "PAID"
    );
    assert(
      paidNotifs.length === 1,
      "Verified PAID payment emits exactly 1 deduplicated PAYMENT_STATUS_CHANGED notification to OWNER",
      `count=${paidNotifs.length}`
    );
    assert(
      !JSON.stringify(paidNotifs[0]).includes(validSig),
      "Payment notification payload never leaks raw gateway signatures or secrets"
    );

    // Verify KITCHEN never receives PAYMENT_STATUS_CHANGED notifications
    const kitchenPaymentNotifs = await safeJson(
      await fetch(
        `${BASE_URL}/api/v1/notifications?eventType=PAYMENT_STATUS_CHANGED`,
        {
          headers: { Cookie: kitchenA.cookie },
        }
      )
    );
    assert(
      kitchenPaymentNotifs.notifications.length === 0,
      "KITCHEN role receives 0 PAYMENT_STATUS_CHANGED notifications (enforced by payments.view permission)"
    );

    // -------------------------------------------------------------------------
    // 6. EVENT 4: INVENTORY_LOW & SPAM DEDUPLICATION
    // -------------------------------------------------------------------------
    console.log(
      "\n6. Testing INVENTORY_LOW Threshold Crossing & Spam Deduplication..."
    );

    const invCreateRes = await fetch(`${BASE_URL}/api/v1/inventory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerA.cookie,
      },
      body: JSON.stringify({
        name: `Fresh Basil ${suffix}`,
        sku: `BASIL-${suffix}`,
        category: "Produce",
        unit: "KILOGRAM",
        openingStock: 10,
        lowStockThreshold: 5,
        costPerUnit: 8,
      }),
    });
    const invCreateJson = await safeJson(invCreateRes);
    const invItemId = invCreateJson.item?.id;
    assert(
      invCreateRes.status === 201 && Boolean(invItemId),
      "Created inventory item with stock 10 KG and threshold 5 KG"
    );

    // Deduct 6 KG -> balance becomes 4 KG (<= 5 KG -> LOW_STOCK)
    const move1Res = await fetch(
      `${BASE_URL}/api/v1/inventory/movements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: managerA.cookie,
        },
        body: JSON.stringify({
          itemId: invItemId,
          type: "WASTE",
          quantity: 6,
          unit: "KILOGRAM",
          reason: "Morning prep",
        }),
      }
    );
    assert(move1Res.status === 201, "Recorded USAGE of 6 KG (stock now 4 KG)");

    const ownerInvNotifs1 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications?category=INVENTORY`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    assert(
      ownerInvNotifs1.notifications.length === 1 &&
        ownerInvNotifs1.notifications[0].priority === "HIGH" &&
        ownerInvNotifs1.notifications[0].metadata?.stockState === "LOW_STOCK",
      "Crossing into LOW_STOCK (4 <= 5) triggers HIGH priority INVENTORY_LOW notification",
      JSON.stringify(ownerInvNotifs1.notifications)
    );

    // Deduct another 1 KG -> balance becomes 3 KG (still LOW_STOCK on same day -> should deduplicate!)
    await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: managerA.cookie,
      },
      body: JSON.stringify({
        itemId: invItemId,
        type: "WASTE",
        quantity: 1,
        unit: "KILOGRAM",
        reason: "Afternoon prep",
      }),
    });

    const ownerInvNotifs2 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications?category=INVENTORY`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    assert(
      ownerInvNotifs2.notifications.length === 1,
      "Repeated minor stock movement within LOW_STOCK state is deduplicated (no notification spam)"
    );

    // Deduct remaining 3 KG -> balance becomes 0 KG (OUT_OF_STOCK -> new URGENT alert!)
    await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: managerA.cookie,
      },
      body: JSON.stringify({
        itemId: invItemId,
        type: "WASTE",
        quantity: 3,
        unit: "KILOGRAM",
        reason: "Dinner rush depletion",
      }),
    });

    const ownerInvNotifs3 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications?category=INVENTORY`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    const outOfStockNotif = ownerInvNotifs3.notifications.find(
      (n) => n.metadata?.stockState === "OUT_OF_STOCK"
    );
    assert(
      ownerInvNotifs3.notifications.length === 2 &&
        Boolean(outOfStockNotif) &&
        outOfStockNotif.priority === "URGENT",
      "Depleting stock to 0 triggers distinct URGENT Out-of-Stock notification"
    );

    // -------------------------------------------------------------------------
    // 7. EVENT 5: STAFF_ACCESS_CHANGED & ROLE BOUNDARY
    // -------------------------------------------------------------------------
    console.log(
      "\n7. Testing STAFF_ACCESS_CHANGED & Role Visibility (OWNER/MANAGER only)..."
    );

    const inviteRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerA.cookie,
      },
      body: JSON.stringify({
        email: `new-chef-${suffix}@test.local`,
        role: "KITCHEN",
      }),
    });
    assert(inviteRes.status === 200, "Created staff invitation");

    const managerStaffNotifs = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications?category=STAFF`, {
        headers: { Cookie: managerA.cookie },
      })
    );
    assert(
      managerStaffNotifs.notifications.length === 1 &&
        managerStaffNotifs.notifications[0].eventType ===
          "STAFF_ACCESS_CHANGED",
      "MANAGER (with staff.view) receives STAFF_ACCESS_CHANGED notification"
    );

    const staffRoleStaffNotifs = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications?category=STAFF`, {
        headers: { Cookie: staffA.cookie },
      })
    );
    const kitchenRoleStaffNotifs = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications?category=STAFF`, {
        headers: { Cookie: kitchenA.cookie },
      })
    );
    assert(
      staffRoleStaffNotifs.notifications.length === 0 &&
        kitchenRoleStaffNotifs.notifications.length === 0,
      "STAFF and KITCHEN (without staff.view) receive 0 STAFF_ACCESS_CHANGED notifications"
    );

    // -------------------------------------------------------------------------
    // 8. QUERY VALIDATION, CURSOR, MARK READ & MARK ALL READ
    // -------------------------------------------------------------------------
    console.log(
      "\n8. Testing Query Validation, Cursor Polling, Mark Read & Mark All Read..."
    );

    const badQueryRes = await fetch(
      `${BASE_URL}/api/v1/notifications?limit=500`,
      {
        headers: { Cookie: ownerA.cookie },
      }
    );
    assert(
      badQueryRes.status === 400,
      "Out-of-bounds limit=500 rejected with 400 Bad Request"
    );

    const badSinceRes = await fetch(
      `${BASE_URL}/api/v1/notifications?since=not-a-timestamp`,
      {
        headers: { Cookie: ownerA.cookie },
      }
    );
    assert(
      badSinceRes.status === 400,
      "Malformed 'since' cursor rejected with 400 Bad Request"
    );

    // Test marking a single notification read for OWNER
    const ownerListBeforeRead = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    const totalOwnerUnread = ownerListBeforeRead.unreadCount;
    const targetNotifId = ownerListBeforeRead.notifications[0].id;

    // Cross-user IDOR check: STAFF in same restaurant tries to mark OWNER's notification read
    const crossUserReadRes = await fetch(
      `${BASE_URL}/api/v1/notifications/${targetNotifId}/read`,
      {
        method: "PATCH",
        headers: { Cookie: staffA.cookie },
      }
    );
    assert(
      crossUserReadRes.status === 403,
      "Cross-user IDOR blocked: STAFF cannot mark OWNER's notification as read (403 Forbidden)",
      `Got ${crossUserReadRes.status}`
    );

    // Cross-tenant IDOR check: Tenant B OWNER tries to mark Tenant A OWNER's notification read
    const crossTenantReadRes = await fetch(
      `${BASE_URL}/api/v1/notifications/${targetNotifId}/read`,
      {
        method: "PATCH",
        headers: { Cookie: ownerB.cookie },
      }
    );
    assert(
      crossTenantReadRes.status === 403,
      "Cross-tenant IDOR blocked: Tenant B OWNER cannot mark Tenant A notification as read (403 Forbidden)",
      `Got ${crossTenantReadRes.status}`
    );

    // Cross-tenant query spoofing check
    const crossTenantListRes = await fetch(
      `${BASE_URL}/api/v1/notifications?restaurantId=${restA.id}`,
      {
        headers: { Cookie: ownerB.cookie },
      }
    );
    assert(
      crossTenantListRes.status === 403,
      "Cross-tenant query spoofing blocked: Tenant B OWNER cannot query Tenant A notifications (403 Forbidden)",
      `Got ${crossTenantListRes.status}`
    );

    // Legitimate mark single read by OWNER
    const markReadRes = await fetch(
      `${BASE_URL}/api/v1/notifications/${targetNotifId}/read`,
      {
        method: "PATCH",
        headers: { Cookie: ownerA.cookie },
      }
    );
    const markReadJson = await safeJson(markReadRes);
    assert(
      markReadRes.status === 200 &&
        markReadJson.notification?.isRead === true &&
        Boolean(markReadJson.notification?.readAt) &&
        markReadJson.unreadCount === totalOwnerUnread - 1,
      "PATCH /api/v1/notifications/[id]/read marks notification read and decrements unreadCount by 1",
      `expected=${totalOwnerUnread - 1}, got=${markReadJson.unreadCount}`
    );

    // Idempotent repeat mark single read
    const markReadRepeatRes = await fetch(
      `${BASE_URL}/api/v1/notifications/${targetNotifId}/read`,
      {
        method: "PATCH",
        headers: { Cookie: ownerA.cookie },
      }
    );
    const markReadRepeatJson = await safeJson(markReadRepeatRes);
    assert(
      markReadRepeatRes.status === 200 &&
        markReadRepeatJson.unreadCount === totalOwnerUnread - 1,
      "Repeating PATCH /api/v1/notifications/[id]/read is idempotent"
    );

    // Mark All Read for OWNER
    const markAllRes = await fetch(
      `${BASE_URL}/api/v1/notifications/read-all`,
      {
        method: "POST",
        headers: { Cookie: ownerA.cookie },
      }
    );
    const markAllJson = await safeJson(markAllRes);
    assert(
      markAllRes.status === 200 && markAllJson.unreadCount === 0,
      "POST /api/v1/notifications/read-all sets OWNER unreadCount to 0"
    );

    // Verify MANAGER's unread notifications were NOT affected by OWNER's mark-all-read
    const managerListCheck = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: managerA.cookie },
      })
    );
    assert(
      managerListCheck.unreadCount > 0,
      "OWNER's mark-all-read does NOT affect MANAGER's unread notifications",
      `managerUnread=${managerListCheck.unreadCount}`
    );

    // -------------------------------------------------------------------------
    // 9. NOTIFICATION PREFERENCES & OPT-OUT ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log(
      "\n9. Testing Notification Preferences Persistence & Opt-Out Enforcement..."
    );

    // Manager opts out of orderCreated
    const prefUpdateRes = await fetch(
      `${BASE_URL}/api/v1/notifications/preferences`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: managerA.cookie,
        },
        body: JSON.stringify({
          orderCreated: false,
          soundEnabled: false,
        }),
      }
    );
    const prefUpdateJson = await safeJson(prefUpdateRes);
    assert(
      prefUpdateRes.status === 200 &&
        prefUpdateJson.preferences?.orderCreated === false &&
        prefUpdateJson.preferences?.soundEnabled === false,
      "PUT /api/v1/notifications/preferences persists orderCreated=false and soundEnabled=false for MANAGER"
    );

    // Place a second order in Tenant A
    const order2Res = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: qrTokenA,
        customerName: "Bob Diner",
        items: [{ menuItemId: menuItemA.id, quantity: 1 }],
      }),
    });
    const order2Json = await safeJson(order2Res);
    const order2Id = order2Json.order?.id;
    assert(
      order2Res.status === 201 && Boolean(order2Id),
      "Placed second order in Tenant A"
    );

    // Verify OWNER (opted-in) received ORDER_CREATED for order2, while MANAGER (opted-out) did NOT
    const ownerAfterOrder2 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: ownerA.cookie },
      })
    );
    const managerAfterOrder2 = await safeJson(
      await fetch(`${BASE_URL}/api/v1/notifications`, {
        headers: { Cookie: managerA.cookie },
      })
    );
    const ownerGotOrder2 = ownerAfterOrder2.notifications.some(
      (n) => n.eventType === "ORDER_CREATED" && n.entityId === order2Id
    );
    const managerGotOrder2 = managerAfterOrder2.notifications.some(
      (n) => n.eventType === "ORDER_CREATED" && n.entityId === order2Id
    );
    assert(
      ownerGotOrder2 === true && managerGotOrder2 === false,
      "Preference enforcement: OWNER receives new ORDER_CREATED while opted-out MANAGER does not",
      `ownerGot=${ownerGotOrder2}, managerGot=${managerGotOrder2}`
    );

    // -------------------------------------------------------------------------
    // 10. DYNAMIC ROLE DOWNGRADE & DISABLED STAFF REVOCATION
    // -------------------------------------------------------------------------
    console.log(
      "\n10. Testing Dynamic Role Downgrade Filtering & Disabled Staff Revocation..."
    );

    // Before downgrade, STAFF can see PAYMENT_STATUS_CHANGED notifications
    const staffBeforeDowngrade = await safeJson(
      await fetch(
        `${BASE_URL}/api/v1/notifications?eventType=PAYMENT_STATUS_CHANGED`,
        {
          headers: { Cookie: staffA.cookie },
        }
      )
    );
    assert(
      staffBeforeDowngrade.notifications.length >= 2,
      "Before role change, STAFF sees historical PAYMENT_STATUS_CHANGED notifications"
    );

    // OWNER downgrades STAFF user to KITCHEN role
    const downgradeRes = await fetch(
      `${BASE_URL}/api/v1/staff/${staffA.membership.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: ownerA.cookie,
        },
        body: JSON.stringify({ role: "KITCHEN" }),
      }
    );
    assert(downgradeRes.status === 200, "Downgraded STAFF user to KITCHEN role");

    // Now when that same user queries notifications, PAYMENT_STATUS_CHANGED is dynamically filtered out!
    const staffAfterDowngrade = await safeJson(
      await fetch(
        `${BASE_URL}/api/v1/notifications?eventType=PAYMENT_STATUS_CHANGED`,
        {
          headers: { Cookie: staffA.cookie },
        }
      )
    );
    assert(
      staffAfterDowngrade.notifications.length === 0,
      "After downgrade to KITCHEN, historical PAYMENT_STATUS_CHANGED notifications are dynamically hidden"
    );

    // OWNER disables kitchenA account -> verify immediate 403 on notification feed
    const disableRes = await fetch(
      `${BASE_URL}/api/v1/staff/${kitchenA.membership.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: ownerA.cookie,
        },
        body: JSON.stringify({ status: "DISABLED" }),
      }
    );
    assert(disableRes.status === 200, "Disabled KITCHEN staff membership");

    const disabledNotifRes = await fetch(`${BASE_URL}/api/v1/notifications`, {
      headers: { Cookie: kitchenA.cookie },
    });
    assert(
      disabledNotifRes.status === 403,
      "Disabled staff member is immediately blocked from GET /api/v1/notifications (403 Forbidden)",
      `Got ${disabledNotifRes.status}`
    );
  } catch (err) {
    console.error("UNEXPECTED TEST SUITE ERROR:", err);
    failed++;
  } finally {
    // Cleanup test tenants and users
    if (cleanupRestaurantIds.length > 0) {
      await prisma.restaurant.deleteMany({
        where: { id: { in: cleanupRestaurantIds } },
      });
    }
    if (cleanupUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: cleanupUserIds } },
      });
    }
    await prisma.$disconnect();
  }

  console.log(
    "\n======================================================================="
  );
  console.log(
    `  PHASE 14 AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${
      passed + failed
    })`
  );
  console.log(
    "=======================================================================\n"
  );

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase14NotificationsAudit();
