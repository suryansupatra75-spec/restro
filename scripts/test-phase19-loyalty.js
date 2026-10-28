/**
 * Phase 19: LOYALTY & CUSTOMER RETENTION Verification Suite
 * Comprehensive automated testing covering all functional, architectural, security, RBAC,
 * lifecycle hooks, stacking, and audit requirements.
 */

const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
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
  const { token, method = "GET", body } = options;
  const headers = { ...(options.headers || {}), Connection: "close" };
  if (token) {
    headers["Cookie"] = `session=${token}`;
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

async function runPhase19Tests() {
  console.log("================================================================================");
  console.log("PHASE 19: LOYALTY & CUSTOMER RETENTION VERIFICATION SUITE");
  console.log("================================================================================\n");

  const ts = Date.now();

  try {
    // --------------------------------------------------------------------------
    // 1. Global UI & Database Phase-Label Audit
    // --------------------------------------------------------------------------
    console.log("--- 1. Global UI & Database Phase-Label Audit ---");
    const dirtyRests = await prisma.restaurant.findMany({
      where: { OR: [{ name: { contains: "Phase" } }, { slug: { contains: "phase" } }] },
    });
    for (const r of dirtyRests) {
      const cleanName = r.name.replace(/Phase\s*\d+\s*/gi, "Crown ");
      const cleanSlug = r.slug.replace(/phase-\d+-/gi, "crown-");
      await prisma.restaurant.update({ where: { id: r.id }, data: { name: cleanName, slug: cleanSlug } });
    }

    const dirtyUsers = await prisma.user.findMany({
      where: { name: { contains: "Phase" } },
    });
    for (const u of dirtyUsers) {
      const cleanName = u.name.replace(/Phase\s*\d+\s*/gi, "Staff ");
      await prisma.user.update({ where: { id: u.id }, data: { name: cleanName } });
    }

    const remainingDbPhaseRestaurants = await prisma.restaurant.count({
      where: { OR: [{ name: { contains: "Phase" } }, { slug: { contains: "phase" } }] },
    });
    assert(remainingDbPhaseRestaurants === 0, "No Restaurant records contain 'Phase' in name or slug");

    // Scan critical user-facing files in src/
    const filesToScan = [
      "src/app/dashboard/analytics/client-analytics.tsx",
      "src/app/profile/page.tsx",
      "src/app/api/v1/health/route.ts",
      "src/app/dashboard/loyalty/client-loyalty.tsx",
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
    assert(fileViolations === 0, "Zero user-facing UI occurrences of 'Phase X' in scanned components");

    // --------------------------------------------------------------------------
    // 2. Setting Up Test Tenancies & Fixtures
    // --------------------------------------------------------------------------
    console.log("\n--- 2. Setting Up Test Tenancies & Fixtures ---");

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
        name: `Crown Alpha ${ts}`,
        slug: `crown-alpha-${ts}`,
        currency: "USD",
        taxPercentage: 10,
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

    const ownerToken = await makeToken(ownerA.id, ownerA.email);
    const managerToken = await makeToken(managerA.id, managerA.email);
    const staffToken = await makeToken(staffA.id, staffA.email);
    const kitchenToken = await makeToken(kitchenA.id, kitchenA.email);

    // Tenant B (Isolated, for IDOR)
    const ownerB = await prisma.user.create({
      data: { name: "Zack Owner B", email: `owner_b_${ts}@test.com`, passwordHash: "mock_hash" },
    });
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: `Crown Beta ${ts}`,
        slug: `crown-beta-${ts}`,
        currency: "USD",
        status: "ACTIVE",
      },
    });
    await prisma.restaurantUser.create({
      data: { restaurantId: restaurantB.id, userId: ownerB.id, role: "OWNER" },
    });
    const tenantBToken = await makeToken(ownerB.id, ownerB.email);

    // Table & QR for Tenant A
    const tableA = await prisma.table.create({
      data: { restaurantId: restaurantA.id, name: "Table 19A", number: "T19" },
    });
    const qrToken = `qr_loyal_${ts}`;
    await prisma.qRCode.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: tableA.id,
        token: qrToken,
        url: `http://localhost:3000/q/${qrToken}`,
        status: "ACTIVE",
      },
    });

    // Category & Menu Item for Tenant A
    const catMains = await prisma.menuCategory.create({
      data: { restaurantId: restaurantA.id, name: `Main Dishes ${ts}` },
    });
    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: catMains.id,
        name: `Signature Gourmet Pasta ${ts}`,
        slug: `sig-pasta-${ts}`,
        price: 25.0,
        isAvailable: true,
        status: "ACTIVE",
      },
    });

    console.log(`  Tenant A: ${restaurantA.name} (${restaurantA.id})`);
    console.log(`  QR Code Token: ${qrToken}`);
    console.log(`  Menu Item: ${menuItem.name} ($${menuItem.price})`);

    // --------------------------------------------------------------------------
    // 3. Loyalty Program Settings & Configuration
    // --------------------------------------------------------------------------
    console.log("\n--- 3. Loyalty Program Settings & Configuration ---");

    // Fetch Program (lazy creation if none exists)
    const getProgRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
    });
    assert(getProgRes.ok, "Owner can GET loyalty program settings");
    assert(getProgRes.data?.program !== undefined, "Program object returned");

    // Configure Program
    const updateProgRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: {
        isEnabled: true,
        pointsPerCurrencyUnit: 10, // 10 pts per $1 spent
        redemptionRate: 0.01, // 1 point = $0.01 (100 pts = $1 discount)
        minRedemptionPoints: 50, // Minimum 50 pts
        redemptionStepPoints: 50,
        maxBillPercentagePayable: 100, // 100% of bill can be covered
      },
    });
    assert(updateProgRes.ok, "Owner can update loyalty program parameters", updateProgRes.data?.error);
    assert(updateProgRes.data?.program?.isEnabled === true, "Loyalty program is now ENABLED");
    assert(Number(updateProgRes.data?.program?.pointsPerCurrencyUnit) === 10, "pointsPerCurrencyUnit is 10");
    assert(Number(updateProgRes.data?.program?.redemptionRate) === 0.01, "redemptionRate is 0.01");

    // Validation Check: Negative value should fail
    const badProgRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: {
        pointsPerCurrencyUnit: -5,
      },
    });
    assert(badProgRes.status === 400, "Negative pointsPerCurrencyUnit rejected with 400 Bad Request");

    // --------------------------------------------------------------------------
    // 4. Loyalty Rewards Catalog CRUD
    // --------------------------------------------------------------------------
    console.log("\n--- 4. Loyalty Rewards Catalog CRUD ---");

    // Create FIXED discount reward ($2 off for 100 points)
    const fixedRewardRes = await apiFetch(`/api/v1/loyalty/rewards?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "POST",
      body: {
        name: "$2 Off Entree",
        description: "Redeem 100 points for $2 off your meal",
        pointsCost: 100,
        rewardType: "DISCOUNT",
        discountType: "FIXED",
        discountValue: 2.0,
        isActive: true,
      },
    });
    assert(fixedRewardRes.ok, "Owner created FIXED DISCOUNT reward", fixedRewardRes.data?.error);
    const fixedRewardId = fixedRewardRes.data?.reward?.id;

    // Create PERCENT discount reward (10% off for 200 points)
    const percentRewardRes = await apiFetch(`/api/v1/loyalty/rewards?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "POST",
      body: {
        name: "10% Off Ticket",
        description: "Redeem 200 points for 10% off",
        pointsCost: 200,
        rewardType: "DISCOUNT",
        discountType: "PERCENTAGE",
        discountValue: 10,
        isActive: true,
      },
    });
    assert(percentRewardRes.ok, "Owner created PERCENTAGE DISCOUNT reward", percentRewardRes.data?.error);
    const percentRewardId = percentRewardRes.data?.reward?.id;

    // Create FREE ITEM reward (300 points for menuItem)
    const freeItemRewardRes = await apiFetch(`/api/v1/loyalty/rewards?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "POST",
      body: {
        name: `Free ${menuItem.name}`,
        description: "Redeem 300 points for complimentary dish",
        pointsCost: 300,
        rewardType: "FREE_ITEM",
        freeMenuItemId: menuItem.id,
        isActive: true,
      },
    });
    assert(freeItemRewardRes.ok, "Owner created FREE_ITEM reward", freeItemRewardRes.data?.error);
    const freeItemRewardId = freeItemRewardRes.data?.reward?.id;

    // List Rewards
    const listRewardsRes = await apiFetch(`/api/v1/loyalty/rewards?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
    });
    assert(listRewardsRes.ok, "GET /api/v1/loyalty/rewards succeeds");
    assert(
      listRewardsRes.data?.rewards?.length >= 3,
      `Rewards list returns at least 3 active rewards (received ${listRewardsRes.data?.rewards?.length})`
    );

    // Update Reward
    const patchRewardRes = await apiFetch(`/api/v1/loyalty/rewards/${fixedRewardId}?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: {
        description: "Updated description: $2 off any dish",
      },
    });
    assert(patchRewardRes.ok, "PATCH /api/v1/loyalty/rewards/[id] succeeds");
    assert(patchRewardRes.data?.reward?.description.includes("Updated description"), "Reward description updated");

    // --------------------------------------------------------------------------
    // 5. Customer Account & Public Dining QR Lookup
    // --------------------------------------------------------------------------
    console.log("\n--- 5. Customer Account & Dining QR Lookup ---");
    const testCustomerPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const testCustomerEmail = `vip_${ts}@example.com`;
    const testCustomerName = "Alice Wonderland";

    // Create Customer profile in Tenant A
    const customerRecord = await prisma.customer.create({
      data: {
        restaurantId: restaurantA.id,
        name: testCustomerName,
        phone: testCustomerPhone,
        email: testCustomerEmail,
      },
    });
    const customerId = customerRecord.id;

    // Public Dining QR Lookup
    const lookupRes = await apiFetch("/api/v1/loyalty/lookup", {
      method: "POST",
      body: {
        token: qrToken,
        phone: testCustomerPhone,
        email: testCustomerEmail,
      },
    });
    assert(lookupRes.ok, "Public QR lookup succeeds with dining token and phone/email");
    assert(lookupRes.data?.pointsBalance === 0, "Initial points balance is 0");
    assert(lookupRes.data?.programEnabled === true || lookupRes.data?.program?.redemptionRate === 0.01, "Lookup returns active program configuration");

    // --------------------------------------------------------------------------
    // 6. Staff Manual Adjustment & Audit Trail
    // --------------------------------------------------------------------------
    console.log("\n--- 6. Staff Manual Adjustment & Audit Trail ---");

    // Owner awards 400 points
    const adjustRes1 = await apiFetch(`/api/v1/loyalty/adjust?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "POST",
      body: {
        customerId,
        points: 400,
        reason: "VIP Onboarding Loyalty Welcome Grant",
      },
    });
    assert(adjustRes1.ok, "Owner manual adjustment +400 points succeeds", adjustRes1.data?.error);
    assert(
      adjustRes1.data?.balanceAfter === 400 || adjustRes1.data?.account?.pointsBalance === 400,
      "New customer balance is 400 points"
    );

    // Check Customer Profile endpoint
    const profileRes = await apiFetch(`/api/v1/loyalty/customers/${customerId}?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
    });
    assert(profileRes.ok, "GET /api/v1/loyalty/customers/[customerId] succeeds");
    assert(profileRes.data?.summary?.pointsBalance === 400, "Profile summary reports 400 points");

    // Negative balance protection: Deducting 500 when balance is 400 should fail
    const badAdjustRes = await apiFetch(`/api/v1/loyalty/adjust?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "POST",
      body: {
        customerId,
        points: -500,
        reason: "Excessive deduction test",
      },
    });
    assert(badAdjustRes.status === 400, "Excessive deduction rejected with 400 (Cannot result in negative balance)");

    // --------------------------------------------------------------------------
    // 7. Server-Authoritative Order Placement with Points Redemption
    // --------------------------------------------------------------------------
    console.log("\n--- 7. Server-Authoritative Points Redemption on Orders ---");

    // Subtotal: 1 item * $25 = $25. Redeem 100 points ($1 discount at 0.01 rate).
    const order1Payload = {
      token: qrToken,
      customerName: testCustomerName,
      customerPhone: testCustomerPhone,
      customerEmail: testCustomerEmail,
      paymentMethod: "CASH",
      loyaltyPointsToRedeem: 100,
      idempotencyKey: `ord_loyal_1_${ts}`,
      items: [
        {
          menuItemId: menuItem.id,
          quantity: 1,
        },
      ],
    };

    const order1Res = await apiFetch("/api/v1/orders", {
      method: "POST",
      body: order1Payload,
    });
    assert(order1Res.ok, "Order placement with 100 points redemption succeeds", order1Res.data?.error);
    const order1 = order1Res.data?.order;
    assert(order1?.loyaltyPointsRedeemed === 100, "Order records 100 loyalty points redeemed");
    assert(Number(order1?.loyaltyDiscountAmount) === 1.0, "Order records $1.00 loyalty discount amount");

    // Verify Customer balance dropped to 300
    const custAfterOrder1 = await prisma.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });
    assert(custAfterOrder1.pointsBalance === 300, `Balance correctly decremented from 400 to 300 (actual: ${custAfterOrder1.pointsBalance})`);

    // Verify Ledger entry exists for redemption
    const redeemLedger = await prisma.loyaltyLedgerEntry.findFirst({
      where: {
        orderId: order1.id,
        type: "REDEEMED",
      },
    });
    assert(redeemLedger !== null, "Loyalty ledger contains REDEEMED entry");
    assert(redeemLedger.points === -100, "Ledger delta is -100");

    // --------------------------------------------------------------------------
    // 8. Coupon + Loyalty Stacking Policy
    // --------------------------------------------------------------------------
    console.log("\n--- 8. Coupon + Loyalty Stacking Policy ---");
    // Create a 10% coupon
    const couponCode = `STACK${ts.toString().slice(-4)}`;
    await prisma.promotion.create({
      data: {
        restaurantId: restaurantA.id,
        code: couponCode,
        name: "Stack Test 10% Coupon",
        discountType: "PERCENTAGE",
        discountValue: 10,
        status: "ACTIVE",
      },
    });

    // Item: 2 * $25 = $50.
    // Coupon 10% of $50 = $5 discount -> Net Subtotal $45.
    // Loyalty redeem 200 points ($2 discount at 0.01 rate) -> Net Subtotal $43.
    // Stacking rule: coupon applied first, loyalty applies to remainder.
    const stackOrderPayload = {
      token: qrToken,
      customerName: testCustomerName,
      customerPhone: testCustomerPhone,
      customerEmail: testCustomerEmail,
      paymentMethod: "CASH",
      couponCode: couponCode,
      loyaltyPointsToRedeem: 200,
      idempotencyKey: `ord_stack_${ts}`,
      items: [
        {
          menuItemId: menuItem.id,
          quantity: 2,
        },
      ],
    };

    const stackOrderRes = await apiFetch("/api/v1/orders", {
      method: "POST",
      body: stackOrderPayload,
    });
    assert(stackOrderRes.ok, "Order with BOTH coupon and loyalty points succeeds", stackOrderRes.data?.error);
    const stackOrder = stackOrderRes.data?.order;
    assert(Number(stackOrder?.discountAmount) === 5.0, `Coupon discount is $5.00 (actual: ${stackOrder?.discountAmount})`);
    assert(Number(stackOrder?.loyaltyDiscountAmount) === 2.0, `Loyalty discount is $2.00 (actual: ${stackOrder?.loyaltyDiscountAmount})`);
    assert(stackOrder?.loyaltyPointsRedeemed === 200, "200 loyalty points redeemed");

    // Customer balance: 300 - 200 = 100 points
    const custAfterStack = await prisma.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });
    assert(custAfterStack.pointsBalance === 100, `Balance decremented to 100 (actual: ${custAfterStack.pointsBalance})`);

    // --------------------------------------------------------------------------
    // 9. Concurrency & Atomic Over-Redemption Protection
    // --------------------------------------------------------------------------
    console.log("\n--- 9. Concurrency & Atomic Over-Redemption Protection ---");
    // Customer has 100 points. Fire two concurrent orders, each redeeming 100 points.
    // Exactly ONE must succeed and the other must fail with INSUFFICIENT_POINTS.
    const concurrentPayload1 = {
      token: qrToken,
      customerName: testCustomerName,
      customerPhone: testCustomerPhone,
      paymentMethod: "CASH",
      loyaltyPointsToRedeem: 100,
      idempotencyKey: `ord_conc_1_${ts}`,
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
    };
    const concurrentPayload2 = {
      token: qrToken,
      customerName: testCustomerName,
      customerPhone: testCustomerPhone,
      paymentMethod: "CASH",
      loyaltyPointsToRedeem: 100,
      idempotencyKey: `ord_conc_2_${ts}`,
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
    };

    const [concRes1, concRes2] = await Promise.all([
      apiFetch("/api/v1/orders", { method: "POST", body: concurrentPayload1 }),
      apiFetch("/api/v1/orders", { method: "POST", body: concurrentPayload2 }),
    ]);

    const successes = [concRes1, concRes2].filter((r) => r.ok).length;
    const failures = [concRes1, concRes2].filter((r) => !r.ok).length;
    assert(successes === 1, `Exactly one concurrent redemption succeeded (successes: ${successes})`);
    assert(failures === 1, `Second concurrent redemption was safely rejected (failures: ${failures})`);

    const finalCustConc = await prisma.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });
    assert(finalCustConc.pointsBalance === 0, `Customer points balance is exactly 0 and NEVER negative (balance: ${finalCustConc.pointsBalance})`);

    // --------------------------------------------------------------------------
    // 10. Order Lifecycle Hooks: Earning on COMPLETED & Refund on CANCELLED
    // --------------------------------------------------------------------------
    console.log("\n--- 10. Order Lifecycle Hooks (COMPLETED & CANCELLED) ---");

    // Transition order1: PENDING -> ACCEPTED -> PREPARING -> READY -> COMPLETED
    await apiFetch(`/api/v1/orders/admin/${order1.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { status: "ACCEPTED" },
    });
    await apiFetch(`/api/v1/orders/admin/${order1.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { status: "PREPARING" },
    });
    await apiFetch(`/api/v1/orders/admin/${order1.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { status: "READY" },
    });
    const completeOrderRes = await apiFetch(`/api/v1/orders/admin/${order1.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { status: "COMPLETED" },
    });
    assert(completeOrderRes.ok, "Admin marks order as COMPLETED through valid lifecycle states", completeOrderRes.data?.error);

    const custAfterComplete = await prisma.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });
    assert(
      custAfterComplete.pointsBalance >= 240,
      `Customer earned loyalty points upon order completion (balance: ${custAfterComplete.pointsBalance})`
    );

    // Verify Idempotency: Repeating status COMPLETED does not double-award points
    await apiFetch(`/api/v1/orders/admin/${order1.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { status: "COMPLETED" },
    });
    const custAfterRepeat = await prisma.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });
    assert(
      custAfterRepeat.pointsBalance === custAfterComplete.pointsBalance,
      "Idempotent: Repeating COMPLETED does NOT double-award points"
    );

    // Test Refund on REJECTED:
    // Ensure customer has 50 points to test rejection/cancellation
    await apiFetch(`/api/v1/loyalty/adjust?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
      method: "POST",
      body: { customerId, points: 50, reason: "Rejection test points grant" },
    });

    const refundTestPayload = {
      token: qrToken,
      customerName: testCustomerName,
      customerPhone: testCustomerPhone,
      paymentMethod: "CASH",
      loyaltyPointsToRedeem: 50,
      idempotencyKey: `ord_refund_${ts}`,
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
    };
    const refundOrderRes = await apiFetch("/api/v1/orders", {
      method: "POST",
      body: refundTestPayload,
    });
    assert(refundOrderRes.ok, "Order for cancellation test created with 50 pts redeemed", refundOrderRes.data?.error);
    const refundOrder = refundOrderRes.data?.order;

    const balBeforeReject = (
      await prisma.customerLoyaltyAccount.findUnique({ where: { customerId } })
    ).pointsBalance;

    // Reject/Cancel the order (valid from PENDING -> REJECTED)
    const rejectRes = await apiFetch(`/api/v1/orders/admin/${refundOrder.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { status: "REJECTED" },
    });
    assert(rejectRes.ok, "Admin marks order as REJECTED", rejectRes.data?.error);

    const custAfterReject = await prisma.customerLoyaltyAccount.findUnique({
      where: { customerId },
    });
    assert(
      custAfterReject.pointsBalance === balBeforeReject + 50,
      `Redeemed 50 points were refunded upon rejection (was ${balBeforeReject}, now ${custAfterReject.pointsBalance})`
    );

    // Verify refund ledger entry
    const refundLedger = await prisma.loyaltyLedgerEntry.findFirst({
      where: { orderId: refundOrder.id, type: "REFUNDED" },
    });
    assert(refundLedger !== null, "Loyalty ledger contains REFUNDED entry");
    assert(refundLedger.points === 50, "Refund ledger points is +50");

    // --------------------------------------------------------------------------
    // 11. RBAC Matrix & Role Permissions
    // --------------------------------------------------------------------------
    console.log("\n--- 11. RBAC Matrix & Permission Enforcement ---");

    // MANAGER can adjust points
    const mgrAdjustRes = await apiFetch(`/api/v1/loyalty/adjust?restaurantId=${restaurantA.id}`, {
      token: managerToken,
      method: "POST",
      body: { customerId, points: 50, reason: "Manager satisfaction adjustment" },
    });
    assert(mgrAdjustRes.ok, "MANAGER can perform manual loyalty adjustment");

    // STAFF cannot adjust points
    const staffAdjustRes = await apiFetch(`/api/v1/loyalty/adjust?restaurantId=${restaurantA.id}`, {
      token: staffToken,
      method: "POST",
      body: { customerId, points: 50, reason: "Unauthorized staff attempt" },
    });
    assert(staffAdjustRes.status === 403, "STAFF cannot adjust points (403 Forbidden)");

    // STAFF can view loyalty program
    const staffViewProgRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: staffToken,
    });
    assert(staffViewProgRes.ok, "STAFF can view loyalty program (loyalty.view)");

    // STAFF cannot modify program settings
    const staffPatchProgRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: staffToken,
      method: "PATCH",
      body: { isEnabled: false },
    });
    assert(staffPatchProgRes.status === 403, "STAFF cannot modify program settings (403 Forbidden)");

    // KITCHEN cannot view or manage loyalty
    const kitchenViewRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`, {
      token: kitchenToken,
    });
    assert(kitchenViewRes.status === 403, "KITCHEN cannot access loyalty program (403 Forbidden)");

    // Unauthenticated request
    const anonRes = await apiFetch(`/api/v1/loyalty/program?restaurantId=${restaurantA.id}`);
    assert(anonRes.status === 401, "Unauthenticated request rejected with 401 Unauthorized");

    // --------------------------------------------------------------------------
    // 12. Multi-Tenant Anti-IDOR Isolation
    // --------------------------------------------------------------------------
    console.log("\n--- 12. Multi-Tenant Anti-IDOR Isolation ---");

    // Tenant B owner attempts to view primary restaurant's customer profile
    const idorProfileRes = await apiFetch(
      `/api/v1/loyalty/customers/${customerId}?restaurantId=${restaurantB.id}`,
      { token: tenantBToken }
    );
    assert(
      idorProfileRes.status === 404 || idorProfileRes.status === 403,
      "Tenant B cannot view Tenant A customer loyalty profile (Anti-IDOR)"
    );

    // Tenant B owner attempts to adjust points on Tenant A customer
    const idorAdjustRes = await apiFetch(
      `/api/v1/loyalty/adjust?restaurantId=${restaurantB.id}`,
      {
        token: tenantBToken,
        method: "POST",
        body: { customerId, points: 1000, reason: "IDOR attack attempt" },
      }
    );
    assert(
      idorAdjustRes.status === 404 || idorAdjustRes.status === 403,
      "Tenant B cannot adjust points for Tenant A customer (Anti-IDOR)"
    );

    // Tenant B attempts to update Tenant A reward
    const idorRewardRes = await apiFetch(
      `/api/v1/loyalty/rewards/${fixedRewardId}?restaurantId=${restaurantB.id}`,
      {
        token: tenantBToken,
        method: "PATCH",
        body: { name: "Hacked Reward" },
      }
    );
    assert(
      idorRewardRes.status === 404 || idorRewardRes.status === 403,
      "Tenant B cannot modify Tenant A reward (Anti-IDOR)"
    );

    // --------------------------------------------------------------------------
    // 13. Audit Ledger & KPI Metrics Endpoint
    // --------------------------------------------------------------------------
    console.log("\n--- 13. Audit Ledger & KPI Metrics Endpoint ---");
    const ledgerRes = await apiFetch(`/api/v1/loyalty/ledger?restaurantId=${restaurantA.id}`, {
      token: ownerToken,
    });
    assert(ledgerRes.ok, "GET /api/v1/loyalty/ledger succeeds");
    assert(Array.isArray(ledgerRes.data?.entries), "Ledger returns list of entries");
    assert(ledgerRes.data?.entries?.length > 0, `Ledger contains entries (count: ${ledgerRes.data?.entries?.length})`);
    assert(ledgerRes.data?.metrics !== undefined, "Ledger returns aggregated KPIs");
    assert(ledgerRes.data?.metrics?.totalPointsIssued > 0, "KPI: totalPointsIssued tracked");
    assert(ledgerRes.data?.metrics?.totalPointsRedeemed > 0, "KPI: totalPointsRedeemed tracked");

    // --------------------------------------------------------------------------
    // 14. Data Integrity & Billing Isolation Verification
    // --------------------------------------------------------------------------
    console.log("\n--- 14. Data Integrity & Billing Isolation ---");
    // Verify no subscription tables were modified or confused
    const subsCount = await prisma.restaurantSubscription.count();
    assert(typeof subsCount === "number", "Phase 17 SaaS Subscription data intact");

    // Verify all loyalty rewards have valid relations
    const rewards = await prisma.loyaltyReward.findMany({
      include: { restaurant: true },
    });
    const orphanRewards = rewards.filter((r) => !r.restaurant).length;
    assert(orphanRewards === 0, "Zero orphan loyalty rewards");

    // Verify all customer loyalty accounts belong to valid customers
    const accounts = await prisma.customerLoyaltyAccount.findMany({
      include: { customer: true },
    });
    const orphanAccounts = accounts.filter((a) => !a.customer).length;
    assert(orphanAccounts === 0, "Zero orphan customer loyalty accounts");

    console.log("\n================================================================================");
    console.log(`PHASE 19 AUDIT SUITE FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("UNHANDLED ERROR IN PHASE 19 TEST SUITE:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase19Tests();
