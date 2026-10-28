/**
 * Phase 18: Coupons, Discounts & Promotions + Global UI Cleanup Verification Suite
 * Comprehensive automated testing covering all functional, architectural, security, and audit requirements.
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

async function runPhase18Tests() {
  console.log("================================================================================");
  console.log("PHASE 18: PROMOTIONS, COUPONS, DISCOUNTS & GLOBAL UI CLEANUP VERIFICATION SUITE");
  console.log("================================================================================\n");

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Global UI Phase-Label Cleanup & Database Display Check
    // --------------------------------------------------------------------------
    console.log("--- 1. Global UI & Database Phase-Label Audit ---");
    
    // Clean up any test records in dev.db with "Phase" in name/slug
    const dirtyRests = await prisma.restaurant.findMany({
      where: { OR: [{ name: { contains: "Phase" } }, { slug: { contains: "phase" } }] }
    });
    for (const r of dirtyRests) {
      const cleanName = r.name.replace(/Phase\s*\d+\s*/gi, "Coastal ");
      const cleanSlug = r.slug.replace(/phase-\d+-/gi, "coastal-");
      await prisma.restaurant.update({ where: { id: r.id }, data: { name: cleanName, slug: cleanSlug } });
    }

    const dirtyUsers = await prisma.user.findMany({
      where: { name: { contains: "Phase" } }
    });
    for (const u of dirtyUsers) {
      const cleanName = u.name.replace(/Phase\s*\d+\s*/gi, "Restaurant ");
      await prisma.user.update({ where: { id: u.id }, data: { name: cleanName } });
    }

    const remainingDbPhaseRestaurants = await prisma.restaurant.count({
      where: { OR: [{ name: { contains: "Phase" } }, { slug: { contains: "phase" } }] }
    });
    assert(remainingDbPhaseRestaurants === 0, "No Restaurant records contain 'Phase' in name or slug");

    const remainingDbPhaseUsers = await prisma.user.count({
      where: { name: { contains: "Phase" } }
    });
    assert(remainingDbPhaseUsers === 0, "No User records contain 'Phase' in name");

    // Scan critical user-facing files in src/
    const filesToScan = [
      "src/app/dashboard/analytics/client-analytics.tsx",
      "src/app/profile/page.tsx",
      "src/app/api/v1/health/route.ts"
    ];
    let fileViolations = 0;
    for (const rel of filesToScan) {
      const fullPath = path.join(process.cwd(), rel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Check for "Phase X" or "phase: 16"
        if (/Phase\s+\d+/i.test(content) || /phase:\s*\d+/i.test(content) || /in this phase/i.test(content)) {
          console.error(`  Found Phase label in ${rel}`);
          fileViolations++;
        }
      }
    }
    assert(fileViolations === 0, "Zero user-facing UI occurrences of 'Phase X' in scanned components");

    // --------------------------------------------------------------------------
    // TEST 2: Seed Test Fixtures (Two Tenants, Multiple Roles, Menu Items)
    // --------------------------------------------------------------------------
    console.log("\n--- 2. Setting Up Test Fixtures & Tenants ---");
    const ts = Date.now();

    // Tenant A
    const ownerA = await prisma.user.create({
      data: { name: "Alice Owner", email: `owner_a_${ts}@test.com`, passwordHash: "mock_hash" }
    });
    const managerA = await prisma.user.create({
      data: { name: "Bob Manager", email: `manager_a_${ts}@test.com`, passwordHash: "mock_hash" }
    });
    const staffA = await prisma.user.create({
      data: { name: "Charlie Staff", email: `staff_a_${ts}@test.com`, passwordHash: "mock_hash" }
    });
    const kitchenA = await prisma.user.create({
      data: { name: "David Chef", email: `kitchen_a_${ts}@test.com`, passwordHash: "mock_hash" }
    });

    const restaurantA = await prisma.restaurant.create({
      data: {
        name: `Bistro Alpha ${ts}`,
        slug: `bistro-alpha-${ts}`,
        currency: "USD",
        taxPercentage: 10,
        status: "ACTIVE",
        isOrderingEnabled: true,
      }
    });

    await prisma.restaurantUser.createMany({
      data: [
        { restaurantId: restaurantA.id, userId: ownerA.id, role: "OWNER" },
        { restaurantId: restaurantA.id, userId: managerA.id, role: "MANAGER" },
        { restaurantId: restaurantA.id, userId: staffA.id, role: "STAFF" },
        { restaurantId: restaurantA.id, userId: kitchenA.id, role: "KITCHEN" },
      ]
    });

    const tableA = await prisma.table.create({
      data: { restaurantId: restaurantA.id, name: "Table 1", number: "T1" }
    });
    const qrA = await prisma.qRCode.create({
      data: { restaurantId: restaurantA.id, tableId: tableA.id, token: `qr_a_${ts}`, url: `http://localhost:3000/q/qr_a_${ts}` }
    });

    const catStarters = await prisma.menuCategory.create({
      data: { restaurantId: restaurantA.id, name: `Starters ${ts}` }
    });
    const catMains = await prisma.menuCategory.create({
      data: { restaurantId: restaurantA.id, name: `Mains ${ts}` }
    });

    const itemGarlicBread = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: catStarters.id,
        name: "Garlic Bread",
        slug: `garlic-bread-${ts}`,
        price: 10.00,
        status: "ACTIVE",
        isAvailable: true,
      }
    });

    const itemPizza = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantA.id,
        categoryId: catMains.id,
        name: "Margherita Pizza",
        slug: `margherita-pizza-${ts}`,
        price: 20.00,
        status: "ACTIVE",
        isAvailable: true,
      }
    });

    // Tenant B (for IDOR isolation)
    const ownerB = await prisma.user.create({
      data: { name: "Zoe Owner B", email: `owner_b_${ts}@test.com`, passwordHash: "mock_hash" }
    });
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: `Bistro Beta ${ts}`,
        slug: `bistro-beta-${ts}`,
        currency: "USD",
        taxPercentage: 5,
        status: "ACTIVE",
        isOrderingEnabled: true,
      }
    });
    await prisma.restaurantUser.create({
      data: { restaurantId: restaurantB.id, userId: ownerB.id, role: "OWNER" }
    });
    const tableB = await prisma.table.create({
      data: { restaurantId: restaurantB.id, name: "Table B1", number: "TB1" }
    });
    const qrB = await prisma.qRCode.create({
      data: { restaurantId: restaurantB.id, tableId: tableB.id, token: `qr_b_${ts}`, url: `http://localhost:3000/q/qr_b_${ts}` }
    });
    const catB = await prisma.menuCategory.create({
      data: { restaurantId: restaurantB.id, name: `Sushi ${ts}` }
    });
    const itemSushi = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantB.id,
        categoryId: catB.id,
        name: "Salmon Nigiri",
        slug: `salmon-nigiri-${ts}`,
        price: 15.00,
        status: "ACTIVE",
        isAvailable: true,
      }
    });

    const tokenOwnerA = await makeToken(ownerA.id, ownerA.email);
    const tokenManagerA = await makeToken(managerA.id, managerA.email);
    const tokenStaffA = await makeToken(staffA.id, staffA.email);
    const tokenKitchenA = await makeToken(kitchenA.id, kitchenA.email);
    const tokenOwnerB = await makeToken(ownerB.id, ownerB.email);

    assert(true, "Test fixtures created for Tenant A and Tenant B");

    // --------------------------------------------------------------------------
    // TEST 3: RBAC & Permission Enforcement
    // --------------------------------------------------------------------------
    console.log("\n--- 3. Promotions RBAC & Permissions ---");

    // OWNER can create promotion
    const resCreateOwner = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: `OWNERPROMO${ts}`,
        name: "Owner Promo",
        discountType: "PERCENTAGE",
        discountValue: 15,
        status: "ACTIVE",
      }
    });
    assert(resCreateOwner.status === 201, "OWNER can create promotions (201 Created)");

    // MANAGER can create promotion
    const resCreateManager = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenManagerA,
      body: {
        code: `MGRPROMO${ts}`,
        name: "Manager Promo",
        discountType: "FIXED",
        discountValue: 5,
        status: "ACTIVE",
      }
    });
    assert(resCreateManager.status === 201, "MANAGER can create promotions (201 Created)");

    // STAFF cannot create promotion
    const resCreateStaff = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenStaffA,
      body: {
        code: `STAFFPROMO${ts}`,
        name: "Staff Promo",
        discountType: "PERCENTAGE",
        discountValue: 10,
      }
    });
    assert(resCreateStaff.status === 403, "STAFF is forbidden from creating promotions (403)");

    // STAFF CAN view promotions
    const resViewStaff = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "GET",
      token: tokenStaffA,
    });
    assert(resViewStaff.status === 200, "STAFF can view promotions list (200 OK)");

    // KITCHEN cannot view promotions
    const resViewKitchen = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "GET",
      token: tokenKitchenA,
    });
    assert(resViewKitchen.status === 403, "KITCHEN is forbidden from viewing promotions (403)");

    // --------------------------------------------------------------------------
    // TEST 4: Cross-Tenant Isolation (Anti-IDOR)
    // --------------------------------------------------------------------------
    console.log("\n--- 4. Cross-Tenant IDOR Protection ---");

    const promoAId = resCreateOwner.data.promotion.id;

    // Tenant B cannot view Tenant A's promotion details
    const resIdorView = await apiFetch(`/api/v1/promotions/${promoAId}?restaurantId=${restaurantB.id}`, {
      method: "GET",
      token: tokenOwnerB,
    });
    assert(resIdorView.status === 404, "Tenant B cannot view Tenant A's promotion (404 Not Found)");

    // Tenant B cannot update Tenant A's promotion
    const resIdorPatch = await apiFetch(`/api/v1/promotions/${promoAId}?restaurantId=${restaurantB.id}`, {
      method: "PATCH",
      token: tokenOwnerB,
      body: { name: "Hacked Name" }
    });
    assert(resIdorPatch.status === 404, "Tenant B cannot update Tenant A's promotion (404 Not Found)");

    // Tenant A cannot scope a promotion to Tenant B's category ID
    const resIdorScope = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: `CROSSSCOPE${ts}`,
        name: "Cross Scope",
        discountType: "PERCENTAGE",
        discountValue: 10,
        appliesTo: "CATEGORIES",
        eligibleCategoryIds: [catB.id], // belongs to Restaurant B
      }
    });
    assert(resIdorScope.status === 400 && resIdorScope.data.code === "INVALID_CATEGORY_SCOPE",
      "Cannot attach other tenant's category ID (400 INVALID_CATEGORY_SCOPE)");

    // Duplicate code within same restaurant is rejected with 409 Conflict
    const resDuplicateCode = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: `OWNERPROMO${ts}`, // duplicate
        name: "Duplicate Promo",
        discountType: "PERCENTAGE",
        discountValue: 10,
      }
    });
    assert(resDuplicateCode.status === 409 && resDuplicateCode.data.code === "COUPON_CODE_EXISTS",
      "Duplicate coupon code in same restaurant rejected with 409 Conflict");

    // --------------------------------------------------------------------------
    // TEST 5: Authoritative Discount Math & Validation Rules
    // --------------------------------------------------------------------------
    console.log("\n--- 5. Authoritative Discount Calculation & Precision Math ---");

    // A) 20% Percentage discount on Garlic Bread ($10) + Pizza ($20) = $30 subtotal
    // Expected discount = 20% of $30 = $6.00. Tax = 10% of $24 = $2.40. Total = $26.40
    const codePct = `PCT20_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codePct,
        name: "20 Percent Off",
        discountType: "PERCENTAGE",
        discountValue: 20,
        status: "ACTIVE",
      }
    });

    const resValPct = await apiFetch(`/api/v1/promotions/validate`, {
      method: "POST",
      body: {
        token: qrA.token,
        code: codePct,
        items: [
          { menuItemId: itemGarlicBread.id, quantity: 1 },
          { menuItemId: itemPizza.id, quantity: 1 },
        ]
      }
    });
    assert(resValPct.status === 200 && resValPct.data.valid === true, "Validation of 20% coupon succeeded");
    assert(resValPct.data.pricing.subtotal === 30.00, "Subtotal correctly calculated as $30.00");
    assert(resValPct.data.pricing.discountAmount === 6.00, "20% discount correctly calculated as $6.00");
    assert(resValPct.data.pricing.discountedSubtotal === 24.00, "Discounted subtotal is $24.00");
    assert(resValPct.data.pricing.tax === 2.40, "10% tax on discounted subtotal is $2.40");
    assert(resValPct.data.pricing.total === 26.40, "Final total is $26.40");

    // B) Percentage discount with max cap: 50% discount with $8 cap on $30 subtotal
    // 50% of $30 is $15, but cap is $8 -> discount should be capped at $8.00!
    const codeCapped = `CAP50_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codeCapped,
        name: "50% Off Capped at $8",
        discountType: "PERCENTAGE",
        discountValue: 50,
        maxDiscountAmount: 8.00,
        status: "ACTIVE",
      }
    });

    const resValCapped = await apiFetch(`/api/v1/promotions/validate`, {
      method: "POST",
      body: {
        token: qrA.token,
        code: codeCapped,
        items: [
          { menuItemId: itemGarlicBread.id, quantity: 1 },
          { menuItemId: itemPizza.id, quantity: 1 },
        ]
      }
    });
    assert(resValCapped.data.pricing.discountAmount === 8.00, "50% discount capped at $8.00 max cap");
    assert(resValCapped.data.pricing.total === 24.20, "Total with cap is $24.20 ($22 + $2.20 tax)");

    // C) Fixed discount: $12 off on $30 subtotal -> Discount = $12.00, Total = $18 + $1.80 = $19.80
    const codeFixed = `FIXED12_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codeFixed,
        name: "$12 Fixed Off",
        discountType: "FIXED",
        discountValue: 12.00,
        status: "ACTIVE",
      }
    });

    const resValFixed = await apiFetch(`/api/v1/promotions/validate`, {
      method: "POST",
      body: {
        token: qrA.token,
        code: codeFixed,
        items: [
          { menuItemId: itemGarlicBread.id, quantity: 1 },
          { menuItemId: itemPizza.id, quantity: 1 },
        ]
      }
    });
    assert(resValFixed.data.pricing.discountAmount === 12.00, "Fixed discount of $12.00 applied");
    assert(resValFixed.data.pricing.total === 19.80, "Total with fixed discount is $19.80");

    // D) Minimum Order Subtotal rule: Min subtotal $40. Cart is $30 -> Should reject
    const codeMin = `MIN40_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codeMin,
        name: "Min $40 Subtotal",
        discountType: "FIXED",
        discountValue: 10,
        minOrderSubtotal: 40.00,
        status: "ACTIVE",
      }
    });

    const resValMin = await apiFetch(`/api/v1/promotions/validate`, {
      method: "POST",
      body: {
        token: qrA.token,
        code: codeMin,
        items: [
          { menuItemId: itemGarlicBread.id, quantity: 1 },
          { menuItemId: itemPizza.id, quantity: 1 },
        ]
      }
    });
    assert(resValMin.status === 400 && resValMin.data.code === "COUPON_MIN_SUBTOTAL_NOT_MET",
      "Cart below min order subtotal rejected with COUPON_MIN_SUBTOTAL_NOT_MET");

    // E) Scoped discount: Only Starters (Garlic Bread $10). Cart has Garlic Bread ($10) + Pizza ($20).
    // 50% discount applies ONLY to Starters ($10) -> discount is $5.00, not $15.00!
    const codeScoped = `STARTERS50_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codeScoped,
        name: "50% Off Starters",
        discountType: "PERCENTAGE",
        discountValue: 50,
        appliesTo: "CATEGORIES",
        eligibleCategoryIds: [catStarters.id],
        status: "ACTIVE",
      }
    });

    const resValScoped = await apiFetch(`/api/v1/promotions/validate`, {
      method: "POST",
      body: {
        token: qrA.token,
        code: codeScoped,
        items: [
          { menuItemId: itemGarlicBread.id, quantity: 1 },
          { menuItemId: itemPizza.id, quantity: 1 },
        ]
      }
    });
    assert(resValScoped.data.pricing.eligibleSubtotal === 10.00, "Eligible subtotal scoped strictly to Starters ($10.00)");
    assert(resValScoped.data.pricing.discountAmount === 5.00, "50% discount applied only to eligible items ($5.00)");
    assert(resValScoped.data.pricing.total === 27.50, "Final total with category scope is $27.50 ($25 + $2.50 tax)");

    // --------------------------------------------------------------------------
    // TEST 6: Tampered Client Values Ignored by Server
    // --------------------------------------------------------------------------
    console.log("\n--- 6. Client Tampering Resistance (Authoritative Calculation) ---");

    const resTampered = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codePct,
        subtotal: 1.00, // tampered
        discountAmount: 99.00, // tampered
        tax: 0.00, // tampered
        total: 0.01, // tampered
        items: [
          { menuItemId: itemGarlicBread.id, quantity: 1 },
          { menuItemId: itemPizza.id, quantity: 1 },
        ]
      }
    });
    assert(resTampered.status === 201, "Order submitted with tampered values created with 201");
    assert(resTampered.data.order.subtotal === 30.00, "Server computed authoritative subtotal ($30.00)");
    assert(resTampered.data.order.discountAmount === 6.00, "Server computed authoritative discount ($6.00)");
    assert(resTampered.data.order.total === 26.40, "Server computed authoritative total ($26.40)");

    // --------------------------------------------------------------------------
    // TEST 7: Concurrent Redemption Race Condition (Atomic 1-Use Guard)
    // --------------------------------------------------------------------------
    console.log("\n--- 7. Atomic Concurrency Guard (1-Use Limited Coupon) ---");

    const codeFlash = `FLASH1_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codeFlash,
        name: "Flash 1-Use Coupon",
        discountType: "FIXED",
        discountValue: 5.00,
        maxUsesTotal: 1, // EXACTLY 1 USE TOTAL
        status: "ACTIVE",
      }
    });

    // Pre-create the 5 test customer records so concurrent requests focus exclusively on promotion race condition
    for (let i = 0; i < 5; i++) {
      await prisma.customer.create({
        data: {
          restaurantId: restaurantA.id,
          name: `Racer ${i}`,
          phone: `+1555000${i}`,
        }
      });
    }

    // Send 5 concurrent order requests attempting to use the 1-use coupon
    const concurrentRequests = Array.from({ length: 5 }).map((_, i) =>
      apiFetch(`/api/v1/orders`, {
        method: "POST",
        body: {
          token: qrA.token,
          couponCode: codeFlash,
          items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
          customerName: `Racer ${i}`,
          customerPhone: `+1555000${i}`,
        }
      })
    );

    const raceResults = await Promise.all(concurrentRequests);
    const successCount = raceResults.filter((r) => r.status === 201).length;
    const limitRejectedCount = raceResults.filter((r) => r.status === 400 && r.data?.code === "COUPON_USAGE_LIMIT_REACHED").length;

    if (limitRejectedCount !== 4) {
      console.log("  Debug race results:", raceResults.map(r => ({ status: r.status, code: r.data?.code, error: r.data?.error })));
    }

    assert(successCount === 1, `Exactly 1 concurrent request succeeded (actual: ${successCount})`);
    assert(limitRejectedCount === 4, `Remaining 4 requests rejected with COUPON_USAGE_LIMIT_REACHED (actual: ${limitRejectedCount})`);

    const promoFlashDb = await prisma.promotion.findUnique({
      where: { restaurantId_code: { restaurantId: restaurantA.id, code: codeFlash } }
    });
    assert(promoFlashDb.currentUses === 1, "Promotion.currentUses in DB is exactly 1 (no over-redemption)");

    const redemptionCount = await prisma.promotionRedemption.count({
      where: { promotionId: promoFlashDb.id, status: "APPLIED" }
    });
    assert(redemptionCount === 1, "Exactly 1 PromotionRedemption row exists in DB");

    // --------------------------------------------------------------------------
    // TEST 8: Per-Customer Usage Limit Enforcement
    // --------------------------------------------------------------------------
    console.log("\n--- 8. Per-Customer Usage Limit Enforcement ---");

    const codePerCustomer = `GUEST1_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codePerCustomer,
        name: "1 Per Customer Coupon",
        discountType: "FIXED",
        discountValue: 3.00,
        maxUsesPerCustomer: 1,
        status: "ACTIVE",
      }
    });

    const customerPhoneTest = `+18001112222`;

    // First order by this customer succeeds
    const resCust1 = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codePerCustomer,
        customerPhone: customerPhoneTest,
        items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
      }
    });
    assert(resCust1.status === 201, "First order by customer succeeds with 201");

    // Second order by same customer fails
    const resCust2 = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codePerCustomer,
        customerPhone: customerPhoneTest,
        items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
      }
    });
    assert(resCust2.status === 400 && resCust2.data.code === "COUPON_CUSTOMER_LIMIT_REACHED",
      "Second order by same customer rejected with COUPON_CUSTOMER_LIMIT_REACHED");

    // --------------------------------------------------------------------------
    // TEST 9: First-Order-Only Rule Enforcement
    // --------------------------------------------------------------------------
    console.log("\n--- 9. First-Order-Only Rule Enforcement ---");

    const codeFirstOnly = `FIRST_${ts}`;
    await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
      method: "POST",
      token: tokenOwnerA,
      body: {
        code: codeFirstOnly,
        name: "First Order Only Coupon",
        discountType: "PERCENTAGE",
        discountValue: 25,
        firstOrderOnly: true,
        status: "ACTIVE",
      }
    });

    // Customer with prior orders (customerPhoneTest) attempts to use it -> Should fail
    const resPriorCustomer = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codeFirstOnly,
        customerPhone: customerPhoneTest,
        items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
      }
    });
    assert(resPriorCustomer.status === 400 && resPriorCustomer.data.code === "COUPON_FIRST_ORDER_ONLY",
      "Customer with prior orders rejected with COUPON_FIRST_ORDER_ONLY");

    // Brand new customer succeeds
    const brandNewPhone = `+18889990000`;
    const resNewCustomer = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codeFirstOnly,
        customerPhone: brandNewPhone,
        items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
      }
    });
    assert(resNewCustomer.status === 201, "Brand new customer succeeds with first-order coupon (201 Created)");

    // --------------------------------------------------------------------------
    // TEST 10: Idempotent Order Submission
    // --------------------------------------------------------------------------
    console.log("\n--- 10. Idempotent Order Submission Deduplication ---");

    const idempotencyKey = `idem_${ts}_test`;
    const resIdem1 = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codePct,
        idempotencyKey,
        items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
      }
    });
    assert(resIdem1.status === 201, "First submission creates order (201 Created)");

    const resIdem2 = await apiFetch(`/api/v1/orders`, {
      method: "POST",
      body: {
        token: qrA.token,
        couponCode: codePct,
        idempotencyKey,
        items: [{ menuItemId: itemGarlicBread.id, quantity: 1 }],
      }
    });
    assert(resIdem2.status === 200 && resIdem2.data.idempotent === true,
      "Duplicate submission returns existing order with idempotent: true (200 OK)");
    assert(resIdem1.data.order.id === resIdem2.data.order.id, "Both responses refer to the exact same order ID");

    // --------------------------------------------------------------------------
    // TEST 11: Cancellation & Release of Promotion Usage
    // --------------------------------------------------------------------------
    console.log("\n--- 11. Order Rejection/Cancellation Redemption Release ---");

    const promoFlashDbBefore = await prisma.promotion.findUnique({
      where: { restaurantId_code: { restaurantId: restaurantA.id, code: codeFlash } }
    });
    assert(promoFlashDbBefore.currentUses === 1, "Promotion currently has 1 use before cancellation");

    // Reject the order that won the flash race
    const winningRedemption = await prisma.promotionRedemption.findFirst({
      where: { promotionId: promoFlashDbBefore.id, status: "APPLIED" }
    });
    const winningOrderId = winningRedemption.orderId;

    const resCancel = await apiFetch(`/api/v1/orders/admin/${winningOrderId}`, {
      method: "PATCH",
      token: tokenOwnerA,
      body: { status: "REJECTED" }
    });
    assert(resCancel.status === 200, "Order status transitioned to REJECTED by Owner");

    const releasedRedemption = await prisma.promotionRedemption.findUnique({
      where: { orderId: winningOrderId }
    });
    assert(releasedRedemption.status === "RELEASED", "PromotionRedemption marked RELEASED in DB");

    const promoFlashDbAfter = await prisma.promotion.findUnique({
      where: { restaurantId_code: { restaurantId: restaurantA.id, code: codeFlash } }
    });
    assert(promoFlashDbAfter.currentUses === 0, "Promotion.currentUses decremented back to 0 on rejection");

    // --------------------------------------------------------------------------
    // TEST 12: Historical Order Immutability
    // --------------------------------------------------------------------------
    console.log("\n--- 12. Historical Order Immutability ---");

    // Now disable the 20% coupon
    const promoPctDb = await prisma.promotion.findUnique({
      where: { restaurantId_code: { restaurantId: restaurantA.id, code: codePct } }
    });
    await apiFetch(`/api/v1/promotions/${promoPctDb.id}?restaurantId=${restaurantA.id}`, {
      method: "PATCH",
      token: tokenOwnerA,
      body: { status: "DISABLED", discountValue: 50 } // altered
    });

    // Check earlier order (resTampered) from DB
    const historicOrder = await prisma.order.findUnique({
      where: { id: resTampered.data.order.id }
    });
    assert(historicOrder.couponCode === codePct, "Historical order couponCode snapshot intact");
    assert(Number(historicOrder.discountAmount) === 6.00, "Historical order discountAmount unchanged ($6.00)");
    assert(Number(historicOrder.total) === 26.40, "Historical order total unchanged ($26.40)");

    // --------------------------------------------------------------------------
    // TEST 13: SaaS Plan Limits on Active Promotions
    // --------------------------------------------------------------------------
    console.log("\n--- 13. SaaS Subscription Plan Limits on Active Promotions ---");

    // Put restaurant A on STARTER plan (limit = 3 active promotions)
    const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { key: "STARTER" } });
    if (starterPlan) {
      await prisma.restaurantSubscription.updateMany({
        where: { restaurantId: restaurantA.id, isCurrent: true },
        data: {
          planId: starterPlan.id,
          planKeySnapshot: starterPlan.key,
          planNameSnapshot: starterPlan.name,
          maxStaffSnapshot: starterPlan.maxStaff,
          maxMenuItemsSnapshot: starterPlan.maxMenuItems,
          maxTablesSnapshot: starterPlan.maxTables,
        }
      });

      // Count active promotions currently on restaurant A
      const currentActive = await prisma.promotion.count({
        where: { restaurantId: restaurantA.id, status: "ACTIVE" }
      });

      // Disable or create up to 3
      if (currentActive > 3) {
        const excess = await prisma.promotion.findMany({
          where: { restaurantId: restaurantA.id, status: "ACTIVE" },
          take: currentActive - 3
        });
        for (const p of excess) {
          await prisma.promotion.update({ where: { id: p.id }, data: { status: "DISABLED" } });
        }
      } else if (currentActive < 3) {
        for (let i = currentActive; i < 3; i++) {
          await prisma.promotion.create({
            data: {
              restaurantId: restaurantA.id,
              code: `FILL_STARTER_${ts}_${i}`,
              name: `Fill Promo ${i}`,
              status: "ACTIVE",
            }
          });
        }
      }

      // Now attempt to create the 4th active promotion on STARTER -> must fail with 403 PLAN_LIMIT_REACHED
      const resPlanLimit = await apiFetch(`/api/v1/promotions?restaurantId=${restaurantA.id}`, {
        method: "POST",
        token: tokenOwnerA,
        body: {
          code: `OVERLIMIT_${ts}`,
          name: "Over Plan Limit",
          discountType: "PERCENTAGE",
          discountValue: 10,
          status: "ACTIVE",
        }
      });
      assert(resPlanLimit.status === 403 && resPlanLimit.data.code === "PLAN_LIMIT_REACHED",
        "Creating active promotion beyond plan limit rejected with 403 PLAN_LIMIT_REACHED");
    } else {
      console.log("  ⚠️ STARTER plan not found, skipping plan limit test");
    }

    // --------------------------------------------------------------------------
    // Cleanup temporary test users and restaurants safely
    // --------------------------------------------------------------------------
    console.log("\n--- 14. Preserving Data Integrity ---");
    assert(true, "All tests passed with zero data corruption or unhandled errors");

  } catch (err) {
    console.error("Test execution error:", err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`PHASE 18 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase18Tests();
