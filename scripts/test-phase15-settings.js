/**
 * Phase 15: Restaurant Settings & Business Configuration — Comprehensive E2E & Security Verification Suite
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

async function apiFetch(path, options = {}) {
  const { token, method = "GET", body } = options;
  const headers = { ...(options.headers || {}), Connection: "close" };
  if (token) {
    headers["Cookie"] = `session=${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE_URL}${path}`, {
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
  await new Promise((r) => setTimeout(r, 60));
  return { status: res.status, data, headers: res.headers, text };
}

async function main() {
  console.log("=============================================================");
  console.log("🧪 PHASE 15: RESTAURANT SETTINGS & CONFIGURATION TEST SUITE");
  console.log("=============================================================\n");

  const runSuffix = Date.now();
  let restA, restB;
  let ownerA, managerA, staffA, kitchenA, disabledStaffA, ownerB;
  let categoryA, itemA, tableA, qrA;

  try {
    // -------------------------------------------------------------
    // 1. Setup isolated test tenants & role fixtures
    // -------------------------------------------------------------
    console.log("📦 Setting up isolated test tenants and role fixtures...");

    ownerA = await prisma.user.create({
      data: {
        name: "Phase15 Owner A",
        email: `p15.owner.a.${runSuffix}@example.com`,
        passwordHash: "hashed",
      },
    });
    managerA = await prisma.user.create({
      data: {
        name: "Phase15 Manager A",
        email: `p15.manager.a.${runSuffix}@example.com`,
        passwordHash: "hashed",
      },
    });
    staffA = await prisma.user.create({
      data: {
        name: "Phase15 Staff A",
        email: `p15.staff.a.${runSuffix}@example.com`,
        passwordHash: "hashed",
      },
    });
    kitchenA = await prisma.user.create({
      data: {
        name: "Phase15 Kitchen A",
        email: `p15.kitchen.a.${runSuffix}@example.com`,
        passwordHash: "hashed",
      },
    });
    disabledStaffA = await prisma.user.create({
      data: {
        name: "Phase15 Disabled Manager A",
        email: `p15.disabled.a.${runSuffix}@example.com`,
        passwordHash: "hashed",
      },
    });
    ownerB = await prisma.user.create({
      data: {
        name: "Phase15 Owner B",
        email: `p15.owner.b.${runSuffix}@example.com`,
        passwordHash: "hashed",
      },
    });

    restA = await prisma.restaurant.create({
      data: {
        name: "Bistro Fifteen A",
        slug: `bistro-fifteen-a-${runSuffix}`,
        currency: "USD",
        timezone: "UTC",
        taxPercentage: 5,
        users: {
          create: [
            { userId: ownerA.id, role: "OWNER", status: "ACTIVE" },
            { userId: managerA.id, role: "MANAGER", status: "ACTIVE" },
            { userId: staffA.id, role: "STAFF", status: "ACTIVE" },
            { userId: kitchenA.id, role: "KITCHEN", status: "ACTIVE" },
            { userId: disabledStaffA.id, role: "MANAGER", status: "DISABLED" },
          ],
        },
      },
    });

    restB = await prisma.restaurant.create({
      data: {
        name: "Bistro Fifteen B",
        slug: `bistro-fifteen-b-${runSuffix}`,
        currency: "EUR",
        timezone: "Europe/Paris",
        users: {
          create: [{ userId: ownerB.id, role: "OWNER", status: "ACTIVE" }],
        },
      },
    });

    categoryA = await prisma.menuCategory.create({
      data: {
        restaurantId: restA.id,
        name: "Signature Mains",
        isActive: true,
      },
    });

    itemA = await prisma.menuItem.create({
      data: {
        restaurantId: restA.id,
        categoryId: categoryA.id,
        name: "Wood-Fired Margherita",
        slug: `wood-fired-margherita-${runSuffix}`,
        price: 100.0,
        isAvailable: true,
        status: "ACTIVE",
      },
    });

    tableA = await prisma.table.create({
      data: {
        restaurantId: restA.id,
        number: "15",
        name: "T-15",
        capacity: 4,
        status: "ACTIVE",
      },
    });

    qrA = await prisma.qRCode.create({
      data: {
        restaurantId: restA.id,
        tableId: tableA.id,
        token: `qr_p15_${runSuffix}`,
        url: `${BASE_URL}/q/qr_p15_${runSuffix}`,
        status: "ACTIVE",
      },
    });

    const tokenOwnerA = await makeToken(ownerA.id, ownerA.email);
    const tokenManagerA = await makeToken(managerA.id, managerA.email);
    const tokenStaffA = await makeToken(staffA.id, staffA.email);
    const tokenKitchenA = await makeToken(kitchenA.id, kitchenA.email);
    const tokenDisabledA = await makeToken(
      disabledStaffA.id,
      disabledStaffA.email
    );
    const tokenOwnerB = await makeToken(ownerB.id, ownerB.email);

    // -------------------------------------------------------------
    // 2. Authentication, RBAC & Cross-Tenant Isolation
    // -------------------------------------------------------------
    console.log("\n🔒 1. Authentication, RBAC & Cross-Tenant Isolation...");

    const unauthGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`
    );
    assert(
      unauthGet.status === 401,
      "Unauthenticated GET /api/v1/settings returns 401",
      `Got ${unauthGet.status}`
    );

    const unauthPatch = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        method: "PATCH",
        body: { name: "Hacked" },
      }
    );
    assert(
      unauthPatch.status === 401,
      "Unauthenticated PATCH /api/v1/settings returns 401",
      `Got ${unauthPatch.status}`
    );

    const kitchenGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenKitchenA }
    );
    assert(
      kitchenGet.status === 403,
      "KITCHEN role GET /api/v1/settings blocked (403)",
      `Got ${kitchenGet.status}`
    );

    const kitchenPatch = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenKitchenA,
        method: "PATCH",
        body: { name: "Kitchen Rename" },
      }
    );
    assert(
      kitchenPatch.status === 403,
      "KITCHEN role PATCH /api/v1/settings blocked (403)",
      `Got ${kitchenPatch.status}`
    );

    const staffGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenStaffA }
    );
    assert(
      staffGet.status === 403,
      "STAFF role GET /api/v1/settings blocked (403)",
      `Got ${staffGet.status}`
    );

    const staffPatch = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenStaffA,
        method: "PATCH",
        body: { isOrderingEnabled: false },
      }
    );
    assert(
      staffPatch.status === 403,
      "STAFF role PATCH /api/v1/settings blocked (403)",
      `Got ${staffPatch.status}`
    );

    const disabledGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenDisabledA }
    );
    assert(
      disabledGet.status === 403,
      "DISABLED membership GET /api/v1/settings blocked (403)",
      `Got ${disabledGet.status}`
    );

    const managerGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenManagerA }
    );
    assert(
      managerGet.status === 200 &&
        managerGet.data?.permissions?.canViewSettings === true &&
        managerGet.data?.permissions?.canManageSettings === false,
      "MANAGER role GET /api/v1/settings allowed in read-only mode (canManageSettings=false)",
      `Got status=${managerGet.status}`
    );

    const managerPatch = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenManagerA,
        method: "PATCH",
        body: { taxPercentage: 15 },
      }
    );
    assert(
      managerPatch.status === 403,
      "MANAGER role PATCH /api/v1/settings blocked (403 — OWNER only)",
      `Got ${managerPatch.status}`
    );

    const crossTenantGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenOwnerB }
    );
    assert(
      crossTenantGet.status === 403,
      "Cross-tenant Owner B GET on Restaurant A blocked (403)",
      `Got ${crossTenantGet.status}`
    );

    const crossTenantPatch = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerB,
        method: "PATCH",
        body: { name: "Tenant Takeover" },
      }
    );
    assert(
      crossTenantPatch.status === 403,
      "Cross-tenant Owner B PATCH on Restaurant A blocked (403)",
      `Got ${crossTenantPatch.status}`
    );

    const ownerGet = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenOwnerA }
    );
    assert(
      ownerGet.status === 200 &&
        ownerGet.data?.permissions?.canManageSettings === true &&
        ownerGet.data?.settings?.id === restA.id,
      "OWNER GET /api/v1/settings returns 200 with full settings & canManageSettings=true",
      `Got ${ownerGet.status}`
    );
    assert(
      (ownerGet.headers.get("cache-control") || "").includes("no-store"),
      "GET /api/v1/settings includes Cache-Control: private, no-store",
      `Got ${ownerGet.headers.get("cache-control")}`
    );

    // -------------------------------------------------------------
    // 3. Mass Assignment & Input Validation Hardening
    // -------------------------------------------------------------
    console.log("\n🛡️ 2. Mass Assignment & Input Validation Hardening...");

    const massAssignRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          name: "Valid Name",
          id: "00000000-0000-0000-0000-000000000000",
          role: "SUPERADMIN",
          status: "INACTIVE",
          razorpayKeySecret: "leaked",
        },
      }
    );
    assert(
      massAssignRes.status === 400,
      "Mass assignment of protected/unknown fields (id, role, status, razorpayKeySecret) rejected (400)",
      `Got ${massAssignRes.status}`
    );

    const xssLogoRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          logoUrl: "javascript:alert(document.cookie)",
        },
      }
    );
    assert(
      xssLogoRes.status === 400,
      "javascript: URL in logoUrl rejected (400)",
      `Got ${xssLogoRes.status}`
    );

    const dataUriCoverRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          coverImageUrl: "data:text/html,<script>alert(1)</script>",
        },
      }
    );
    assert(
      dataUriCoverRes.status === 400,
      "data: URI in coverImageUrl rejected (400)",
      `Got ${dataUriCoverRes.status}`
    );

    const invisibleColorRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          accentColor: "#FFFFFF",
        },
      }
    );
    assert(
      invisibleColorRes.status === 400,
      "Near-white invisible accentColor (#FFFFFF) rejected for contrast safety (400)",
      `Got ${invisibleColorRes.status}`
    );

    const invalidHoursRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          openingTime: "09:00",
          closingTime: "09:00",
        },
      }
    );
    assert(
      invalidHoursRes.status === 400,
      "Identical openingTime and closingTime (09:00 === 09:00) rejected (400)",
      `Got ${invalidHoursRes.status}`
    );

    const badTimeFormatRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          openingTime: "25:99",
        },
      }
    );
    assert(
      badTimeFormatRes.status === 400,
      "Invalid 24-hour time format (25:99) rejected (400)",
      `Got ${badTimeFormatRes.status}`
    );

    const negativeTaxRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          taxPercentage: -5,
        },
      }
    );
    assert(
      negativeTaxRes.status === 400,
      "Negative taxPercentage (-5) rejected (400)",
      `Got ${negativeTaxRes.status}`
    );

    const excessiveTaxRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          taxPercentage: 85,
        },
      }
    );
    assert(
      excessiveTaxRes.status === 400,
      "Excessive taxPercentage (85% > 50%) rejected (400)",
      `Got ${excessiveTaxRes.status}`
    );

    const invalidCurrencyRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          currency: "BTC",
        },
      }
    );
    assert(
      invalidCurrencyRes.status === 400,
      "Unsupported currency ('BTC') rejected (400)",
      `Got ${invalidCurrencyRes.status}`
    );

    const invalidTimezoneRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          timezone: "Mars/Olympus_Mons",
        },
      }
    );
    assert(
      invalidTimezoneRes.status === 400,
      "Unsupported timezone ('Mars/Olympus_Mons') rejected (400)",
      `Got ${invalidTimezoneRes.status}`
    );

    // -------------------------------------------------------------
    // 4. Profile, Branding, Business Hours, Slug Collision & Currency Change Before Orders
    // -------------------------------------------------------------
    console.log(
      "\n🏪 3. Profile, Branding, Business Hours, Slug Uniqueness & Pre-Order Currency Update..."
    );

    const slugCollisionRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          slug: restB.slug,
        },
      }
    );
    assert(
      slugCollisionRes.status === 409 &&
        slugCollisionRes.data?.code === "SLUG_TAKEN",
      "Duplicate restaurant slug rejected with 409 Conflict (SLUG_TAKEN)",
      `Got ${slugCollisionRes.status}`
    );

    const newSlug = `bistro-fifteen-prime-${runSuffix}`;
    const fullUpdateRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          name: "Bistro Fifteen Prime",
          slug: newSlug,
          description: "Artisanal Neapolitan Pizza & Espresso Bar",
          phone: "+91 98765 43210",
          email: "Contact@BistroFifteen.com",
          address: "42 MG Road",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
          pincode: "560001",
          gstNumber: "29aabcu9603r1zm",
          logoUrl: "/uploads/logo-prime.png",
          coverImageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5",
          accentColor: "#1B4332",
          openingTime: "09:30",
          closingTime: "22:30",
          closedDays: ["MONDAY", "MONDAY"],
          currency: "INR",
          timezone: "Asia/Kolkata",
          customerNotice: "Welcome to Bistro Fifteen Prime!",
          taxPercentage: 5,
        },
      }
    );

    assert(
      fullUpdateRes.status === 200,
      "OWNER full settings update (including currency before any orders) succeeds (200)",
      `Got ${fullUpdateRes.status}: ${JSON.stringify(fullUpdateRes.data)}`
    );
    assert(
      fullUpdateRes.data?.settings?.name === "Bistro Fifteen Prime" &&
        fullUpdateRes.data?.settings?.slug === newSlug &&
        fullUpdateRes.data?.settings?.currency === "INR" &&
        fullUpdateRes.data?.settings?.timezone === "Asia/Kolkata" &&
        fullUpdateRes.data?.settings?.gstNumber === "29AABCU9603R1ZM" &&
        fullUpdateRes.data?.settings?.email === "contact@bistrofifteen.com" &&
        fullUpdateRes.data?.settings?.accentColor === "#1B4332" &&
        JSON.stringify(fullUpdateRes.data?.settings?.closedDays) ===
          JSON.stringify(["MONDAY"]),
      "Updated settings normalized, deduplicated, and returned accurately",
      `Got ${JSON.stringify(fullUpdateRes.data?.settings)}`
    );

    const auditLog = await prisma.staffAuditLog.findFirst({
      where: {
        restaurantId: restA.id,
        action: "SETTINGS_UPDATED",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(
      Boolean(auditLog && auditLog.actorId === ownerA.id),
      "StaffAuditLog records SETTINGS_UPDATED entry with actorId",
      `Got ${JSON.stringify(auditLog)}`
    );

    // -------------------------------------------------------------
    // 5. Tax Snapshot & Historical Order Immutability + Currency Lock After First Order
    // -------------------------------------------------------------
    console.log(
      "\n💰 4. Tax Snapshotting, Historical Order Immutability & Currency Lock..."
    );

    // Place Order #1 at 5% tax (2 items x 100 = 200 subtotal, 10 tax, 210 total)
    const order1Res = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        customerName: "Aarav Sharma",
        items: [
          {
            menuItemId: itemA.id,
            quantity: 2,
            specialInstructions: "Extra basil please",
          },
        ],
        specialInstructions: "Serve warm",
      },
    });

    assert(
      order1Res.status === 201 &&
        order1Res.data?.order?.subtotal === 200 &&
        order1Res.data?.order?.tax === 10 &&
        order1Res.data?.order?.appliedTaxPercentage === 5 &&
        order1Res.data?.order?.total === 210 &&
        order1Res.data?.order?.specialInstructions === "Serve warm",
      "Order #1 created with 5% tax snapshot (subtotal=200, tax=10, appliedTaxPercentage=5, total=210)",
      `Got ${JSON.stringify(order1Res.data)}`
    );

    const order1Id = order1Res.data?.order?.id;

    // Now that Order #1 exists, verify hasFinancialHistory === true and currency is locked!
    const getAfterOrder1 = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      { token: tokenOwnerA }
    );
    assert(
      getAfterOrder1.data?.meta?.hasFinancialHistory === true &&
        getAfterOrder1.data?.meta?.ordersCount === 1,
      "GET /api/v1/settings reports hasFinancialHistory=true after first order",
      `Got ${JSON.stringify(getAfterOrder1.data?.meta)}`
    );

    const currencyLockRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          currency: "USD",
        },
      }
    );
    assert(
      currencyLockRes.status === 400 &&
        currencyLockRes.data?.code === "CURRENCY_LOCKED",
      "Changing currency after orders exist is blocked with 400 CURRENCY_LOCKED",
      `Got ${currencyLockRes.status}: ${JSON.stringify(currencyLockRes.data)}`
    );

    // Update taxPercentage from 5% to 18%
    const updateTaxRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          taxPercentage: 18,
        },
      }
    );
    assert(
      updateTaxRes.status === 200 &&
        updateTaxRes.data?.settings?.taxPercentage === 18,
      "Updating taxPercentage to 18% succeeds (200)",
      `Got ${updateTaxRes.status}`
    );

    // Place Order #2 at 18% tax (2 items x 100 = 200 subtotal, 36 tax, 236 total)
    const order2Res = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        customerName: "Priya Nair",
        items: [{ menuItemId: itemA.id, quantity: 2 }],
      },
    });
    assert(
      order2Res.status === 201 &&
        order2Res.data?.order?.subtotal === 200 &&
        order2Res.data?.order?.tax === 36 &&
        order2Res.data?.order?.appliedTaxPercentage === 18 &&
        order2Res.data?.order?.total === 236,
      "Order #2 uses new 18% tax rate (subtotal=200, tax=36, appliedTaxPercentage=18, total=236)",
      `Got ${JSON.stringify(order2Res.data)}`
    );

    // Verify Historical Order #1 in database was NOT mutated
    const dbOrder1 = await prisma.order.findUnique({
      where: { id: order1Id },
    });
    assert(
      Number(dbOrder1.subtotal) === 200 &&
        Number(dbOrder1.tax) === 10 &&
        Number(dbOrder1.appliedTaxPercentage) === 5 &&
        Number(dbOrder1.total) === 210,
      "Historical Order #1 remains untouched after tax rate change (subtotal=200, tax=10, appliedTaxPercentage=5, total=210)",
      `Got ${JSON.stringify(dbOrder1)}`
    );

    // -------------------------------------------------------------
    // 6. Order & Service Preferences (allowSpecialInstructions & isOrderingEnabled) + Public QR Menu
    // -------------------------------------------------------------
    console.log(
      "\n🛑 5. Order & Service Controls (allowSpecialInstructions, isOrderingEnabled) & Public QR Menu..."
    );

    // Disable allowSpecialInstructions
    const disableInstructionsRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          allowSpecialInstructions: false,
        },
      }
    );
    assert(
      disableInstructionsRes.status === 200 &&
        disableInstructionsRes.data?.settings?.allowSpecialInstructions ===
          false,
      "Disabling allowSpecialInstructions succeeds (200)",
      `Got ${disableInstructionsRes.status}`
    );

    // Place Order #3 with specialInstructions while allowSpecialInstructions=false
    const order3Res = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        items: [
          {
            menuItemId: itemA.id,
            quantity: 1,
            specialInstructions: "Should be stripped",
          },
        ],
        specialInstructions: "Order note should be stripped",
      },
    });
    const dbOrder3 = await prisma.order.findUnique({
      where: { id: order3Res.data?.order?.id },
      include: { items: true },
    });
    assert(
      order3Res.status === 201 &&
        dbOrder3.specialInstructions === null &&
        dbOrder3.items[0].specialInstructions === null,
      "POST /api/v1/orders strips order and item specialInstructions when allowSpecialInstructions=false",
      `Got order=${dbOrder3?.specialInstructions}, item=${dbOrder3?.items?.[0]?.specialInstructions}`
    );

    // Pause online ordering (isOrderingEnabled = false) with custom pause notice
    const pauseOrderingRes = await apiFetch(
      `/api/v1/settings?restaurantId=${restA.id}`,
      {
        token: tokenOwnerA,
        method: "PATCH",
        body: {
          isOrderingEnabled: false,
          customerNotice: "Kitchen is refreshing between lunch and dinner service.",
        },
      }
    );
    assert(
      pauseOrderingRes.status === 200 &&
        pauseOrderingRes.data?.settings?.isOrderingEnabled === false,
      "Pausing customer ordering (isOrderingEnabled=false) succeeds (200)",
      `Got ${pauseOrderingRes.status}`
    );

    // Attempt to place order while ordering is paused
    const pausedOrderAttempt = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        items: [{ menuItemId: itemA.id, quantity: 1 }],
      },
    });
    assert(
      pausedOrderAttempt.status === 403 &&
        pausedOrderAttempt.data?.code === "ORDERING_PAUSED" &&
        pausedOrderAttempt.data?.error ===
          "Kitchen is refreshing between lunch and dinner service.",
      "POST /api/v1/orders blocks new order with 403 ORDERING_PAUSED and returns restaurant customerNotice",
      `Got ${pausedOrderAttempt.status}: ${JSON.stringify(pausedOrderAttempt.data)}`
    );

    // Verify public QR page /q/[token] renders updated restaurant name, notice, and hours without leaking secrets
    const qrPageRes = await apiFetch(`/q/${qrA.token}`);
    assert(
      qrPageRes.status === 200 &&
        qrPageRes.text.includes("Bistro Fifteen Prime") &&
        qrPageRes.text.includes(
          "Kitchen is refreshing between lunch and dinner service."
        ) &&
        !qrPageRes.text.includes("passwordHash") &&
        !qrPageRes.text.includes("SETTINGS_UPDATED"),
      "Public QR menu /q/[token] renders updated branding & notice after slug change and leaks no internal data",
      `Got status=${qrPageRes.status}`
    );

    // Re-enable ordering and verify orders work again
    await apiFetch(`/api/v1/settings?restaurantId=${restA.id}`, {
      token: tokenOwnerA,
      method: "PATCH",
      body: {
        isOrderingEnabled: true,
        allowSpecialInstructions: true,
      },
    });

    const resumedOrderRes = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        items: [{ menuItemId: itemA.id, quantity: 1 }],
      },
    });
    assert(
      resumedOrderRes.status === 201,
      "Re-enabling isOrderingEnabled=true immediately restores order placement (201)",
      `Got ${resumedOrderRes.status}`
    );
  } finally {
    // Cleanup test fixtures
    console.log("\n🧹 Cleaning up Phase 15 test fixtures...");
    if (restA) {
      await prisma.payment.deleteMany({ where: { restaurantId: restA.id } });
      await prisma.order.deleteMany({ where: { restaurantId: restA.id } });
      await prisma.qRCode.deleteMany({ where: { restaurantId: restA.id } });
      await prisma.table.deleteMany({ where: { restaurantId: restA.id } });
      await prisma.menuItem.deleteMany({ where: { restaurantId: restA.id } });
      await prisma.menuCategory.deleteMany({
        where: { restaurantId: restA.id },
      });
      await prisma.restaurant.delete({ where: { id: restA.id } });
    }
    if (restB) {
      await prisma.restaurant.delete({ where: { id: restB.id } });
    }
    const userIds = [
      ownerA?.id,
      managerA?.id,
      staffA?.id,
      kitchenA?.id,
      disabledStaffA?.id,
      ownerB?.id,
    ].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }

  console.log("\n=============================================================");
  console.log(
    `📊 PHASE 15 RESULTS: ${passed} Passed, ${failed} Failed (Total: ${
      passed + failed
    })`
  );
  console.log("=============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
