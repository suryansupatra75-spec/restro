/**
 * PHASE 17 TEST DATA PACK — SAFE FIXTURE LOADER & 10-SCENARIO VERIFIER
 *
 * Maps `fixtures/PHASE_17_TEST_DATA_FIXTURES.json` (schemaVersion: "phase17-test-fixtures-v1")
 * to the actual Prisma schema and verifies all 10 scenarios defined in `testScenarios`:
 *   1. trial-active (test-restaurant-a)
 *   2. active-subscription (test-restaurant-b)
 *   3. past-due (test-restaurant-c)
 *   4. expired-trial
 *   5. no-subscription (test-restaurant-no-subscription)
 *   6. tenant-isolation (Restaurant A vs Restaurant B)
 *   7. plan-limit (Starter test plan limit enforcement)
 *   8. duplicate-webhook (test-event-duplicate-003)
 *   9. payment-not-confirmed (Browser redirect without verified webhook)
 *  10. archived-plan (test-plan-archived)
 *
 * SAFETY GUARANTEES:
 * - Refuses to run if NODE_ENV === "production" or DATABASE_URL is not local SQLite.
 * - Never replaces or deletes existing restaurant, customer, or order data.
 * - Uses only synthetic @example.test emails and sandbox test webhooks (zero real charges).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const KEEP_FIXTURES = process.argv.includes("--keep");

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

function assertLocalTestDatabaseSafety() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SAFETY ABORT: Never run Phase 17 test fixture scripts in production!"
    );
  }
  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
  if (!dbUrl.startsWith("file:")) {
    throw new Error(
      `SAFETY ABORT: Expected local SQLite file: DATABASE_URL, got "${dbUrl}".`
    );
  }
}

function offsetDate(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

let passed = 0;
let failed = 0;

function record(id, name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`✅ [PASS] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${id}: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function apiFetch(urlPath, options = {}) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
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
    // Non-JSON
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

async function createSyntheticRestaurantFromFixture(restDef, runSuffix) {
  const emailParts = restDef.ownerEmail.split("@");
  const email = `${emailParts[0]}.${runSuffix}@${emailParts[1]}`;
  const password = "FixturePass123!";

  const regRes = await apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `Owner of ${restDef.name}`,
      email,
      password,
    }),
  });
  const cookie = extractCookie(regRes.headers);

  const onbRes = await apiFetch("/api/v1/onboarding/restaurant", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      name: `${restDef.name} ${runSuffix}`,
      phone: "9000000000",
      email,
      address: "100 Synthetic Fixture Way",
      city: "Bengaluru",
      state: "KA",
      country: "India",
      pincode: "560001",
      currency: "INR",
      timezone: "Asia/Kolkata",
    }),
  });

  const user = await prisma.user.findUnique({ where: { email } });
  const restaurantId = onbRes.json?.restaurant?.id;
  return {
    logicalId: restDef.id,
    user,
    email,
    cookie,
    restaurantId,
  };
}

async function main() {
  assertLocalTestDatabaseSafety();

  const fixturePath = path.join(
    __dirname,
    "..",
    "fixtures",
    "PHASE_17_TEST_DATA_FIXTURES.json"
  );
  const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  console.log("=================================================================");
  console.log(
    "PHASE 17 TEST DATA PACK — FIXTURE LOADER & 10-SCENARIO VERIFIER"
  );
  console.log(`Schema Version: ${fixtures.schemaVersion}`);
  console.log(`Warning: ${fixtures.warning}`);
  console.log("=================================================================\n");

  const preExistingRestaurants = await prisma.restaurant.count();
  const preExistingOrders = await prisma.order.count();
  const preExistingCustomers = await prisma.customer.count();

  const createdUserIds = [];
  const createdRestaurantIds = [];
  const createdPlanIds = [];
  const planMap = new Map(); // logical plan.id -> Prisma SubscriptionPlan
  const restaurantMap = new Map(); // logical restaurant.id -> { user, cookie, restaurantId }
  const subscriptionMap = new Map(); // logical sub.id -> Prisma RestaurantSubscription

  try {
    const runSuffix = Date.now();

    // -------------------------------------------------------------------------
    // 1. Map & seed all 4 synthetic plans from fixtures.plans
    // -------------------------------------------------------------------------
    for (let i = 0; i < fixtures.plans.length; i++) {
      const pDef = fixtures.plans[i];
      const isArchived = pDef.status === "ARCHIVED";
      const isActive = pDef.status === "ACTIVE";
      const createdPlan = await prisma.subscriptionPlan.create({
        data: {
          key: `${pDef.key}_${runSuffix}`,
          name: pDef.name,
          description: pDef.description,
          billingInterval: pDef.interval || "MONTHLY",
          priceMinor: pDef.priceMinor,
          currency: pDef.currency || fixtures.currency || "INR",
          trialDays: pDef.trialDays,
          isActive,
          isArchived,
          sortOrder: 50 + i,
          maxStaff: pDef.entitlements.maxStaffAccounts,
          maxMenuItems: pDef.entitlements.maxMenuItems,
          // Map maxLocations/tables limit so table limit enforcement can also be verified
          maxTables: pDef.entitlements.maxLocations,
          analyticsEnabled: Boolean(pDef.entitlements.analytics),
          analyticsExportEnabled: Boolean(pDef.entitlements.analytics),
          inventoryEnabled: Boolean(pDef.entitlements.inventory),
          customBrandingEnabled: Boolean(pDef.entitlements.analytics),
        },
      });
      createdPlanIds.push(createdPlan.id);
      planMap.set(pDef.id, createdPlan);
    }

    // -------------------------------------------------------------------------
    // 2. Map & seed all 4 synthetic restaurants from fixtures.restaurants
    // -------------------------------------------------------------------------
    for (const rDef of fixtures.restaurants) {
      const tenant = await createSyntheticRestaurantFromFixture(rDef, runSuffix);
      createdUserIds.push(tenant.user.id);
      createdRestaurantIds.push(tenant.restaurantId);
      restaurantMap.set(rDef.id, tenant);
    }

    // Clear auto-provisioned onboarding subscriptions so we can load exact fixture subscriptions
    for (const tenant of restaurantMap.values()) {
      await prisma.restaurantSubscription.deleteMany({
        where: { restaurantId: tenant.restaurantId },
      });
    }

    // -------------------------------------------------------------------------
    // 3. Map & seed primary current subscriptions (`test-sub-trial-a`, `test-sub-active-b`, `test-sub-past-due-c`)
    // -------------------------------------------------------------------------
    const primarySubIds = [
      "test-sub-trial-a",
      "test-sub-active-b",
      "test-sub-past-due-c",
    ];
    for (const subId of primarySubIds) {
      const sDef = fixtures.subscriptions.find((s) => s.id === subId);
      const tenant = restaurantMap.get(sDef.restaurantId);
      const plan = planMap.get(sDef.planId);

      const createdSub = await prisma.restaurantSubscription.create({
        data: {
          restaurantId: tenant.restaurantId,
          planId: plan.id,
          isCurrent: true,
          currentLockKey: tenant.restaurantId,
          status: sDef.status,
          planKeySnapshot: plan.key,
          planNameSnapshot: plan.name,
          billingIntervalSnapshot: plan.billingInterval,
          priceMinorSnapshot: plan.priceMinor,
          currencySnapshot: plan.currency,
          maxStaffSnapshot: plan.maxStaff,
          maxMenuItemsSnapshot: plan.maxMenuItems,
          maxTablesSnapshot: plan.maxTables,
          analyticsEnabledSnapshot: plan.analyticsEnabled,
          analyticsExportEnabledSnapshot: plan.analyticsExportEnabled,
          inventoryEnabledSnapshot: plan.inventoryEnabled,
          customBrandingEnabledSnapshot: plan.customBrandingEnabled,
          trialStartsAt: offsetDate(sDef.trialStartOffsetDays),
          trialEndsAt: offsetDate(sDef.trialEndOffsetDays),
          currentPeriodStart: offsetDate(sDef.currentPeriodStartOffsetDays),
          currentPeriodEnd: offsetDate(sDef.currentPeriodEndOffsetDays),
          cancelAtPeriodEnd: Boolean(sDef.cancelAtPeriodEnd),
          provider: sDef.provider || "TEST",
          providerSubscriptionId: `${sDef.providerSubscriptionId}_${runSuffix}`,
        },
      });
      subscriptionMap.set(sDef.id, createdSub);
    }

    // Also load `test-sub-cancel-at-period-end` as a historical/non-current record on restaurant B per fixture note
    const cancelEndDef = fixtures.subscriptions.find(
      (s) => s.id === "test-sub-cancel-at-period-end"
    );
    if (cancelEndDef) {
      const tenantB = restaurantMap.get(cancelEndDef.restaurantId);
      const starterPlan = planMap.get(cancelEndDef.planId);
      const createdCancelSub = await prisma.restaurantSubscription.create({
        data: {
          restaurantId: tenantB.restaurantId,
          planId: starterPlan.id,
          isCurrent: false,
          currentLockKey: null,
          status: cancelEndDef.status,
          planKeySnapshot: starterPlan.key,
          planNameSnapshot: starterPlan.name,
          billingIntervalSnapshot: starterPlan.billingInterval,
          priceMinorSnapshot: starterPlan.priceMinor,
          currencySnapshot: starterPlan.currency,
          maxStaffSnapshot: starterPlan.maxStaff,
          maxMenuItemsSnapshot: starterPlan.maxMenuItems,
          maxTablesSnapshot: starterPlan.maxTables,
          analyticsEnabledSnapshot: starterPlan.analyticsEnabled,
          analyticsExportEnabledSnapshot: starterPlan.analyticsExportEnabled,
          inventoryEnabledSnapshot: starterPlan.inventoryEnabled,
          customBrandingEnabledSnapshot: starterPlan.customBrandingEnabled,
          trialStartsAt: offsetDate(cancelEndDef.trialStartOffsetDays),
          trialEndsAt: offsetDate(cancelEndDef.trialEndOffsetDays),
          currentPeriodStart: offsetDate(
            cancelEndDef.currentPeriodStartOffsetDays
          ),
          currentPeriodEnd: offsetDate(cancelEndDef.currentPeriodEndOffsetDays),
          cancelAtPeriodEnd: Boolean(cancelEndDef.cancelAtPeriodEnd),
          cancelRequestedAt: cancelEndDef.cancelAtPeriodEndRequestedOffsetDays
            ? offsetDate(cancelEndDef.cancelAtPeriodEndRequestedOffsetDays)
            : null,
          provider: cancelEndDef.provider || "TEST",
          providerSubscriptionId: `${cancelEndDef.providerSubscriptionId}_${runSuffix}`,
          notes: cancelEndDef.note,
        },
      });
      subscriptionMap.set(cancelEndDef.id, createdCancelSub);
    }

    // -------------------------------------------------------------------------
    // 4. Map & seed all 3 synthetic invoices from fixtures.invoices
    // -------------------------------------------------------------------------
    for (const invDef of fixtures.invoices) {
      const tenant = restaurantMap.get(invDef.restaurantId);
      const sub = subscriptionMap.get(invDef.subscriptionId);
      const plan = planMap.get(
        fixtures.subscriptions.find((s) => s.id === invDef.subscriptionId)
          ?.planId
      );

      await prisma.subscriptionInvoice.create({
        data: {
          invoiceNumber: `${invDef.invoiceNumber}-${runSuffix}`,
          restaurantId: tenant.restaurantId,
          subscriptionId: sub.id,
          planKeySnapshot: plan.key,
          planNameSnapshot: plan.name,
          billingIntervalSnapshot: plan.billingInterval,
          amountMinor: invDef.amountMinor,
          currency: invDef.currency,
          invoiceStatus: invDef.status,
          paymentStatus: invDef.paymentStatus,
          provider: invDef.provider || "TEST",
          providerOrderId: `${invDef.providerInvoiceId}_${runSuffix}`,
          periodStart: offsetDate(invDef.issuedOffsetDays),
          periodEnd: offsetDate(invDef.issuedOffsetDays + 30),
          paidAt:
            invDef.paidOffsetDays !== null
              ? offsetDate(invDef.paidOffsetDays)
              : null,
          verifiedBySource: "FIXTURE_SEED_TEST",
          notes: invDef.note || "Synthetic fixture invoice",
        },
      });
    }

    const tenantA = restaurantMap.get("test-restaurant-a");
    const tenantB = restaurantMap.get("test-restaurant-b");
    const tenantC = restaurantMap.get("test-restaurant-c");
    const tenantNoSub = restaurantMap.get("test-restaurant-no-subscription");

    // =========================================================================
    // VERIFY ALL 10 SCENARIOS FROM `fixtures.testScenarios`
    // =========================================================================

    // 1. SCENARIO: `trial-active` (test-restaurant-a)
    const s1Res = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantA.restaurantId,
      },
    });
    const s1Sub = s1Res.json?.entitlements?.subscription;
    record(
      "SCENARIO-01 [trial-active]",
      fixtures.testScenarios[0].expected,
      s1Res.status === 200 &&
        s1Sub?.status === "TRIALING" &&
        s1Sub?.isOperational === true &&
        typeof s1Sub?.trialRemainingDays === "number" &&
        s1Sub.trialRemainingDays >= 10 &&
        s1Sub.trialRemainingDays <= 12,
      `status=${s1Sub?.status}, trialRemainingDays=${s1Sub?.trialRemainingDays}`
    );

    // 2. SCENARIO: `active-subscription` (test-restaurant-b on Growth test plan)
    const s2Res = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantB.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
    });
    const s2Ent = s2Res.json?.entitlements;
    const s2AnalyticsRes = await apiFetch("/api/v1/analytics", {
      headers: {
        Cookie: tenantB.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
    });
    const s2InventoryRes = await apiFetch("/api/v1/inventory", {
      headers: {
        Cookie: tenantB.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
    });
    record(
      "SCENARIO-02 [active-subscription]",
      fixtures.testScenarios[1].expected,
      s2Res.status === 200 &&
        s2Ent?.subscription?.status === "ACTIVE" &&
        s2Ent?.limits?.maxStaff === 10 &&
        s2Ent?.limits?.maxMenuItems === 500 &&
        s2Ent?.features?.analyticsEnabled === true &&
        s2Ent?.features?.inventoryEnabled === true &&
        s2AnalyticsRes.status === 200 &&
        s2InventoryRes.status === 200,
      `status=${s2Ent?.subscription?.status}, maxStaff=${s2Ent?.limits?.maxStaff}, analytics=${s2AnalyticsRes.status}, inventory=${s2InventoryRes.status}`
    );

    // 3. SCENARIO: `past-due` (test-restaurant-c)
    const s3BillingRes = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantC.cookie,
        "x-restaurant-id": tenantC.restaurantId,
      },
    });
    const s3AnalyticsRead = await apiFetch("/api/v1/analytics", {
      headers: {
        Cookie: tenantC.cookie,
        "x-restaurant-id": tenantC.restaurantId,
      },
    });
    const s3BlockedTableCreate = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: {
        Cookie: tenantC.cookie,
        "x-restaurant-id": tenantC.restaurantId,
      },
      body: JSON.stringify({ name: "BlockedOnPastDue", capacity: 4 }),
    });
    record(
      "SCENARIO-03 [past-due]",
      fixtures.testScenarios[2].expected,
      s3BillingRes.status === 200 &&
        s3BillingRes.json?.entitlements?.subscription?.status === "PAST_DUE" &&
        s3BillingRes.json?.entitlements?.subscription?.isReadOnlyGrace ===
          true &&
        s3BillingRes.json?.invoices?.length === 2 &&
        s3AnalyticsRead.status === 200 &&
        s3BlockedTableCreate.status === 403 &&
        s3BlockedTableCreate.json?.code === "SUBSCRIPTION_PAST_DUE",
      `billing=${s3BillingRes.status}, graceReadOnly=${s3BillingRes.json?.entitlements?.subscription?.isReadOnlyGrace}, invoices=${s3BillingRes.json?.invoices?.length}, blockedWrite=${s3BlockedTableCreate.status}`
    );

    // 4. SCENARIO: `no-subscription` (test-restaurant-no-subscription BEFORE loading expired-trial alternative)
    const subCountBefore = await prisma.restaurantSubscription.count({
      where: { restaurantId: tenantNoSub.restaurantId },
    });
    const s5TableRes = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: {
        Cookie: tenantNoSub.cookie,
        "x-restaurant-id": tenantNoSub.restaurantId,
      },
      body: JSON.stringify({ name: "AutoProvisionTable1", capacity: 4 }),
    });
    const s5BillingRes = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantNoSub.cookie,
        "x-restaurant-id": tenantNoSub.restaurantId,
      },
    });
    record(
      "SCENARIO-05 [no-subscription]",
      fixtures.testScenarios[4].expected,
      subCountBefore === 0 &&
        s5TableRes.status === 201 &&
        s5BillingRes.status === 200 &&
        s5BillingRes.json?.entitlements?.subscription?.status === "TRIALING",
      `beforeCount=${subCountBefore}, tableCreate=${s5TableRes.status}, autoProvisionedStatus=${s5BillingRes.json?.entitlements?.subscription?.status}`
    );

    // 5. SCENARIO: `expired-trial` (using `test-sub-expired-trial` fixture offsets on tenantNoSub)
    const expiredSubDef = fixtures.subscriptions.find(
      (s) => s.id === "test-sub-expired-trial"
    );
    await prisma.restaurantSubscription.updateMany({
      where: { restaurantId: tenantNoSub.restaurantId, isCurrent: true },
      data: {
        status: "TRIALING", // Set TRIALING with past trialEndsAt to verify idempotent auto-expiry transition
        trialStartsAt: offsetDate(expiredSubDef.trialStartOffsetDays),
        trialEndsAt: offsetDate(expiredSubDef.trialEndOffsetDays),
        currentPeriodStart: offsetDate(
          expiredSubDef.currentPeriodStartOffsetDays
        ),
        currentPeriodEnd: offsetDate(expiredSubDef.currentPeriodEndOffsetDays),
      },
    });

    const s4BillingCall1 = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantNoSub.cookie,
        "x-restaurant-id": tenantNoSub.restaurantId,
      },
    });
    const s4BillingCall2 = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantNoSub.cookie,
        "x-restaurant-id": tenantNoSub.restaurantId,
      },
    });
    const preservedTables = await prisma.table.count({
      where: { restaurantId: tenantNoSub.restaurantId },
    });
    record(
      "SCENARIO-04 [expired-trial]",
      fixtures.testScenarios[3].expected,
      s4BillingCall1.status === 200 &&
        s4BillingCall1.json?.entitlements?.subscription?.status === "EXPIRED" &&
        s4BillingCall2.status === 200 &&
        s4BillingCall2.json?.entitlements?.subscription?.status === "EXPIRED" &&
        preservedTables === 1,
      `call1=${s4BillingCall1.json?.entitlements?.subscription?.status}, call2=${s4BillingCall2.json?.entitlements?.subscription?.status}, preservedTables=${preservedTables}`
    );

    // 6. SCENARIO: `tenant-isolation` (Restaurant A vs Restaurant B)
    const aReadsB = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
    });
    const bReadsA = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantB.cookie,
        "x-restaurant-id": tenantA.restaurantId,
      },
    });
    const aCancelsB = await apiFetch("/api/v1/billing/cancel", {
      method: "POST",
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
      body: JSON.stringify({ immediate: true }),
    });
    record(
      "SCENARIO-06 [tenant-isolation]",
      fixtures.testScenarios[5].expected,
      aReadsB.status === 403 &&
        bReadsA.status === 403 &&
        aCancelsB.status === 403,
      `aReadsB=${aReadsB.status}, bReadsA=${bReadsA.status}, aCancelsB=${aCancelsB.status}`
    );

    // 7. SCENARIO: `plan-limit` (test-restaurant-a on STARTER_TEST: maxStaff=2, maxLocations/Tables=1, analytics=false, inventory=false)
    const t1Create = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantA.restaurantId,
      },
      body: JSON.stringify({ name: "StarterTable1", capacity: 4 }),
    });
    const t2CreateOver = await apiFetch("/api/v1/tables", {
      method: "POST",
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantA.restaurantId,
      },
      body: JSON.stringify({ name: "StarterTable2Over", capacity: 4 }),
    });
    const starterAnalyticsBlocked = await apiFetch("/api/v1/analytics", {
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantA.restaurantId,
      },
    });
    const starterInventoryBlocked = await apiFetch("/api/v1/inventory", {
      headers: {
        Cookie: tenantA.cookie,
        "x-restaurant-id": tenantA.restaurantId,
      },
    });
    record(
      "SCENARIO-07 [plan-limit]",
      fixtures.testScenarios[6].expected,
      t1Create.status === 201 &&
        t2CreateOver.status === 403 &&
        t2CreateOver.json?.code === "PLAN_LIMIT_REACHED" &&
        starterAnalyticsBlocked.status === 403 &&
        starterAnalyticsBlocked.json?.code === "FEATURE_NOT_AVAILABLE" &&
        starterInventoryBlocked.status === 403 &&
        starterInventoryBlocked.json?.code === "FEATURE_NOT_AVAILABLE",
      `table1=${t1Create.status}, table2=${t2CreateOver.status} (${t2CreateOver.json?.code}), analytics=${starterAnalyticsBlocked.status}, inventory=${starterInventoryBlocked.status}`
    );

    // 8. SCENARIO: `duplicate-webhook` (`test-event-duplicate-003` with type `invoice.payment_succeeded`)
    const dupFixture = fixtures.webhookEvents.find(
      (w) => w.eventId === "test-event-duplicate-003"
    );
    const dupEventId = `${dupFixture.eventId}_${runSuffix}`;
    const growthPlan = planMap.get("test-plan-growth");
    const dupBodyRaw = JSON.stringify({
      eventId: dupEventId,
      eventType: dupFixture.type, // "invoice.payment_succeeded"
      createdAt: Date.now() + 2000,
      data: {
        restaurantId: tenantA.restaurantId,
        planId: growthPlan.id,
        amountMinor: growthPlan.priceMinor,
        currency: growthPlan.currency,
        providerPaymentId: `pay_dup_003_${runSuffix}`,
      },
    });
    const dupSig = signWebhook(dupBodyRaw);

    const wh1 = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": dupSig },
      body: dupBodyRaw,
    });
    const wh2 = await apiFetch("/api/v1/billing/webhook", {
      method: "POST",
      headers: { "x-saas-webhook-signature": dupSig },
      body: dupBodyRaw,
    });
    const tenantAInvoices = await prisma.subscriptionInvoice.count({
      where: { restaurantId: tenantA.restaurantId },
    });
    record(
      "SCENARIO-08 [duplicate-webhook]",
      fixtures.testScenarios[7].expected,
      wh1.status === 200 &&
        wh1.json?.duplicate === false &&
        wh2.status === 200 &&
        wh2.json?.duplicate === true &&
        tenantAInvoices === 1,
      `delivery1Duplicate=${wh1.json?.duplicate}, delivery2Duplicate=${wh2.json?.duplicate}, invoiceCount=${tenantAInvoices}`
    );

    // 9. SCENARIO: `payment-not-confirmed` (Browser success redirect without verified provider event must not mark an invoice paid)
    const proPlan = planMap.get("test-plan-pro");
    const checkoutInitRes = await apiFetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: {
        Cookie: tenantB.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
      body: JSON.stringify({
        planId: proPlan.id,
        action: "CREATE_CHECKOUT",
      }),
    });
    const pendingInvoiceId = checkoutInitRes.json?.invoice?.id;
    // Simulate browser redirect / page reload with `?checkout=success&invoiceId=...&status=PAID`
    await apiFetch(
      `/api/v1/billing?checkout=success&invoiceId=${pendingInvoiceId}&status=PAID`,
      {
        headers: {
          Cookie: tenantB.cookie,
          "x-restaurant-id": tenantB.restaurantId,
        },
      }
    );
    const dbPendingInvoice = await prisma.subscriptionInvoice.findUnique({
      where: { id: pendingInvoiceId },
    });
    const dbTenantBSub = await prisma.restaurantSubscription.findFirst({
      where: { restaurantId: tenantB.restaurantId, isCurrent: true },
    });
    record(
      "SCENARIO-09 [payment-not-confirmed]",
      fixtures.testScenarios[8].expected,
      (checkoutInitRes.status === 200 || checkoutInitRes.status === 201) &&
        dbPendingInvoice?.invoiceStatus === "OPEN" &&
        dbPendingInvoice?.paymentStatus === "PENDING" &&
        dbTenantBSub?.planId === growthPlan.id,
      `invoiceStatus=${dbPendingInvoice?.invoiceStatus}, paymentStatus=${dbPendingInvoice?.paymentStatus}, currentPlanRemainsGrowth=${dbTenantBSub?.planId === growthPlan.id}`
    );

    // 10. SCENARIO: `archived-plan` (`test-plan-archived`)
    const archivedPlan = planMap.get("test-plan-archived");
    const histArchivedSub = await prisma.restaurantSubscription.create({
      data: {
        restaurantId: tenantB.restaurantId,
        planId: archivedPlan.id,
        isCurrent: false,
        currentLockKey: null,
        status: "CANCELLED",
        planKeySnapshot: archivedPlan.key,
        planNameSnapshot: archivedPlan.name,
        billingIntervalSnapshot: archivedPlan.billingInterval,
        priceMinorSnapshot: archivedPlan.priceMinor,
        currencySnapshot: archivedPlan.currency,
        maxStaffSnapshot: archivedPlan.maxStaff,
        maxMenuItemsSnapshot: archivedPlan.maxMenuItems,
        maxTablesSnapshot: archivedPlan.maxTables,
        analyticsEnabledSnapshot: archivedPlan.analyticsEnabled,
        analyticsExportEnabledSnapshot: archivedPlan.analyticsExportEnabled,
        inventoryEnabledSnapshot: archivedPlan.inventoryEnabled,
        customBrandingEnabledSnapshot: archivedPlan.customBrandingEnabled,
        currentPeriodStart: offsetDate(-120),
        currentPeriodEnd: offsetDate(-90),
        cancelledAt: offsetDate(-90),
        provider: "TEST",
      },
    });

    const s10BillingRes = await apiFetch("/api/v1/billing", {
      headers: {
        Cookie: tenantB.cookie,
        "x-restaurant-id": tenantB.restaurantId,
      },
    });
    const foundArchivedInHistory = (s10BillingRes.json?.history || []).find(
      (h) => h.id === histArchivedSub.id
    );
    const subscribeArchivedAttempt = await apiFetch(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        headers: {
          Cookie: tenantB.cookie,
          "x-restaurant-id": tenantB.restaurantId,
        },
        body: JSON.stringify({
          planId: archivedPlan.id,
          action: "CREATE_CHECKOUT",
        }),
      }
    );
    record(
      "SCENARIO-10 [archived-plan]",
      fixtures.testScenarios[9].expected,
      Boolean(foundArchivedInHistory) &&
        foundArchivedInHistory.priceMinorSnapshot === 1 &&
        subscribeArchivedAttempt.status === 400 &&
        subscribeArchivedAttempt.json?.code === "PLAN_NOT_AVAILABLE",
      `historyPreserved=${Boolean(foundArchivedInHistory)}, blockedNewCheckout=${subscribeArchivedAttempt.status} (${subscribeArchivedAttempt.json?.code})`
    );
  } finally {
    if (!KEEP_FIXTURES) {
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
    }

    const postRestaurants = await prisma.restaurant.count();
    const postOrders = await prisma.order.count();
    const postCustomers = await prisma.customer.count();

    if (!KEEP_FIXTURES) {
      record(
        "SAFETY-CHECK",
        "Pre-existing restaurant, customer, and order counts preserved 100%",
        postRestaurants === preExistingRestaurants &&
          postOrders === preExistingOrders &&
          postCustomers === preExistingCustomers,
        `restaurants=${postRestaurants}/${preExistingRestaurants}, orders=${postOrders}/${preExistingOrders}, customers=${postCustomers}/${preExistingCustomers}`
      );
    }

    await prisma.$disconnect();
  }

  console.log("\n=================================================================");
  console.log(
    `PHASE 17 FIXTURE SCENARIOS SUMMARY: ${passed} PASSED, ${failed} FAILED`
  );
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal fixture verification error:", err);
  process.exit(1);
});
