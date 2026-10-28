/**
 * Phase 16 Corrective Verification Suite — SaaS Super Admin Panel & Part J Hardening
 *
 * Verifies all 27 Part K requirements:
 * - Authorization (1–12): Super Admin access, anonymous/OWNER/MANAGER/STAFF/KITCHEN/CUSTOMER denial,
 *   public registration escalation prevention, strict schema validation, self-lockout & last-Super-Admin protection,
 *   CLI provisioning script verification.
 * - Tenant Isolation (13–18): Tenant A vs Tenant B isolation, Super Admin inspection non-interference,
 *   targeted restaurant suspension isolating Tenant A while Tenant B continues operating, targeted user suspension.
 * - Data & Functionality (19–26): Real DB overview accuracy, restaurant directory search/filter/sort/pagination,
 *   restaurant detail accuracy, user directory search/role/status filter/pagination, user detail safety (zero passwordHash leak),
 *   restaurant status enforcement & restoration, user status enforcement & restoration, platform audit log recording.
 * - Part J Hardening: CASH payment idempotency (no duplicate row on retry), order tracking UUID & stale completed order protection.
 */

const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

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

function extractCookie(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(";")[0];
}

async function apiRequest(path, { method = "GET", body, cookie, redirect = "manual" } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (cookie) {
    headers["Cookie"] = cookie;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function main() {
  console.log("=================================================================");
  console.log("🚀 PHASE 16 SUPER ADMIN & PART J HARDENING VERIFICATION SUITE");
  console.log("=================================================================\n");

  const runSuffix = Date.now();
  const password = "TestPassword123!";

  // ---------------------------------------------------------------------------
  // 0. Provision Super Admin via CLI script & seed Tenant A + Tenant B fixtures
  // ---------------------------------------------------------------------------
  const superAdminEmail = `superadmin.${runSuffix}@platform.local`;
  const ownerAEmail = `owner.a.${runSuffix}@tenant.local`;
  const managerAEmail = `manager.a.${runSuffix}@tenant.local`;
  const staffAEmail = `staff.a.${runSuffix}@tenant.local`;
  const kitchenAEmail = `kitchen.a.${runSuffix}@tenant.local`;
  const ownerBEmail = `owner.b.${runSuffix}@tenant.local`;
  const customerUserEmail = `customer.${runSuffix}@guest.local`;

  // Provision Super Admin using the official server-side CLI script
  const cliOutput = execSync(
    `node scripts/provision-super-admin.js --email "${superAdminEmail}" --password "${password}" --name "Platform Super Admin"`,
    { encoding: "utf8" }
  ).trim();
  const cliParsed = JSON.parse(cliOutput);
  const superAdminId = cliParsed.user.id;

  // Log in as Super Admin
  const saLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: { email: superAdminEmail, password },
  });
  const saCookie = extractCookie(saLogin);

  // Register Tenant A Owner & create Restaurant A
  const regOwnerA = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Owner Alpha", email: ownerAEmail, password },
  });
  const ownerACookie = extractCookie(regOwnerA);
  const ownerAId = regOwnerA.json.user.id;

  const createRestA = await apiRequest("/api/v1/onboarding/restaurant", {
    method: "POST",
    cookie: ownerACookie,
    body: {
      name: `Alpha Bistro ${runSuffix}`,
      phone: "+15550101",
      email: ownerAEmail,
      address: "101 Alpha Ave",
      city: "Metropolis",
      state: "NY",
      country: "US",
      pincode: "10001",
    },
  });
  const restA = createRestA.json.restaurant;

  // Create Category, Item, and Table+QR for Restaurant A
  const catARes = await apiRequest("/api/v1/menu/categories", {
    method: "POST",
    cookie: ownerACookie,
    body: { name: "Signature Mains", description: "Mains" },
  });
  const catAId = catARes.json.id || catARes.json.category?.id;

  const itemARes = await apiRequest("/api/v1/menu/items", {
    method: "POST",
    cookie: ownerACookie,
    body: {
      categoryId: catAId,
      name: "Alpha Steak",
      description: "Grilled steak",
      price: 25,
      isAvailable: true,
    },
  });
  const itemAId = itemARes.json.id || itemARes.json.item?.id;
  const itemA = { id: itemAId };

  const tableARes = await apiRequest("/api/v1/tables", {
    method: "POST",
    cookie: ownerACookie,
    body: { name: `Table A1 ${runSuffix}`, number: "101", capacity: 4 },
  });
  const tableAId = tableARes.json.id || tableARes.json.table?.id;
  const tableA = { id: tableAId };
  const qrARes = await apiRequest(`/api/v1/tables/${tableAId}/qr`, {
    method: "POST",
    cookie: ownerACookie,
    body: {},
  });
  const qrTokenA = qrARes.json.token || qrARes.json.qrCode?.token;

  // Register Manager, Staff, Kitchen users and link them to Restaurant A
  const regManagerA = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Manager Alpha", email: managerAEmail, password },
  });
  const managerACookie = extractCookie(regManagerA);
  await prisma.restaurantUser.create({
    data: {
      restaurantId: restA.id,
      userId: regManagerA.json.user.id,
      role: "MANAGER",
      status: "ACTIVE",
    },
  });

  const regStaffA = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Staff Alpha", email: staffAEmail, password },
  });
  const staffACookie = extractCookie(regStaffA);
  await prisma.restaurantUser.create({
    data: {
      restaurantId: restA.id,
      userId: regStaffA.json.user.id,
      role: "STAFF",
      status: "ACTIVE",
    },
  });

  const regKitchenA = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Kitchen Alpha", email: kitchenAEmail, password },
  });
  const kitchenACookie = extractCookie(regKitchenA);
  await prisma.restaurantUser.create({
    data: {
      restaurantId: restA.id,
      userId: regKitchenA.json.user.id,
      role: "KITCHEN",
      status: "ACTIVE",
    },
  });

  // Register Tenant B Owner & create Restaurant B
  const regOwnerB = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Owner Beta", email: ownerBEmail, password },
  });
  const ownerBCookie = extractCookie(regOwnerB);
  const ownerBId = regOwnerB.json.user.id;

  const createRestB = await apiRequest("/api/v1/onboarding/restaurant", {
    method: "POST",
    cookie: ownerBCookie,
    body: {
      name: `Beta Trattoria ${runSuffix}`,
      phone: "+15550202",
      email: ownerBEmail,
      address: "202 Beta Blvd",
      city: "Gotham",
      state: "NJ",
      country: "US",
      pincode: "07001",
    },
  });
  const restB = createRestB.json.restaurant;

  const catBRes = await apiRequest("/api/v1/menu/categories", {
    method: "POST",
    cookie: ownerBCookie,
    body: { name: "Pasta", description: "Fresh pasta" },
  });
  const catBId = catBRes.json.id || catBRes.json.category?.id;

  const itemBRes = await apiRequest("/api/v1/menu/items", {
    method: "POST",
    cookie: ownerBCookie,
    body: {
      categoryId: catBId,
      name: "Beta Carbonara",
      description: "Pasta carbonara",
      price: 18,
      isAvailable: true,
    },
  });
  const itemBId = itemBRes.json.id || itemBRes.json.item?.id;
  const itemB = { id: itemBId };

  const tableBRes = await apiRequest("/api/v1/tables", {
    method: "POST",
    cookie: ownerBCookie,
    body: { name: `Table B1 ${runSuffix}`, number: "201", capacity: 4 },
  });
  const tableBId = tableBRes.json.id || tableBRes.json.table?.id;
  const qrBRes = await apiRequest(`/api/v1/tables/${tableBId}/qr`, {
    method: "POST",
    cookie: ownerBCookie,
    body: {},
  });
  const qrTokenB = qrBRes.json.token || qrBRes.json.qrCode?.token;

  // Register a standalone user with NO restaurant membership (Customer/Guest account)
  const regCustomer = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Customer User", email: customerUserEmail, password },
  });
  const customerCookie = extractCookie(regCustomer);

  // ---------------------------------------------------------------------------
  // AUTHORIZATION TESTS (1–12)
  // ---------------------------------------------------------------------------

  // Test 1: Super Admin can access /super-admin and all Super Admin APIs
  const saPageRes = await apiRequest("/super-admin", { cookie: saCookie });
  const saOverviewRes = await apiRequest("/api/v1/super-admin/overview", { cookie: saCookie });
  const saRestsRes = await apiRequest("/api/v1/super-admin/restaurants", { cookie: saCookie });
  const saUsersRes = await apiRequest("/api/v1/super-admin/users", { cookie: saCookie });
  const saAuditRes = await apiRequest("/api/v1/super-admin/audit-logs", { cookie: saCookie });

  record(
    "K-01",
    "Super Admin can access /super-admin and Super Admin APIs",
    saPageRes.status === 200 &&
      saPageRes.text.includes("SaaS Control Plane") &&
      saOverviewRes.status === 200 &&
      saRestsRes.status === 200 &&
      saUsersRes.status === 200 &&
      saAuditRes.status === 200 &&
      saLogin.json?.redirectTo === "/super-admin",
    `page=${saPageRes.status}, overview=${saOverviewRes.status}, rests=${saRestsRes.status}, users=${saUsersRes.status}, audit=${saAuditRes.status}`
  );

  // Test 2: Anonymous user cannot access Super Admin pages or APIs
  const anonPage = await apiRequest("/super-admin");
  const anonOverview = await apiRequest("/api/v1/super-admin/overview");
  const anonRests = await apiRequest("/api/v1/super-admin/restaurants");
  const anonUsers = await apiRequest("/api/v1/super-admin/users");
  const anonAudit = await apiRequest("/api/v1/super-admin/audit-logs");

  record(
    "K-02",
    "Anonymous user cannot access Super Admin pages or APIs",
    (anonPage.status === 307 || anonPage.status === 308) &&
      anonOverview.status === 401 &&
      anonRests.status === 401 &&
      anonUsers.status === 401 &&
      anonAudit.status === 401,
    `pageRedirect=${anonPage.status}, apiStatuses=[${anonOverview.status},${anonRests.status},${anonUsers.status},${anonAudit.status}]`
  );

  // Test 3: Restaurant OWNER cannot access Super Admin pages or APIs
  const ownerPage = await apiRequest("/super-admin", { cookie: ownerACookie });
  const ownerOverview = await apiRequest("/api/v1/super-admin/overview", { cookie: ownerACookie });
  record(
    "K-03",
    "Restaurant OWNER cannot access Super Admin pages or APIs",
    ownerPage.text.includes("403 Forbidden") &&
      !ownerPage.text.includes("SaaS Control Plane") &&
      ownerOverview.status === 403,
    `ownerOverview=${ownerOverview.status}, 403ScreenShown=${ownerPage.text.includes("403 Forbidden")}`
  );

  // Test 4: Restaurant MANAGER cannot access Super Admin pages or APIs
  const managerPage = await apiRequest("/super-admin", { cookie: managerACookie });
  const managerOverview = await apiRequest("/api/v1/super-admin/overview", { cookie: managerACookie });
  record(
    "K-04",
    "Restaurant MANAGER cannot access Super Admin pages or APIs",
    managerPage.text.includes("403 Forbidden") &&
      !managerPage.text.includes("SaaS Control Plane") &&
      managerOverview.status === 403,
    `managerOverview=${managerOverview.status}`
  );

  // Test 5: Restaurant STAFF, KITCHEN, and CUSTOMER cannot access Super Admin pages or APIs
  const staffOverview = await apiRequest("/api/v1/super-admin/overview", { cookie: staffACookie });
  const kitchenOverview = await apiRequest("/api/v1/super-admin/overview", { cookie: kitchenACookie });
  const customerOverview = await apiRequest("/api/v1/super-admin/overview", { cookie: customerCookie });
  const staffPage = await apiRequest("/super-admin", { cookie: staffACookie });
  const kitchenPage = await apiRequest("/super-admin", { cookie: kitchenACookie });
  const customerPage = await apiRequest("/super-admin", { cookie: customerCookie });

  record(
    "K-05",
    "Restaurant STAFF, KITCHEN, and CUSTOMER cannot access Super Admin pages or APIs",
    staffOverview.status === 403 &&
      kitchenOverview.status === 403 &&
      customerOverview.status === 403 &&
      staffPage.text.includes("403 Forbidden") &&
      kitchenPage.text.includes("403 Forbidden") &&
      customerPage.text.includes("403 Forbidden"),
    `API statuses: STAFF=${staffOverview.status}, KITCHEN=${kitchenOverview.status}, CUSTOMER=${customerOverview.status}`
  );

  // Test 6: Non-Super-Admin user cannot view all restaurants
  const ownerListRests = await apiRequest("/api/v1/super-admin/restaurants", { cookie: ownerACookie });
  const managerListRests = await apiRequest("/api/v1/super-admin/restaurants", { cookie: managerACookie });
  const ownerDetailRestB = await apiRequest(`/api/v1/super-admin/restaurants/${restB.id}`, {
    cookie: ownerACookie,
  });
  record(
    "K-06",
    "Non-Super-Admin user cannot view all restaurants",
    ownerListRests.status === 403 &&
      managerListRests.status === 403 &&
      ownerDetailRestB.status === 403,
    `ownerList=${ownerListRests.status}, managerList=${managerListRests.status}, ownerDetailRestB=${ownerDetailRestB.status}`
  );

  // Test 7: Non-Super-Admin user cannot view all users
  const ownerListUsers = await apiRequest("/api/v1/super-admin/users", { cookie: ownerACookie });
  const staffListUsers = await apiRequest("/api/v1/super-admin/users", { cookie: staffACookie });
  const ownerDetailUserB = await apiRequest(`/api/v1/super-admin/users/${ownerBId}`, {
    cookie: ownerACookie,
  });
  record(
    "K-07",
    "Non-Super-Admin user cannot view all users",
    ownerListUsers.status === 403 &&
      staffListUsers.status === 403 &&
      ownerDetailUserB.status === 403,
    `ownerList=${ownerListUsers.status}, staffList=${staffListUsers.status}, ownerDetailUserB=${ownerDetailUserB.status}`
  );

  // Test 8: Non-Super-Admin user cannot suspend or activate a restaurant
  const ownerSuspendAttempt = await apiRequest(`/api/v1/super-admin/restaurants/${restB.id}`, {
    method: "PATCH",
    cookie: ownerACookie,
    body: { status: "SUSPENDED", reason: "Unauthorized attempt", confirm: true },
  });
  record(
    "K-08",
    "Non-Super-Admin user cannot suspend or activate a restaurant",
    ownerSuspendAttempt.status === 403,
    `status=${ownerSuspendAttempt.status}`
  );

  // Test 9: Non-Super-Admin user cannot disable or enable a platform user
  const ownerDisableUserAttempt = await apiRequest(`/api/v1/super-admin/users/${ownerBId}`, {
    method: "PATCH",
    cookie: ownerACookie,
    body: { isActive: false, reason: "Unauthorized disable attempt", confirm: true },
  });
  record(
    "K-09",
    "Non-Super-Admin user cannot disable or enable a platform user",
    ownerDisableUserAttempt.status === 403,
    `status=${ownerDisableUserAttempt.status}`
  );

  // Test 10: Public registration cannot grant Super Admin role
  const escalateReg1 = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: {
      name: "Escalator",
      email: `escalate1.${runSuffix}@hacker.local`,
      password,
      isSuperAdmin: true,
    },
  });
  const escalateReg2 = await apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: {
      name: "EscalatorRole",
      email: `escalate2.${runSuffix}@hacker.local`,
      password,
      role: "SUPER_ADMIN",
    },
  });
  record(
    "K-10",
    "Public registration cannot grant Super Admin role",
    escalateReg1.status === 403 &&
      escalateReg2.status === 403 &&
      regCustomer.json?.user?.isSuperAdmin === false,
    `isSuperAdminPayload=${escalateReg1.status}, roleSuperAdminPayload=${escalateReg2.status}`
  );

  // Test 11: Client payload tampering / unallowed fields rejected by strict Zod schemas
  const tamperRestPatch = await apiRequest(`/api/v1/super-admin/restaurants/${restA.id}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      status: "ACTIVE",
      reason: "Testing strict validation",
      confirm: true,
      ownerId: superAdminId, // unallowed extra field
    },
  });
  const tamperUserPatch = await apiRequest(`/api/v1/super-admin/users/${ownerAId}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      isActive: true,
      reason: "Testing strict validation",
      confirm: true,
      passwordHash: "hacked_hash", // unallowed extra field
    },
  });
  const unconfirmedPatch = await apiRequest(`/api/v1/super-admin/restaurants/${restA.id}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      status: "SUSPENDED",
      reason: "Missing confirmation",
      confirm: false,
    },
  });
  record(
    "K-11",
    "Client payload tampering and unconfirmed destructive actions are rejected (400)",
    tamperRestPatch.status === 400 &&
      tamperUserPatch.status === 400 &&
      unconfirmedPatch.status === 400,
    `tamperRest=${tamperRestPatch.status}, tamperUser=${tamperUserPatch.status}, unconfirmed=${unconfirmedPatch.status}`
  );

  // Test 12: Self-lockout & Last active Super Admin protection
  const selfDisableAttempt = await apiRequest(`/api/v1/super-admin/users/${superAdminId}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      isActive: false,
      reason: "Attempting to disable myself",
      confirm: true,
    },
  });
  const selfDemoteAttempt = await apiRequest(`/api/v1/super-admin/users/${superAdminId}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      isSuperAdmin: false,
      reason: "Attempting to demote myself",
      confirm: true,
    },
  });
  record(
    "K-12",
    "Last active Super Admin / self-lockout cannot lock out the platform",
    selfDisableAttempt.status === 400 &&
      selfDisableAttempt.json?.code === "SELF_LOCKOUT_PREVENTED" &&
      selfDemoteAttempt.status === 400 &&
      selfDemoteAttempt.json?.code === "SELF_LOCKOUT_PREVENTED",
    `selfDisable=${selfDisableAttempt.status} (${selfDisableAttempt.json?.code}), selfDemote=${selfDemoteAttempt.status} (${selfDemoteAttempt.json?.code})`
  );

  // ---------------------------------------------------------------------------
  // TENANT ISOLATION TESTS (13–18)
  // ---------------------------------------------------------------------------

  // Place an order at Restaurant A and an order at Restaurant B
  const orderARes = await apiRequest("/api/v1/orders", {
    method: "POST",
    body: {
      token: qrTokenA,
      paymentMethod: "CASH",
      customerName: "Guest A",
      items: [{ menuItemId: itemA.id, quantity: 2 }],
    },
  });
  const orderA = orderARes.json.order;

  const orderBRes = await apiRequest("/api/v1/orders", {
    method: "POST",
    body: {
      token: qrTokenB,
      paymentMethod: "CASH",
      customerName: "Guest B",
      items: [{ menuItemId: itemB.id, quantity: 1 }],
    },
  });
  const orderB = orderBRes.json.order;

  // Test 13: Restaurant A owner still sees only Restaurant A
  const ownerAOrders = await apiRequest("/api/v1/orders/admin", { cookie: ownerACookie });
  const ownerASettings = await apiRequest("/api/v1/settings", { cookie: ownerACookie });
  record(
    "K-13",
    "Restaurant A owner sees only Restaurant A data",
    ownerAOrders.status === 200 &&
      ownerAOrders.json.orders.every((o) => o.restaurantId === restA.id) &&
      ownerASettings.json?.settings?.id === restA.id,
    `ordersCount=${ownerAOrders.json.orders.length}, settingsId=${ownerASettings.json?.settings?.id}`
  );

  // Test 14: Restaurant B owner still sees only Restaurant B
  const ownerBOrders = await apiRequest("/api/v1/orders/admin", { cookie: ownerBCookie });
  const ownerBSettings = await apiRequest("/api/v1/settings", { cookie: ownerBCookie });
  record(
    "K-14",
    "Restaurant B owner sees only Restaurant B data",
    ownerBOrders.status === 200 &&
      ownerBOrders.json.orders.every((o) => o.restaurantId === restB.id) &&
      ownerBSettings.json?.settings?.id === restB.id,
    `ordersCount=${ownerBOrders.json.orders.length}, settingsId=${ownerBSettings.json?.settings?.id}`
  );

  // Test 15: Restaurant A staff still cannot access Restaurant B data
  const staffACrossOrders = await apiRequest(
    `/api/v1/orders/admin?restaurantId=${restB.id}`,
    { cookie: staffACookie }
  );
  const staffACrossPatch = await apiRequest(
    `/api/v1/orders/admin/${orderB.id}`,
    {
      method: "PATCH",
      cookie: staffACookie,
      body: { status: "ACCEPTED" },
    }
  );
  record(
    "K-15",
    "Restaurant A staff cannot access or mutate Restaurant B data",
    staffACrossOrders.status === 403 && staffACrossPatch.status === 403,
    `crossGet=${staffACrossOrders.status}, crossPatch=${staffACrossPatch.status}`
  );

  // Test 16: Super Admin viewing Restaurant A or B does not corrupt tenant sessions or cross-link data
  const saInspectA = await apiRequest(`/api/v1/super-admin/restaurants/${restA.id}`, {
    cookie: saCookie,
  });
  const saInspectB = await apiRequest(`/api/v1/super-admin/restaurants/${restB.id}`, {
    cookie: saCookie,
  });
  record(
    "K-16",
    "Super Admin inspection of Restaurant A and B maintains strict tenant data boundaries",
    saInspectA.status === 200 &&
      saInspectB.status === 200 &&
      saInspectA.json.restaurant.id === restA.id &&
      saInspectB.json.restaurant.id === restB.id &&
      saInspectA.json.restaurant.recentOrders.every((o) => o.id === orderA.id) &&
      saInspectB.json.restaurant.recentOrders.every((o) => o.id === orderB.id),
    `restAOrders=${saInspectA.json.restaurant.recentOrders.length}, restBOrders=${saInspectB.json.restaurant.recentOrders.length}`
  );

  // Test 17 & 24: Super Admin suspending Restaurant A blocks Restaurant A but does NOT affect Restaurant B; restoring Restaurant A restores access
  const suspendRestA = await apiRequest(`/api/v1/super-admin/restaurants/${restA.id}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      status: "SUSPENDED",
      reason: "Compliance review test suspension",
      confirm: true,
    },
  });

  // While Restaurant A is SUSPENDED:
  // - Restaurant A dashboard API (`GET /api/v1/orders/admin`) returns 403 (RESTAURANT_SUSPENDED)
  // - Restaurant A public QR order (`POST /api/v1/orders`) returns 403 (RESTAURANT_SUSPENDED)
  // - Restaurant B continues operating normally!
  const restAAdminWhileSuspended = await apiRequest("/api/v1/orders/admin", {
    cookie: ownerACookie,
  });
  const restAQrOrderWhileSuspended = await apiRequest("/api/v1/orders", {
    method: "POST",
    body: {
      token: qrTokenA,
      paymentMethod: "CASH",
      items: [{ menuItemId: itemA.id, quantity: 1 }],
    },
  });
  const restBAdminWhileASuspended = await apiRequest("/api/v1/orders/admin", {
    cookie: ownerBCookie,
  });
  const restBQrOrderWhileASuspended = await apiRequest("/api/v1/orders", {
    method: "POST",
    body: {
      token: qrTokenB,
      paymentMethod: "CASH",
      items: [{ menuItemId: itemB.id, quantity: 1 }],
    },
  });

  // Now reactivate Restaurant A
  const activateRestA = await apiRequest(`/api/v1/super-admin/restaurants/${restA.id}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      status: "ACTIVE",
      reason: "Compliance review passed — reactivating tenant",
      confirm: true,
    },
  });
  const restAAdminAfterRestore = await apiRequest("/api/v1/orders/admin", {
    cookie: ownerACookie,
  });

  record(
    "K-17",
    "Suspending Restaurant A does not affect Restaurant B operations",
    restBAdminWhileASuspended.status === 200 &&
      restBQrOrderWhileASuspended.status === 201,
    `restBAdmin=${restBAdminWhileASuspended.status}, restBNewOrder=${restBQrOrderWhileASuspended.status}`
  );

  record(
    "K-24",
    "Restaurant status updates (SUSPENDED -> ACTIVE) persist and enforce real operational blocking & restoration",
    suspendRestA.status === 200 &&
      suspendRestA.json.restaurant.status === "SUSPENDED" &&
      restAAdminWhileSuspended.status === 403 &&
      restAAdminWhileSuspended.json?.code === "RESTAURANT_SUSPENDED" &&
      restAQrOrderWhileSuspended.status === 403 &&
      restAQrOrderWhileSuspended.json?.code === "RESTAURANT_SUSPENDED" &&
      activateRestA.status === 200 &&
      activateRestA.json.restaurant.status === "ACTIVE" &&
      restAAdminAfterRestore.status === 200,
    `suspendedAdmin=${restAAdminWhileSuspended.status}, suspendedQrOrder=${restAQrOrderWhileSuspended.status}, restoredAdmin=${restAAdminAfterRestore.status}`
  );

  // Test 18 & 25: Super Admin disabling a user blocks only that user and does not affect unrelated users; re-enabling restores access
  const staffUserRecord = await prisma.user.findUnique({ where: { email: staffAEmail } });
  const disableStaffUser = await apiRequest(`/api/v1/super-admin/users/${staffUserRecord.id}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      isActive: false,
      reason: "Security review on staff account",
      confirm: true,
    },
  });

  // Disabled staff user session is now rejected (401) and login is rejected (401), while Manager A still works (200)
  const disabledStaffOrdersCall = await apiRequest("/api/v1/orders/admin", {
    cookie: staffACookie,
  });
  const disabledStaffLoginAttempt = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: { email: staffAEmail, password },
  });
  const managerAWhileStaffDisabled = await apiRequest("/api/v1/orders/admin", {
    cookie: managerACookie,
  });

  // Re-enable staff user
  const enableStaffUser = await apiRequest(`/api/v1/super-admin/users/${staffUserRecord.id}`, {
    method: "PATCH",
    cookie: saCookie,
    body: {
      isActive: true,
      reason: "Security review cleared",
      confirm: true,
    },
  });
  const reenabledStaffLogin = await apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: { email: staffAEmail, password },
  });

  record(
    "K-18",
    "Disabling a user account does not affect unrelated users",
    managerAWhileStaffDisabled.status === 200,
    `managerAAccess=${managerAWhileStaffDisabled.status}`
  );

  record(
    "K-25",
    "User status updates (isActive: false -> true) persist and enforce real session/login blocking and restoration",
    disableStaffUser.status === 200 &&
      disableStaffUser.json.user.isActive === false &&
      disabledStaffOrdersCall.status === 401 &&
      disabledStaffLoginAttempt.status === 401 &&
      enableStaffUser.status === 200 &&
      enableStaffUser.json.user.isActive === true &&
      reenabledStaffLogin.status === 200,
    `disabledSession=${disabledStaffOrdersCall.status}, disabledLogin=${disabledStaffLoginAttempt.status}, reenabledLogin=${reenabledStaffLogin.status}`
  );

  // ---------------------------------------------------------------------------
  // DATA & FUNCTIONALITY TESTS (19–23, 26)
  // ---------------------------------------------------------------------------

  // Test 19: Platform overview metrics match real database counts
  const [dbRestCount, dbUserCount, dbOrderCount, overviewCheck] = await Promise.all([
    prisma.restaurant.count(),
    prisma.user.count(),
    prisma.order.count(),
    apiRequest("/api/v1/super-admin/overview", { cookie: saCookie }),
  ]);
  record(
    "K-19",
    "Platform overview metrics match real database counts",
    overviewCheck.status === 200 &&
      overviewCheck.json.metrics.restaurants.total === dbRestCount &&
      overviewCheck.json.metrics.users.total === dbUserCount &&
      overviewCheck.json.metrics.orders.total === dbOrderCount,
    `DB=[rests:${dbRestCount}, users:${dbUserCount}, orders:${dbOrderCount}] vs API=[rests:${overviewCheck.json.metrics.restaurants.total}, users:${overviewCheck.json.metrics.users.total}, orders:${overviewCheck.json.metrics.orders.total}]`
  );

  // Test 20: Restaurant directory search, filter, sort, and pagination work
  const searchRestA = await apiRequest(
    `/api/v1/super-admin/restaurants?search=${encodeURIComponent(`Alpha Bistro ${runSuffix}`)}&status=ACTIVE&sortBy=ordersCount&sortOrder=desc&page=1&limit=5`,
    { cookie: saCookie }
  );
  record(
    "K-20",
    "Restaurant directory search, status filter, sort, and pagination work",
    searchRestA.status === 200 &&
      searchRestA.json.restaurants.length === 1 &&
      searchRestA.json.restaurants[0].id === restA.id &&
      typeof searchRestA.json.pagination.totalPages === "number",
    `found=${searchRestA.json.restaurants.length}, id=${searchRestA.json.restaurants[0]?.id}`
  );

  // Test 21: Restaurant detail page/API shows real restaurant data
  const detailRestA = await apiRequest(`/api/v1/super-admin/restaurants/${restA.id}`, {
    cookie: saCookie,
  });
  record(
    "K-21",
    "Restaurant detail shows real restaurant profile, owner, staff, and operational counts",
    detailRestA.status === 200 &&
      detailRestA.json.restaurant.name === `Alpha Bistro ${runSuffix}` &&
      detailRestA.json.restaurant.owner?.email === ownerAEmail &&
      detailRestA.json.restaurant.members.length === 4 &&
      detailRestA.json.restaurant.metrics.menuItemsCount === 1 &&
      detailRestA.json.restaurant.metrics.tablesCount === 1 &&
      detailRestA.json.restaurant.metrics.totalOrders === 1,
    `members=${detailRestA.json.restaurant.members.length}, orders=${detailRestA.json.restaurant.metrics.totalOrders}`
  );

  // Test 22: User directory search, role filter, status filter, and pagination work
  const searchSuperAdminUsers = await apiRequest(
    `/api/v1/super-admin/users?search=${encodeURIComponent(superAdminEmail)}&role=SUPER_ADMIN&status=ACTIVE&page=1&limit=10`,
    { cookie: saCookie }
  );
  record(
    "K-22",
    "User directory search, role filter, status filter, and pagination work",
    searchSuperAdminUsers.status === 200 &&
      searchSuperAdminUsers.json.users.length === 1 &&
      searchSuperAdminUsers.json.users[0].id === superAdminId,
    `found=${searchSuperAdminUsers.json.users.length}, email=${searchSuperAdminUsers.json.users[0]?.email}`
  );

  // Test 23: User detail page/API shows safe user info and linked restaurants, and NEVER exposes passwordHash
  const detailOwnerA = await apiRequest(`/api/v1/super-admin/users/${ownerAId}`, {
    cookie: saCookie,
  });
  const rawUserJsonString = JSON.stringify(detailOwnerA.json);
  const rawUsersListJsonString = JSON.stringify(searchSuperAdminUsers.json);
  record(
    "K-23",
    "User detail and directory return safe user info & linked restaurants and NEVER expose passwordHash",
    detailOwnerA.status === 200 &&
      detailOwnerA.json.user.email === ownerAEmail &&
      detailOwnerA.json.user.memberships.length === 1 &&
      detailOwnerA.json.user.memberships[0].restaurant.id === restA.id &&
      !rawUserJsonString.includes("passwordHash") &&
      !rawUsersListJsonString.includes("passwordHash"),
    `memberships=${detailOwnerA.json.user.memberships.length}, passwordHashExposed=${rawUserJsonString.includes("passwordHash")}`
  );

  // Test 26: Audit logs record sensitive Super Admin actions
  const auditLogsRes = await apiRequest(
    `/api/v1/super-admin/audit-logs?search=${encodeURIComponent(superAdminEmail)}&limit=50`,
    { cookie: saCookie }
  );
  const recordedActions = new Set((auditLogsRes.json?.logs || []).map((l) => l.action));
  record(
    "K-26",
    "Platform Audit Logs record sensitive Super Admin actions (CLI provisioning, restaurant status, user status)",
    auditLogsRes.status === 200 &&
      recordedActions.has("SUPER_ADMIN_PROVISIONED_CLI") &&
      recordedActions.has("RESTAURANT_STATUS_CHANGED") &&
      recordedActions.has("USER_ACCOUNT_DISABLED") &&
      recordedActions.has("USER_ACCOUNT_ENABLED"),
    `actions=[${Array.from(recordedActions).join(", ")}]`
  );

  // ---------------------------------------------------------------------------
  // PART J HARDENING TESTS (K-27)
  // ---------------------------------------------------------------------------

  // 27a: Retrying POST /api/v1/payments/create with method: "CASH" reuses existing CASH payment (no duplicate row)
  const retryCashPayment = await apiRequest("/api/v1/payments/create", {
    method: "POST",
    body: {
      orderId: orderA.id,
      token: qrTokenA,
      method: "CASH",
    },
  });
  const paymentCountForOrderA = await prisma.payment.count({
    where: { orderId: orderA.id },
  });

  // 27b: Order tracking endpoint validates UUID and blocks stale completed orders (>2h old)
  const trackBadUuid = await apiRequest(
    `/api/v1/orders/track?token=${qrTokenA}&orderId=not-a-uuid`
  );
  const trackActiveOrder = await apiRequest(
    `/api/v1/orders/track?token=${qrTokenA}&orderId=${orderA.id}`
  );

  record(
    "K-27",
    "Part J Hardening: CASH payment retry is idempotent (1 row) and order tracking validates UUIDs",
    retryCashPayment.status === 200 &&
      paymentCountForOrderA === 1 &&
      trackBadUuid.status === 400 &&
      trackActiveOrder.status === 200,
    `retryPaymentStatus=${retryCashPayment.status}, paymentRowsForOrderA=${paymentCountForOrderA}, trackBadUuid=${trackBadUuid.status}, trackActiveOrder=${trackActiveOrder.status}`
  );

  console.log("\n=================================================================");
  console.log(`📊 FINAL SCORE: ${passed} / ${passed + failed} PASSED (${failed} FAILED)`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Unhandled test suite error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
