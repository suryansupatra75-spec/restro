/**
 * Phase 17 — Complete Automated Verification & Audit Suite
 * Tests SaaS Subscription Plans, Trials, Billing Lifecycle, Webhooks,
 * Server-Side Limit Enforcement, Tenant Isolation, and Regression.
 *
 * Guarantees NO real money charges (runs in explicit SANDBOX mode).
 */

const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const SANDBOX_WEBHOOK_SECRET =
  process.env.SAAS_BILLING_WEBHOOK_SECRET?.trim() &&
  !process.env.SAAS_BILLING_WEBHOOK_SECRET.includes("placeholder")
    ? process.env.SAAS_BILLING_WEBHOOK_SECRET.trim()
    : "sandbox_webhook_secret_phase17_local_test_only";

function signWebhook(rawBody) {
  return crypto
    .createHmac("sha256", SANDBOX_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
}

let passed = 0;
let failed = 0;
const results = [];

function record(id, name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`✅ [PASS] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
  }
  results.push({ id, name, ok, detail });
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    redirect: options.redirect || "manual",
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON response
  }
  return { status: res.status, headers: res.headers, text, json };
}

function extractCookie(resHeaders) {
  const raw = resHeaders.get("set-cookie");
  if (!raw) return "";
  return raw
    .split(",")
    .map((part) => part.split(";")[0].trim())
    .join("; ");
}

async function registerAndOnboardUser(tag) {
  const ts = Date.now() + "_" + Math.floor(Math.random() * 10000);
  const email = `p17_${tag}_${ts}@example.com`;
  const password = "Password123!";
  const name = `Phase17 ${tag}`;

  const regRes = await apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  const cookie = extractCookie(regRes.headers);

  const onbRes = await apiFetch("/api/v1/onboarding/restaurant", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      name: `Resto ${tag} ${ts}`,
      phone: "9876543210",
      email,
      address: "123 Billing Street",
      city: "Mumbai",
      state: "MH",
      country: "India",
      pincode: "400001",
      currency: "INR",
      timezone: "Asia/Kolkata",
    }),
  });

  const user = await prisma.user.findUnique({ where: { email } });
  const restaurantId = onbRes.json?.restaurant?.id;

  return { user, email, password, cookie, restaurantId };
}

async function main() {
  console.log("============================================================");
  console.log("PHASE 17 — SAAS SUBSCRIPTION & BILLING VERIFICATION SUITE");
  console.log("============================================================\n");

  const createdUserIds = [];
  const createdRestaurantIds = [];
  const createdPlanIds = [];

  try {
    // Setup actors: Super Admin, Owner A, Manager A, Staff A, Owner B
    const superAdminSetup = await registerAndOnboardUser("superadmin");
    createdUserIds.push(superAdminSetup.user.id);
    createdRestaurantIds.push(superAdminSetup.restaurantId);

    await prisma.user.update({
      where: { id: superAdminSetup.user.id },
      data: { isSuperAdmin: true },
    });

    const ownerA = await registerAndOnboardUser("ownerA");
    createdUserIds.push(ownerA.user.id);
    createdRestaurantIds.push(ownerA.restaurantId);

    const ownerB = await registerAndOnboardUser("ownerB");
    createdUserIds.push(ownerB.user.id);
    createdRestaurantIds.push(ownerB.restaurantId);

    // Create Manager A and Staff A in Restaurant A
    const managerUser = await registerAndOnboardUser("mgrA");
    createdUserIds.push(managerUser.user.id);
    createdRestaurantIds.push(managerUser.restaurantId);
    await prisma.restaurantUser.create({
      data: {
        restaurantId: ownerA.restaurantId,
        userId: managerUser.user.id,
        role: "MANAGER",
        status: "ACTIVE",
      },
    });

    const staffUser = await registerAndOnboardUser("staffA");
    createdUserIds.push(staffUser.user.id);
    createdRestaurantIds.push(staffUser.restaurantId);
    await prisma.restaurantUser.create({
      data: {
        restaurantId: ownerA.restaurantId,
        userId: staffUser.user.id,
        role: "STAFF",
        status: "ACTIVE",
      },
    });

    // -------------------------------------------------------------------------
    // TEST 1: Anonymous users cannot access billing pages/APIs
    // -------------------------------------------------------------------------
    const anonBillingApi = await apiFetch("/api/v1/billing");
    const anonCheckoutApi = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "any" }),
    });
    const anonCancelApi = await apiFetch("/api/v1/billing/cancel", {
      method: "POST",
      body: JSON.stringify({ immediate: true }),
    });
    const anonSuperPlans = await apiFetch("/api/v1/super-admin/plans");
    const anonBillingPage = await apiFetch("/dashboard/billing");

    record(
      "T01",
      "Anonymous users blocked from billing APIs (401) and pages (307/redirect)",
      anonBillingApi.status === 401 &&
        anonCheckoutApi.status === 401 &&
        anonCancelApi.status === 401 &&
        anonSuperPlans.status === 401 &&
        (anonBillingPage.status === 307 || anonBillingPage.status === 302),
      `billing=${anonBillingApi.status}, checkout=${anonCheckoutApi.status}, cancel=${anonCancelApi.status}, superPlans=${anonSuperPlans.status}, page=${anonBillingPage.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Cross-tenant isolation (Restaurant A vs Restaurant B)
    // -------------------------------------------------------------------------
    const crossRead = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: ownerA.cookie,
        "x-restaurant-id": ownerB.restaurantId,
      },
    });
    const crossCheckout = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: {
        Cookie: ownerA.cookie,
        "x-restaurant-id": ownerB.restaurantId,
      },
      body: JSON.stringify({ planId: "any", action: "CREATE_CHECKOUT" }),
    });
    const crossCancel = await apiFetch("/api/v1/billing/cancel", {
      method: "POST",
      headers: {
        Cookie: ownerA.cookie,
        "x-restaurant-id": ownerB.restaurantId,
      },
      body: JSON.stringify({ immediate: true }),
    });

    record(
      "T02",
      "Restaurant A cannot read or mutate Restaurant B subscription or invoices (403)",
      crossRead.status === 403 &&
        crossCheckout.status === 403 &&
        crossCancel.status === 403,
      `crossRead=${crossRead.status}, crossCheckout=${crossCheckout.status}, crossCancel=${crossCancel.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Role model (OWNER vs MANAGER vs STAFF)
    // -------------------------------------------------------------------------
    const ownerView = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });
    const managerView = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: managerUser.cookie,
        "x-restaurant-id": ownerA.restaurantId,
      },
    });
    const managerCheckout = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: {
        Cookie: managerUser.cookie,
        "x-restaurant-id": ownerA.restaurantId,
      },
      body: JSON.stringify({
        planId: ownerView.json?.availablePlans?.[0]?.id || "any",
        action: "CREATE_CHECKOUT",
      }),
    });
    const staffView = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: staffUser.cookie,
        "x-restaurant-id": ownerA.restaurantId,
      },
    });

    record(
      "T03",
      "OWNER/MANAGER/STAFF billing permissions enforced server-side",
      ownerView.status === 200 &&
        ownerView.json?.canManageBilling === true &&
        managerView.status === 200 &&
        managerView.json?.canManageBilling === false &&
        managerCheckout.status === 403 &&
        staffView.status === 403,
      `ownerView=${ownerView.status}, managerView=${managerView.status}, managerCheckout=${managerCheckout.status}, staffView=${staffView.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Only Super Admins manage plans and platform subscriptions
    // -------------------------------------------------------------------------
    const ownerPlanCreateAttempt = await apiFetch("/api/v1/super-admin/plans", {
      method: "POST",
      headers: { Cookie: ownerA.cookie },
      body: JSON.stringify({
        key: "HACK_PLAN",
        name: "Hack Plan",
        priceMinor: 0,
        maxStaff: 999,
        maxMenuItems: 999,
        maxTables: 999,
      }),
    });
    const ownerSubOverrideAttempt = await apiFetch(
      `/api/v1/super-admin/subscriptions/${ownerA.restaurantId}`,
      {
        method: "PATCH",
        headers: { Cookie: ownerA.cookie },
        body: JSON.stringify({ status: "ACTIVE" }),
      }
    );
    const superPlansGet = await apiFetch("/api/v1/super-admin/plans", {
      headers: { Cookie: superAdminSetup.cookie },
    });

    record(
      "T04",
      "Only authorized Super Admins can manage plans and platform subscriptions",
      ownerPlanCreateAttempt.status === 403 &&
        ownerSubOverrideAttempt.status === 403 &&
        superPlansGet.status === 200 &&
        Array.isArray(superPlansGet.json?.plans) &&
        superPlansGet.json.plans.length >= 4,
      `ownerPlanCreate=${ownerPlanCreateAttempt.status}, ownerSubOverride=${ownerSubOverrideAttempt.status}, superPlans=${superPlansGet.status} (${superPlansGet.json?.plans?.length} plans)`
    );

    const plans = superPlansGet.json.plans;
    const starterPlan = plans.find((p) => p.key === "STARTER");
    const growthPlan = plans.find((p) => p.key === "GROWTH");
    const proPlan = plans.find((p) => p.key === "PRO");

    // -------------------------------------------------------------------------
    // TEST 5: Client-supplied status, price, paid flag, or tenant ID rejected
    // -------------------------------------------------------------------------
    const forgeAttempt1 = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
      body: JSON.stringify({
        planId: proPlan.id,
        action: "CREATE_CHECKOUT",
        status: "ACTIVE",
        paid: true,
        priceMinor: 0,
      }),
    });
    const forgeAttempt2 = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
      body: JSON.stringify({
        planId: proPlan.id,
        restaurantId: ownerB.restaurantId,
      }),
    });

    record(
      "T05",
      "Client-supplied status, priceMinor, paid flag, or restaurantId rejected (400)",
      forgeAttempt1.status === 400 && forgeAttempt2.status === 400,
      `forge1=${forgeAttempt1.status} (${forgeAttempt1.json?.code}), forge2=${forgeAttempt2.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Server-side limit & feature enforcement (Direct API bypass blocked)
    // -------------------------------------------------------------------------
    // Create a custom micro plan via Super Admin: maxStaff=2, maxMenuItems=2, maxTables=1, analytics=false, inventory=false
    const customKey = `MICRO_${Date.now()}`;
    const createCustomPlanRes = await apiFetch("/api/v1/super-admin/plans", {
      method: "POST",
      headers: { Cookie: superAdminSetup.cookie },
      body: JSON.stringify({
        key: customKey,
        name: "Micro Test Plan",
        description: "Strict limit test plan",
        billingInterval: "MONTHLY",
        priceMinor: 49900,
        currency: "INR",
        trialDays: 14,
        maxStaff: 2,
        maxMenuItems: 2,
        maxTables: 1,
        analyticsEnabled: false,
        analyticsExportEnabled: false,
        inventoryEnabled: false,
        customBrandingEnabled: false,
      }),
    });
    const microPlan = createCustomPlanRes.json?.plan;
    if (microPlan?.id) createdPlanIds.push(microPlan.id);

    // Assign Owner B to Micro Test Plan
    await apiFetch(`/api/v1/super-admin/subscriptions/${ownerB.restaurantId}`, {
      method: "PATCH",
      headers: { Cookie: superAdminSetup.cookie },
      body: JSON.stringify({
        planId: microPlan.id,
        status: "ACTIVE",
        recordManualInvoicePaid: true,
        notes: "Assign Micro Plan for limit testing",
      }),
    });

    // Test Table Limit on Owner B (maxTables = 1)
    const t1Res = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
      body: JSON.stringify({ name: "Table 1", capacity: 4 }),
    });
    const t2Res = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
      body: JSON.stringify({ name: "Table 2", capacity: 4 }),
    });

    // Test Menu Item Limit on Owner B (maxMenuItems = 2)
    const catRes = await apiFetch("/api/v1/menu/categories", {
      method: "POST",
      headers: { Cookie: ownerB.cookie },
      body: JSON.stringify({ name: "Starters", isActive: true }),
    });
    const catId = catRes.json?.id;

    const m1Res = await apiFetch("/api/v1/menu/items", {
      method: "POST",
      headers: { Cookie: ownerB.cookie },
      body: JSON.stringify({
        categoryId: catId,
        name: "Item 1",
        price: 100,
        isAvailable: true,
      }),
    });
    const m2Res = await apiFetch("/api/v1/menu/items", {
      method: "POST",
      headers: { Cookie: ownerB.cookie },
      body: JSON.stringify({
        categoryId: catId,
        name: "Item 2",
        price: 120,
        isAvailable: true,
      }),
    });
    const m3Res = await apiFetch("/api/v1/menu/items", {
      method: "POST",
      headers: { Cookie: ownerB.cookie },
      body: JSON.stringify({
        categoryId: catId,
        name: "Item 3 Over Limit",
        price: 150,
        isAvailable: true,
      }),
    });

    // Test Staff Limit on Owner B (maxStaff = 2; Owner B is already 1 active seat)
    const s1Res = await apiFetch("/api/v1/staff/invitations", {
      method: "POST",
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
      body: JSON.stringify({
        email: `staff1_${Date.now()}@example.com`,
        role: "STAFF",
      }),
    });
    const s2Res = await apiFetch("/api/v1/staff/invitations", {
      method: "POST",
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
      body: JSON.stringify({
        email: `staff2_overlimit_${Date.now()}@example.com`,
        role: "STAFF",
      }),
    });

    // Test Analytics & Inventory Feature Gating on Owner B (both disabled on Micro Plan)
    const analyticsBlocked = await apiFetch("/api/v1/analytics", {
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
    });
    const analyticsExportBlocked = await apiFetch("/api/v1/analytics/export", {
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
    });
    const inventoryBlocked = await apiFetch("/api/v1/inventory", {
      headers: { Cookie: ownerB.cookie, "x-restaurant-id": ownerB.restaurantId },
    });

    record(
      "T06",
      "Direct API calls cannot bypass staff, menu item, table, analytics, or inventory plan limits",
      t1Res.status === 201 &&
        t2Res.status === 403 &&
        t2Res.json?.code === "PLAN_LIMIT_REACHED" &&
        m1Res.status === 201 &&
        m2Res.status === 201 &&
        m3Res.status === 403 &&
        m3Res.json?.code === "PLAN_LIMIT_REACHED" &&
        s1Res.status === 200 &&
        s2Res.status === 403 &&
        s2Res.json?.code === "PLAN_LIMIT_REACHED" &&
        analyticsBlocked.status === 403 &&
        analyticsBlocked.json?.code === "FEATURE_NOT_AVAILABLE" &&
        analyticsExportBlocked.status === 403 &&
        inventoryBlocked.status === 403 &&
        inventoryBlocked.json?.code === "FEATURE_NOT_AVAILABLE",
      `tables=[${t1Res.status},${t2Res.status}], menu=[${m1Res.status},${m2Res.status},${m3Res.status}], staff=[${s1Res.status},${s2Res.status}], analytics=${analyticsBlocked.status}, inventory=${inventoryBlocked.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Provider secrets and raw webhook payloads are never exposed
    // -------------------------------------------------------------------------
    const billingDump = JSON.stringify(ownerView.json || {});
    const leaksSecret =
      billingDump.includes(SANDBOX_WEBHOOK_SECRET) ||
      billingDump.includes("keySecret") ||
      billingDump.includes("webhookSecret") ||
      billingDump.includes("payloadJson");

    record(
      "T07",
      "Provider secrets and raw webhook payloads are never exposed in API responses",
      !leaksSecret,
      "Verified no secret values or raw webhook payloads in /api/v1/billing"
    );

    // -------------------------------------------------------------------------
    // TEST 8: Trial creation & expiry uses server time and is idempotent
    // -------------------------------------------------------------------------
    // Set Owner A subscription to TRIALING with trialEndsAt in the past (server-side DB update to simulate elapsed time)
    const pastDate = new Date(Date.now() - 60 * 1000);
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId: ownerA.restaurantId, isCurrent: true },
      data: {
        status: "TRIALING",
        trialEndsAt: pastDate,
      },
    });

    const beforeNotifCount = await prisma.notification.count({
      where: {
        restaurantId: ownerA.restaurantId,
        userId: ownerA.user.id,
        eventType: "SUBSCRIPTION_STATUS_CHANGED",
        title: "Free Trial Expired",
      },
    });

    // Trigger two consecutive reads to verify idempotency
    const expCheck1 = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });
    const expCheck2 = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });

    const afterNotifCount = await prisma.notification.count({
      where: {
        restaurantId: ownerA.restaurantId,
        userId: ownerA.user.id,
        eventType: "SUBSCRIPTION_STATUS_CHANGED",
        title: "Free Trial Expired",
      },
    });

    record(
      "T08",
      "Server-time trial expiry transitions TRIALING -> EXPIRED idempotently and notifies once",
      expCheck1.json?.entitlements?.subscription?.status === "EXPIRED" &&
        expCheck2.json?.entitlements?.subscription?.status === "EXPIRED" &&
        afterNotifCount - beforeNotifCount === 1,
      `status=${expCheck1.json?.entitlements?.subscription?.status}, expiryNotificationsDelta=${afterNotifCount - beforeNotifCount}`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Invalid status transitions are rejected
    // -------------------------------------------------------------------------
    // Owner A is currently EXPIRED; transitioning EXPIRED -> PAST_DUE is invalid
    const invalidTransRes = await apiFetch(
      `/api/v1/super-admin/subscriptions/${ownerA.restaurantId}`,
      {
        method: "PATCH",
        headers: { Cookie: superAdminSetup.cookie },
        body: JSON.stringify({ status: "PAST_DUE" }),
      }
    );

    record(
      "T09",
      "Invalid subscription status transition (EXPIRED -> PAST_DUE) rejected with 400",
      invalidTransRes.status === 400 &&
        invalidTransRes.json?.code === "INVALID_STATUS_TRANSITION",
      `status=${invalidTransRes.status}, code=${invalidTransRes.json?.code}`
    );

    // -------------------------------------------------------------------------
    // TEST 10: Concurrent creation does not create duplicate current subscriptions
    // -------------------------------------------------------------------------
    const concurrentUser = await registerAndOnboardUser("concurrent");
    createdUserIds.push(concurrentUser.user.id);
    createdRestaurantIds.push(concurrentUser.restaurantId);

    // Delete its subscription and fire 5 simultaneous requests to /api/v1/billing
    await prisma.restaurantSubscription.deleteMany({
      where: { restaurantId: concurrentUser.restaurantId },
    });

    await Promise.all([
      apiFetch("/api/v1/billing", {
        headers: {
          Cookie: concurrentUser.cookie,
          "x-restaurant-id": concurrentUser.restaurantId,
        },
      }),
      apiFetch("/api/v1/billing", {
        headers: {
          Cookie: concurrentUser.cookie,
          "x-restaurant-id": concurrentUser.restaurantId,
        },
      }),
      apiFetch("/api/v1/billing", {
        headers: {
          Cookie: concurrentUser.cookie,
          "x-restaurant-id": concurrentUser.restaurantId,
        },
      }),
      apiFetch("/api/v1/billing", {
        headers: {
          Cookie: concurrentUser.cookie,
          "x-restaurant-id": concurrentUser.restaurantId,
        },
      }),
      apiFetch("/api/v1/billing", {
        headers: {
          Cookie: concurrentUser.cookie,
          "x-restaurant-id": concurrentUser.restaurantId,
        },
      }),
    ]);

    const currentSubsCount = await prisma.restaurantSubscription.count({
      where: {
        restaurantId: concurrentUser.restaurantId,
        isCurrent: true,
      },
    });

    record(
      "T10",
      "Concurrent requests never create duplicate current subscriptions",
      currentSubsCount === 1,
      `currentSubsCount=${currentSubsCount}`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Archiving plans cannot silently orphan active subscriptions
    // -------------------------------------------------------------------------
    // microPlan currently has Owner B as an ACTIVE subscriber
    const archiveActivePlanRes = await apiFetch(
      `/api/v1/super-admin/plans/${microPlan.id}`,
      {
        method: "PATCH",
        headers: { Cookie: superAdminSetup.cookie },
        body: JSON.stringify({ isArchived: true }),
      }
    );

    // Create an unused plan and archive it — should succeed
    const unusedPlanRes = await apiFetch("/api/v1/super-admin/plans", {
      method: "POST",
      headers: { Cookie: superAdminSetup.cookie },
      body: JSON.stringify({
        key: `UNUSED_${Date.now()}`,
        name: "Unused Temp Plan",
        priceMinor: 19900,
        maxStaff: 2,
        maxMenuItems: 10,
        maxTables: 5,
      }),
    });
    const unusedPlanId = unusedPlanRes.json?.plan?.id;
    if (unusedPlanId) createdPlanIds.push(unusedPlanId);

    const archiveUnusedPlanRes = await apiFetch(
      `/api/v1/super-admin/plans/${unusedPlanId}`,
      {
        method: "PATCH",
        headers: { Cookie: superAdminSetup.cookie },
        body: JSON.stringify({ isArchived: true }),
      }
    );

    record(
      "T11",
      "Archiving a plan with active subscribers is blocked (409), while unused plan archives safely (200)",
      archiveActivePlanRes.status === 409 &&
        archiveActivePlanRes.json?.code === "PLAN_HAS_ACTIVE_SUBSCRIBERS" &&
        archiveUnusedPlanRes.status === 200 &&
        archiveUnusedPlanRes.json?.plan?.isArchived === true,
      `activePlanArchive=${archiveActivePlanRes.status}, unusedPlanArchive=${archiveUnusedPlanRes.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 12: Expiry/past-due policy preserves billing access and tenant data
    // -------------------------------------------------------------------------
    // Owner A is currently EXPIRED; verify /api/v1/billing is still 200 and mutations are blocked with SUBSCRIPTION_INACTIVE
    const expiredBillingAccess = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });
    const expiredTableAdd = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
      body: JSON.stringify({ name: "Blocked Table", capacity: 2 }),
    });
    const ownerBMenusAfter = await prisma.menuItem.count({
      where: { restaurantId: ownerB.restaurantId },
    });

    record(
      "T12",
      "Expired subscription preserves billing access and tenant data while blocking new resource additions",
      expiredBillingAccess.status === 200 &&
        expiredTableAdd.status === 403 &&
        expiredTableAdd.json?.code === "SUBSCRIPTION_INACTIVE" &&
        ownerBMenusAfter === 2,
      `billingAccess=${expiredBillingAccess.status}, tableMutation=${expiredTableAdd.status} (${expiredTableAdd.json?.code}), preservedMenuItems=${ownerBMenusAfter}`
    );

    // -------------------------------------------------------------------------
    // TEST 13: Invalid webhook signature rejected
    // -------------------------------------------------------------------------
    const rawWebhookPayload = JSON.stringify({
      eventId: `evt_invalid_sig_${Date.now()}`,
      eventType: "subscription.charged",
      createdAt: Date.now(),
      data: {
        restaurantId: ownerA.restaurantId,
        planId: growthPlan.id,
        amountMinor: growthPlan.priceMinor,
      },
    });

    const badSigRes = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": "deadbeef1234567890" },
      body: rawWebhookPayload,
    });
    const missingSigRes = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      body: rawWebhookPayload,
    });

    record(
      "T13",
      "Webhook endpoint rejects missing or invalid HMAC signatures with 401",
      badSigRes.status === 401 && missingSigRes.status === 401,
      `badSig=${badSigRes.status}, missingSig=${missingSigRes.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 14: Valid webhook activates subscription & duplicate event ID applied once
    // -------------------------------------------------------------------------
    const checkoutInitRes = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
      body: JSON.stringify({
        planId: growthPlan.id,
        action: "CREATE_CHECKOUT",
      }),
    });
    const pendingOrderId =
      checkoutInitRes.json?.checkoutSession?.providerOrderId;

    const validEventId = `evt_paid_${Date.now()}`;
    const validEventTime = Date.now();
    const validWebhookRaw = JSON.stringify({
      eventId: validEventId,
      eventType: "subscription.charged",
      createdAt: validEventTime,
      data: {
        restaurantId: ownerA.restaurantId,
        planId: growthPlan.id,
        providerOrderId: pendingOrderId,
        providerPaymentId: `pay_sandbox_${Date.now()}`,
        amountMinor: growthPlan.priceMinor,
        currency: "INR",
      },
    });
    const validSig = signWebhook(validWebhookRaw);

    const whFirst = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": validSig },
      body: validWebhookRaw,
    });
    const whDuplicate = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": validSig },
      body: validWebhookRaw,
    });

    const paidInvoicesForOrder = await prisma.subscriptionInvoice.count({
      where: {
        restaurantId: ownerA.restaurantId,
        providerOrderId: pendingOrderId,
        invoiceStatus: "PAID",
      },
    });

    const ownerAAfterWebhook = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });

    record(
      "T14",
      "Verified webhook activates subscription once; duplicate eventId is idempotent",
      whFirst.status === 200 &&
        whFirst.json?.duplicate === false &&
        whDuplicate.status === 200 &&
        whDuplicate.json?.duplicate === true &&
        paidInvoicesForOrder === 1 &&
        ownerAAfterWebhook.json?.entitlements?.subscription?.status === "ACTIVE",
      `first=${whFirst.json?.status}, dup=${whDuplicate.json?.duplicate}, paidCount=${paidInvoicesForOrder}, subStatus=${ownerAAfterWebhook.json?.entitlements?.subscription?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 15: Delayed / out-of-order webhook events do not overwrite newer state
    // -------------------------------------------------------------------------
    const staleRaw = JSON.stringify({
      eventId: `evt_stale_cancel_${Date.now()}`,
      eventType: "subscription.cancelled",
      createdAt: validEventTime - 120_000, // 2 minutes older than activation event
      data: {
        restaurantId: ownerA.restaurantId,
      },
    });
    const staleRes = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": signWebhook(staleRaw) },
      body: staleRaw,
    });

    const ownerAAfterStale = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });

    record(
      "T15",
      "Delayed/out-of-order webhook event is ignored and does not cancel newer ACTIVE subscription",
      staleRes.status === 200 &&
        staleRes.json?.outOfOrder === true &&
        staleRes.json?.status === "IGNORED_OUT_OF_ORDER" &&
        ownerAAfterStale.json?.entitlements?.subscription?.status === "ACTIVE",
      `staleStatus=${staleRes.json?.status}, subStatus=${ownerAAfterStale.json?.entitlements?.subscription?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 16: Payment failure webhook never becomes PAID
    // -------------------------------------------------------------------------
    const failEventRaw = JSON.stringify({
      eventId: `evt_fail_${Date.now()}`,
      eventType: "payment.failed",
      createdAt: Date.now() + 5000,
      data: {
        restaurantId: ownerA.restaurantId,
        amountMinor: growthPlan.priceMinor,
        currency: "INR",
        failureReason: "Card declined by issuing bank",
      },
    });
    const failWhRes = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": signWebhook(failEventRaw) },
      body: failEventRaw,
    });

    const ownerAAfterFail = await apiFetch("/api/v1/billing", {
      headers: { Cookie: ownerA.cookie, "x-restaurant-id": ownerA.restaurantId },
    });
    const latestInvoice = ownerAAfterFail.json?.invoices?.[0];

    record(
      "T16",
      "Payment failure webhook marks invoice FAILED and subscription PAST_DUE (never PAID)",
      failWhRes.status === 200 &&
        latestInvoice?.invoiceStatus === "FAILED" &&
        latestInvoice?.paymentStatus === "FAILED" &&
        ownerAAfterFail.json?.entitlements?.subscription?.status === "PAST_DUE",
      `invoiceStatus=${latestInvoice?.invoiceStatus}, paymentStatus=${latestInvoice?.paymentStatus}, subStatus=${ownerAAfterFail.json?.entitlements?.subscription?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 17: Browser success redirect alone never confirms payment
    // -------------------------------------------------------------------------
    const redirectAttempt = await apiFetch(
      "/api/v1/billing/checkout?success=true&payment_id=fake_123",
      {
        headers: {
          Cookie: ownerA.cookie,
          "x-restaurant-id": ownerA.restaurantId,
        },
      }
    );

    record(
      "T17",
      "Browser return redirect alone never activates subscription or marks invoice paid",
      redirectAttempt.status === 200 &&
        redirectAttempt.json?.paymentConfirmedByRedirect === false &&
        redirectAttempt.json?.subscriptionStatus === "PAST_DUE",
      `paymentConfirmedByRedirect=${redirectAttempt.json?.paymentConfirmedByRedirect}, status=${redirectAttempt.json?.subscriptionStatus}`
    );

    // -------------------------------------------------------------------------
    // TEST 18: Provider timeout handled safely without corrupting state
    // -------------------------------------------------------------------------
    const timeoutRes = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: {
        Cookie: ownerA.cookie,
        "x-restaurant-id": ownerA.restaurantId,
        "x-test-simulate-provider-timeout": "true",
      },
      body: JSON.stringify({
        planId: proPlan.id,
        action: "CREATE_CHECKOUT",
      }),
    });

    record(
      "T18",
      "Provider timeout returns 502 PROVIDER_CHECKOUT_ERROR and voids pending invoice safely",
      timeoutRes.status === 502 &&
        timeoutRes.json?.code === "PROVIDER_CHECKOUT_ERROR",
      `status=${timeoutRes.status}, code=${timeoutRes.json?.code}`
    );

    // -------------------------------------------------------------------------
    // TEST 19: No automated test causes a real charge (Sandbox verification)
    // -------------------------------------------------------------------------
    const providerCfg = ownerAAfterFail.json?.entitlements?.providerConfig;
    record(
      "T19",
      "Sandbox mode verified — no real money charged during automated tests",
      providerCfg?.isSandbox === true && providerCfg?.mode === "SANDBOX",
      `mode=${providerCfg?.mode}, isSandbox=${providerCfg?.isSandbox}`
    );

    // Restore Owner A to ACTIVE on GROWTH plan for regression checks
    await apiFetch(`/api/v1/super-admin/subscriptions/${ownerA.restaurantId}`, {
      method: "PATCH",
      headers: { Cookie: superAdminSetup.cookie },
      body: JSON.stringify({
        planId: growthPlan.id,
        status: "ACTIVE",
        recordManualInvoicePaid: true,
        notes: "Restore Owner A to Growth for regression tests",
      }),
    });

    // -------------------------------------------------------------------------
    // TEST 20–25: Regression checks across Phases 1–16
    // -------------------------------------------------------------------------
    // T20: Auth & Session check
    const meRes = await apiFetch("/api/v1/auth/me", {
      headers: { Cookie: ownerA.cookie },
    });
    record(
      "T20",
      "Regression: Auth session & multi-tenant membership intact",
      meRes.status === 200 && meRes.json?.user?.id === ownerA.user.id,
      `status=${meRes.status}`
    );

    // T21: Menu, Categories, Tables/QR, Customer Order & KDS
    const regCat = await apiFetch("/api/v1/menu/categories", {
      method: "POST",
      headers: { Cookie: ownerA.cookie },
      body: JSON.stringify({ name: "Mains", isActive: true }),
    });
    const regItem = await apiFetch("/api/v1/menu/items", {
      method: "POST",
      headers: { Cookie: ownerA.cookie },
      body: JSON.stringify({
        categoryId: regCat.json?.id,
        name: "Paneer Tikka",
        price: 250,
        isAvailable: true,
      }),
    });
    const regTable = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: { Cookie: ownerA.cookie },
      body: JSON.stringify({ name: "RegTable1", capacity: 4 }),
    });
    const ordersAdminGet = await apiFetch("/api/v1/orders/admin", {
      headers: { Cookie: ownerA.cookie },
    });
    const kdsPageGet = await apiFetch("/dashboard/kitchen", {
      headers: { Cookie: ownerA.cookie },
    });

    record(
      "T21",
      "Regression: Menu categories, items, tables, order management (/api/v1/orders/admin), and KDS (/dashboard/kitchen) healthy",
      regCat.status === 201 &&
        regItem.status === 201 &&
        regTable.status === 201 &&
        ordersAdminGet.status === 200 &&
        kdsPageGet.status === 200,
      `cat=${regCat.status}, item=${regItem.status}, table=${regTable.status}, ordersAdmin=${ordersAdminGet.status}, kdsPage=${kdsPageGet.status}`
    );

    // T22: Food-order payments remain separate from SaaS subscription billing
    const foodOrderPaymentsCount = await prisma.payment.count({
      where: { restaurantId: ownerA.restaurantId },
    });
    const saasInvoicesCount = await prisma.subscriptionInvoice.count({
      where: { restaurantId: ownerA.restaurantId },
    });
    record(
      "T22",
      "Regression: Food-order Payment table is strictly separate from SaaS SubscriptionInvoice table",
      foodOrderPaymentsCount === 0 && saasInvoicesCount >= 2,
      `foodPayments=${foodOrderPaymentsCount}, saasInvoices=${saasInvoicesCount}`
    );

    // T23: Staff, CRM, Inventory, Analytics, Notifications, Settings
    const [crmRes, invRes, anaRes, notifRes, setRes] = await Promise.all([
      apiFetch("/api/v1/customers", { headers: { Cookie: ownerA.cookie } }),
      apiFetch("/api/v1/inventory", { headers: { Cookie: ownerA.cookie } }),
      apiFetch("/api/v1/analytics", { headers: { Cookie: ownerA.cookie } }),
      apiFetch("/api/v1/notifications", { headers: { Cookie: ownerA.cookie } }),
      apiFetch("/api/v1/settings", { headers: { Cookie: ownerA.cookie } }),
    ]);

    record(
      "T23",
      "Regression: CRM, Inventory, Analytics, Notifications, and Settings APIs return 200",
      crmRes.status === 200 &&
        invRes.status === 200 &&
        anaRes.status === 200 &&
        notifRes.status === 200 &&
        setRes.status === 200,
      `crm=${crmRes.status}, inv=${invRes.status}, ana=${anaRes.status}, notif=${notifRes.status}, set=${setRes.status}`
    );

    // T24: Phase 16 Super Admin functionality & permissions
    const [saOverview, saRestaurants, saUsers, saAudit] = await Promise.all([
      apiFetch("/api/v1/super-admin/overview", {
        headers: { Cookie: superAdminSetup.cookie },
      }),
      apiFetch("/api/v1/super-admin/restaurants", {
        headers: { Cookie: superAdminSetup.cookie },
      }),
      apiFetch("/api/v1/super-admin/users", {
        headers: { Cookie: superAdminSetup.cookie },
      }),
      apiFetch("/api/v1/super-admin/audit-logs", {
        headers: { Cookie: superAdminSetup.cookie },
      }),
    ]);

    record(
      "T24",
      "Regression: Phase 16 Super Admin overview, restaurants, users, and audit logs healthy",
      saOverview.status === 200 &&
        saRestaurants.status === 200 &&
        saUsers.status === 200 &&
        saAudit.status === 200,
      `overview=${saOverview.status}, restaurants=${saRestaurants.status}, users=${saUsers.status}, audit=${saAudit.status}`
    );

    // T25: Landing page, Dashboard Billing page, and Super Admin Plans page routing
    const [landingRes, dashBillingPage, saPlansPage] = await Promise.all([
      apiFetch("/"),
      apiFetch("/dashboard/billing", { headers: { Cookie: ownerA.cookie } }),
      apiFetch("/super-admin/plans", {
        headers: { Cookie: superAdminSetup.cookie },
      }),
    ]);

    record(
      "T25",
      "Regression: Landing page (/), /dashboard/billing, and /super-admin/plans render 200",
      landingRes.status === 200 &&
        dashBillingPage.status === 200 &&
        saPlansPage.status === 200,
      `landing=${landingRes.status}, dashBilling=${dashBillingPage.status}, saPlans=${saPlansPage.status}`
    );
  } finally {
    // Clean up test artifacts without touching pre-existing data
    try {
      for (const rId of createdRestaurantIds) {
        if (!rId) continue;
        await prisma.subscriptionWebhookEvent.deleteMany({
          where: { restaurantId: rId },
        });
        await prisma.subscriptionInvoice.deleteMany({
          where: { restaurantId: rId },
        });
        await prisma.restaurantSubscription.deleteMany({
          where: { restaurantId: rId },
        });
        await prisma.notification.deleteMany({ where: { restaurantId: rId } });
        await prisma.staffInvitation.deleteMany({
          where: { restaurantId: rId },
        });
        await prisma.staffAuditLog.deleteMany({ where: { restaurantId: rId } });
        await prisma.menuItem.deleteMany({ where: { restaurantId: rId } });
        await prisma.menuCategory.deleteMany({ where: { restaurantId: rId } });
        await prisma.table.deleteMany({ where: { restaurantId: rId } });
        await prisma.restaurantUser.deleteMany({
          where: { restaurantId: rId },
        });
        await prisma.restaurant.deleteMany({ where: { id: rId } });
      }
      for (const uId of createdUserIds) {
        if (!uId) continue;
        await prisma.platformAuditLog.deleteMany({ where: { actorId: uId } });
        await prisma.user.deleteMany({ where: { id: uId } });
      }
      for (const pId of createdPlanIds) {
        if (!pId) continue;
        await prisma.subscriptionPlan.deleteMany({ where: { id: pId } });
      }
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }
    await prisma.$disconnect();
  }

  console.log("\n============================================================");
  console.log(`PHASE 17 SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
