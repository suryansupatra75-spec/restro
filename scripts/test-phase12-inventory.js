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

async function runPhase12InventoryAudit() {
  console.log("=================================================================");
  console.log("  PHASE 12: INVENTORY MANAGEMENT SECURITY & LOGIC AUDIT");
  console.log("=================================================================");

  try {
    // 0. Server Health Check
    console.log("\n[0/9] Checking server availability at " + BASE_URL + "...");
    const health = await fetch(`${BASE_URL}/login`);
    if (!health.ok && health.status !== 200) {
      throw new Error(`Server offline (status ${health.status}). Start with npm run dev`);
    }
    console.log("Server is online.");

    // 1. Setup Test Tenants & Roles
    console.log("\n[1/9] Setting up test contexts for Restaurant A and Restaurant B...");
    const restaurantA = await prisma.restaurant.findFirst({
      where: { status: "ACTIVE" },
      include: {
        users: { include: { user: true } },
        menuItems: { take: 2 },
        tables: { take: 1 },
      },
    });
    if (!restaurantA) throw new Error("No active restaurant found for Tenant A");

    const ownerAUser = restaurantA.users.find((u) => u.role === "OWNER")?.user;
    if (!ownerAUser) throw new Error("No owner found for Tenant A");
    const ownerACookie = await createSessionCookie(ownerAUser.id, ownerAUser.email);
    assert(!!ownerACookie, `Owner A authenticated (${ownerAUser.email})`);

    // Ensure staff and kitchen exist for Tenant A
    let staffUser = await prisma.user.findFirst({
      where: { restaurants: { some: { restaurantId: restaurantA.id, role: "STAFF" } } },
    });
    if (!staffUser) {
      staffUser = await prisma.user.create({
        data: {
          name: "Test Staff",
          email: `staff-inv-${Date.now()}@test.com`,
          passwordHash: "hash",
          restaurants: {
            create: { restaurantId: restaurantA.id, role: "STAFF", status: "ACTIVE" },
          },
        },
      });
    }
    const staffCookie = await createSessionCookie(staffUser.id, staffUser.email);
    assert(!!staffCookie, `Staff member authenticated (Role: STAFF)`);

    let kitchenUser = await prisma.user.findFirst({
      where: { restaurants: { some: { restaurantId: restaurantA.id, role: "KITCHEN" } } },
    });
    if (!kitchenUser) {
      kitchenUser = await prisma.user.create({
        data: {
          name: "Test Chef",
          email: `chef-inv-${Date.now()}@test.com`,
          passwordHash: "hash",
          restaurants: {
            create: { restaurantId: restaurantA.id, role: "KITCHEN", status: "ACTIVE" },
          },
        },
      });
    }
    const kitchenCookie = await createSessionCookie(kitchenUser.id, kitchenUser.email);
    assert(!!kitchenCookie, `Kitchen Chef authenticated (Role: KITCHEN)`);

    // Tenant B (Multi-Tenant Isolation)
    let restaurantB = await prisma.restaurant.findFirst({
      where: { id: { not: restaurantA.id }, status: "ACTIVE" },
      include: { users: { include: { user: true } } },
    });
    if (!restaurantB) {
      restaurantB = await prisma.restaurant.create({
        data: {
          name: "Tenant B Bistro",
          slug: `tenant-b-inv-${Date.now()}`,
          status: "ACTIVE",
        },
        include: { users: { include: { user: true } } },
      });
    }
    let ownerBUser = restaurantB.users.find((u) => u.role === "OWNER")?.user;
    if (!ownerBUser) {
      ownerBUser = await prisma.user.create({
        data: {
          name: "Owner B",
          email: `owner-b-inv-${Date.now()}@test.com`,
          passwordHash: "hash",
          restaurants: {
            create: { restaurantId: restaurantB.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
    }
    const ownerBCookie = await createSessionCookie(ownerBUser.id, ownerBUser.email);
    assert(!!ownerBCookie, `Owner B authenticated for Tenant B (${restaurantB.name})`);

    // Clean up test inventory items from previous runs
    await prisma.inventoryMovement.deleteMany({
      where: { item: { name: { startsWith: "Test " } } },
    });
    await prisma.recipeItem.deleteMany({
      where: { inventoryItem: { name: { startsWith: "Test " } } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { name: { startsWith: "Test " } },
    });

    // 2. Inventory Item Management CRUD & Opening Stock
    console.log("\n[2/9] Testing Inventory Item CRUD & Opening Stock...");

    // 2.1 Create Item with Opening Stock
    const createRes = await fetch(`${BASE_URL}/api/v1/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        name: "Test Mozzarella Cheese",
        sku: `SKU-MOZZ-${Date.now()}`,
        category: "Dairy",
        unit: "GRAM",
        openingStock: 5000,
        lowStockThreshold: 1000,
        costPerUnit: 0.02, // $0.02 per gram
      }),
    });
    const createData = await safeJson(createRes);
    assert(createRes.status === 201, "Owner creates inventory item with opening stock (201 Created)");
    assert(createData.item?.name === "Test Mozzarella Cheese", "Item name correctly stored");
    assert(createData.item?.currentStock === 5000, "Opening stock balance established at 5000 grams");

    const itemMozzId = createData.item.id;

    // 2.2 Verify Opening Stock Movement Ledger Entry Created
    const movementsRes = await fetch(`${BASE_URL}/api/v1/inventory/movements?itemId=${itemMozzId}`, {
      headers: { Cookie: ownerACookie },
    });
    const movementsData = await safeJson(movementsRes);
    assert(movementsRes.status === 200, "Owner can query movement ledger (200 OK)");
    assert(movementsData.movements.length === 1, "Opening stock generated 1 auditable ledger record");
    assert(movementsData.movements[0].type === "OPENING_STOCK", "Movement type is OPENING_STOCK");
    assert(movementsData.movements[0].quantityChange === 5000, "Quantity change recorded as +5000");
    assert(movementsData.movements[0].resultingBalance === 5000, "Resulting balance logged as 5000");

    // 2.3 Duplicate Name Prevention
    const duplicateRes = await fetch(`${BASE_URL}/api/v1/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        name: "Test Mozzarella Cheese",
        unit: "GRAM",
      }),
    });
    assert(duplicateRes.status === 400, "Duplicate item name within tenant rejected with 400");

    // 2.4 Update Item
    const patchRes = await fetch(`${BASE_URL}/api/v1/inventory/${itemMozzId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        lowStockThreshold: 1200,
      }),
    });
    const patchData = await safeJson(patchRes);
    assert(patchRes.status === 200, "Owner can update inventory item threshold (200 OK)");
    assert(patchData.item?.lowStockThreshold === 1200, "Threshold updated to 1200");

    // 3. Stock Movements & Unit Conversions (g <-> kg)
    console.log("\n[3/9] Testing Stock Movements & Unit Conversions...");

    // 3.1 Receive Stock with Unit Conversion: Receive 2 KILOGRAMS for item configured in GRAMS
    // 2 kg = 2000 g -> Balance should become 5000 + 2000 = 7000 g
    const receiveRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "STOCK_RECEIVED",
        quantity: 2,
        unit: "KILOGRAM",
        costPerUnit: 20, // $20 per kg
        reason: "Weekly dairy delivery",
      }),
    });
    const receiveData = await safeJson(receiveRes);
    assert(receiveRes.status === 201, "Receive stock with KILOGRAM -> GRAM conversion (201 Created)");
    assert(receiveData.item?.currentStock === 7000, "Balance accurately converted and updated to 7000 grams (5000 + 2000)");

    // 3.2 Incompatible Unit Rejection: Attempt to receive PIECE for item configured in GRAM
    const badUnitRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "STOCK_RECEIVED",
        quantity: 5,
        unit: "PIECE",
      }),
    });
    assert(badUnitRes.status === 400, "Incompatible unit conversion (PIECE -> GRAM) rejected with 400");

    // 3.3 Record Waste / Spoilage: Spoilage of 500 grams -> Balance should become 6500 g
    const wasteRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "WASTE",
        quantity: 500,
        unit: "GRAM",
        reason: "Dropped container on floor",
      }),
    });
    const wasteData = await safeJson(wasteRes);
    assert(wasteRes.status === 201, "Waste movement recorded (201 Created)");
    assert(wasteData.item?.currentStock === 6500, "Balance reduced to 6500 grams");
    assert(wasteData.movement?.quantityChange === -500, "Ledger records negative quantity change of -500");

    // 3.4 Adjustment Increase
    const adjustRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "ADJUSTMENT_INCREASE",
        quantity: 100,
        unit: "GRAM",
        reason: "Recount adjustment",
      }),
    });
    assert(adjustRes.status === 201, "Adjustment increase recorded (201 Created)");

    // 4. Strict Negative Stock Protection
    console.log("\n[4/9] Testing Negative Stock Prevention Policy...");
    // Current stock is 6600 g. Attempting to deduct 10,000 g must fail!
    const negativeRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "ADJUSTMENT_DECREASE",
        quantity: 10000,
        unit: "GRAM",
        reason: "Impossible deduction",
      }),
    });
    assert(negativeRes.status === 400, "Over-deduction resulting in negative stock rejected with 400");
    const negativeData = await safeJson(negativeRes);
    assert(negativeData.error?.includes("Insufficient stock"), "Returns clear explanatory insufficient stock error message");

    // Verify stock remains untouched at 6600
    const verifyStockItem = await prisma.inventoryItem.findUnique({ where: { id: itemMozzId } });
    assert(Number(verifyStockItem?.currentStock) === 6600, "Item stock balance maintained safely at 6600 grams");

    // 5. Low-Stock & Out-of-Stock Alerts
    console.log("\n[5/9] Testing Low-Stock & Out-of-Stock Alert Conditions...");

    // Create item with stock below threshold
    const lowStockItem = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurantA.id,
        name: "Test Olive Oil",
        unit: "LITER",
        currentStock: 1, // 1 L
        lowStockThreshold: 5, // Threshold: 5 L -> LOW_STOCK
        costPerUnit: 12,
        isActive: true,
      },
    });

    const outOfStockItem = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurantA.id,
        name: "Test Burger Buns",
        unit: "PACK",
        currentStock: 0, // 0 -> OUT_OF_STOCK
        lowStockThreshold: 10,
        costPerUnit: 3,
        isActive: true,
      },
    });

    const lowStockRes = await fetch(`${BASE_URL}/api/v1/inventory/low-stock`, {
      headers: { Cookie: ownerACookie },
    });
    const lowStockData = await safeJson(lowStockRes);
    assert(lowStockRes.status === 200, "Low-stock endpoint returns 200 OK");
    const lowIds = lowStockData.items.map((i) => i.id);
    assert(lowIds.includes(lowStockItem.id), "Identifies Olive Oil as LOW_STOCK");
    assert(lowIds.includes(outOfStockItem.id), "Identifies Burger Buns as OUT_OF_STOCK");

    // 6. Role-Based Permissions & Cost Privacy Masking
    console.log("\n[6/9] Testing Role Permissions & Cost Privacy...");

    // 6.1 Staff can view items, but cost fields are masked
    const staffViewRes = await fetch(`${BASE_URL}/api/v1/inventory/${itemMozzId}`, {
      headers: { Cookie: staffCookie },
    });
    const staffViewData = await safeJson(staffViewRes);
    assert(staffViewRes.status === 200, "Staff can view inventory item detail (200 OK)");
    assert(staffViewData.item?.costPerUnit === null, "Cost per unit is securely masked for staff role");
    assert(staffViewData.item?.totalValuation === null, "Valuation is securely masked for staff role");

    // 6.2 Staff can receive stock (has inventory.receive)
    const staffReceiveRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "STOCK_RECEIVED",
        quantity: 100,
        unit: "GRAM",
        reason: "Delivery check-in by staff",
      }),
    });
    assert(staffReceiveRes.status === 201, "Staff role can record stock receipts (201 Created)");

    // 6.3 Staff CANNOT record adjustments or waste (lacks inventory.adjust)
    const staffAdjustRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: staffCookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "WASTE",
        quantity: 50,
        unit: "GRAM",
      }),
    });
    assert(
      staffAdjustRes.status === 403,
      "Staff role is blocked from recording adjustments/waste (403 Forbidden)",
      `Got: ${staffAdjustRes.status} ${JSON.stringify(await safeJson(staffAdjustRes))}`
    );

    // 6.4 Kitchen can view inventory (has inventory.view)
    const kitchenViewRes = await fetch(`${BASE_URL}/api/v1/inventory`, {
      headers: { Cookie: kitchenCookie },
    });
    assert(kitchenViewRes.status === 200, "Kitchen role can view inventory items (200 OK)");

    // 6.5 Kitchen CANNOT receive or adjust stock
    const kitchenReceiveRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: kitchenCookie },
      body: JSON.stringify({
        itemId: itemMozzId,
        type: "STOCK_RECEIVED",
        quantity: 10,
        unit: "GRAM",
      }),
    });
    assert(kitchenReceiveRes.status === 403, "Kitchen role is blocked from receiving stock (403 Forbidden)");

    // 6.6 Unauthenticated request is rejected
    const unauthRes = await fetch(`${BASE_URL}/api/v1/inventory`);
    assert(unauthRes.status === 401, "Unauthenticated request returns 401 Unauthorized");

    // 7. Multi-Tenant Isolation & Cross-Tenant IDOR Defense
    console.log("\n[7/9] Testing Multi-Tenant Isolation & Cross-Tenant IDOR...");

    // Create item in Tenant B
    const itemB = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurantB.id,
        name: "Test Tenant B Flour",
        unit: "KILOGRAM",
        currentStock: 50,
        isActive: true,
      },
    });

    // 7.1 Tenant A listing items does not include Tenant B items
    const tenantAList = await fetch(`${BASE_URL}/api/v1/inventory`, { headers: { Cookie: ownerACookie } });
    const tenantAListData = await safeJson(tenantAList);
    const hasItemBInA = tenantAListData.items.some((i) => i.id === itemB.id);
    assert(!hasItemBInA, "Tenant A inventory list does NOT contain Tenant B items");

    // 7.2 Cross-Tenant IDOR: Owner A querying Item B returns 404
    await new Promise((r) => setTimeout(r, 200));
    const idorGetRes = await fetch(`${BASE_URL}/api/v1/inventory/${itemB.id}`, { headers: { Cookie: ownerACookie } });
    assert(idorGetRes.status === 404, "Cross-Tenant IDOR: Owner A querying Tenant B item returns 404 Not Found");

    // 7.3 Cross-Tenant IDOR: Owner A attempting to modify Item B returns 404
    const idorPatchRes = await fetch(`${BASE_URL}/api/v1/inventory/${itemB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({ name: "Hacked Item" }),
    });
    assert(idorPatchRes.status === 404, "Cross-Tenant IDOR: Owner A cannot modify Tenant B item (404 Not Found)");

    // 7.4 Cross-Tenant IDOR: Owner A attempting to post stock movement on Item B returns 400/404
    const idorMoveRes = await fetch(`${BASE_URL}/api/v1/inventory/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        itemId: itemB.id,
        type: "STOCK_RECEIVED",
        quantity: 10,
        unit: "KILOGRAM",
      }),
    });
    assert(idorMoveRes.status === 400 || idorMoveRes.status === 404, "Cross-Tenant IDOR: Owner A cannot record movement on Tenant B item");

    // 8. Menu Recipes, Order Deductions & Cancellation Reversal
    let targetMenuItem = await prisma.menuItem.findFirst({ where: { restaurantId: restaurantA.id } });
    if (!targetMenuItem) {
      let cat = await prisma.menuCategory.findFirst({ where: { restaurantId: restaurantA.id } });
      if (!cat) {
        cat = await prisma.menuCategory.create({
          data: { restaurantId: restaurantA.id, name: `Main Category ${Date.now()}` },
        });
      }
      targetMenuItem = await prisma.menuItem.create({
        data: {
          restaurantId: restaurantA.id,
          categoryId: cat.id,
          name: "Test Artisan Pizza",
          slug: `test-pizza-${Date.now()}`,
          price: 15,
          isAvailable: true,
          status: "ACTIVE",
        },
      });
    }

    // 8.1 Create Recipe Mapping: 1 order of MenuItem consumes 150 grams of Mozzarella
    const recipeRes = await fetch(`${BASE_URL}/api/v1/inventory/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({
        menuItemId: targetMenuItem.id,
        inventoryItemId: itemMozzId,
        quantity: 150,
        unit: "GRAM",
      }),
    });
    const recipeData = await safeJson(recipeRes);
    assert(recipeRes.status === 201, "Owner maps recipe: MenuItem consumes 150g Mozzarella (201 Created)");
    assert(recipeData.recipe?.quantity === 150, "Recipe ingredient quantity verified at 150");

    // Get current stock before order
    const beforeItem = await prisma.inventoryItem.findUnique({ where: { id: itemMozzId } });
    const stockBeforeOrder = Number(beforeItem?.currentStock);

    // 8.2 Create an order with 2x targetMenuItem (should require 2 * 150 = 300g Mozzarella)
    let table = await prisma.table.findFirst({ where: { restaurantId: restaurantA.id } });
    if (!table) {
      table = await prisma.table.create({
        data: { restaurantId: restaurantA.id, name: "T1", status: "ACTIVE" },
      });
    }
    const testOrder = await prisma.order.create({
      data: {
        restaurantId: restaurantA.id,
        tableId: table.id,
        orderNumber: `ORD-INV-TEST-${Date.now()}`,
        status: "PENDING",
        subtotal: 30,
        total: 30,
        items: {
          create: [
            {
              menuItemId: targetMenuItem.id,
              name: targetMenuItem.name,
              price: 15,
              quantity: 2,
            },
          ],
        },
      },
    });

    // 8.3 Transition Order to ACCEPTED -> Kitchen acceptance triggers recipe stock deduction
    const acceptRes = await fetch(`${BASE_URL}/api/v1/orders/admin/${testOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({ status: "ACCEPTED" }),
    });
    assert(acceptRes.status === 200, "Order accepted by kitchen (200 OK)");

    // Verify Mozzarella stock was deducted by exactly 300g
    const afterAcceptItem = await prisma.inventoryItem.findUnique({ where: { id: itemMozzId } });
    const stockAfterAccept = Number(afterAcceptItem?.currentStock);
    assert(
      stockAfterAccept === stockBeforeOrder - 300,
      `Order acceptance automatically deducted 300g (Before: ${stockBeforeOrder}, After: ${stockAfterAccept})`
    );

    // 8.4 Idempotency Check: Transition Order to PREPARING -> Must NOT deduct stock again!
    const prepRes = await fetch(`${BASE_URL}/api/v1/orders/admin/${testOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({ status: "PREPARING" }),
    });
    assert(prepRes.status === 200, "Order status advanced to PREPARING (200 OK)");

    const afterPrepItem = await prisma.inventoryItem.findUnique({ where: { id: itemMozzId } });
    const stockAfterPrep = Number(afterPrepItem?.currentStock);
    assert(
      stockAfterPrep === stockAfterAccept,
      `Idempotent order deduction: Advancing to PREPARING did not double-deduct stock (Balance remains ${stockAfterPrep}g)`
    );

    // 8.5 Cancellation Reversal: Cancel the order -> Stock should be restored by +300g
    const cancelRes = await fetch(`${BASE_URL}/api/v1/orders/admin/${testOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerACookie },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    assert(cancelRes.status === 200, "Order rejected / cancelled (200 OK)");

    const afterCancelItem = await prisma.inventoryItem.findUnique({ where: { id: itemMozzId } });
    const stockAfterCancel = Number(afterCancelItem?.currentStock);
    assert(
      stockAfterCancel === stockBeforeOrder,
      `Compensating REVERSAL restored stock back to ${stockBeforeOrder}g upon order cancellation`
    );

    // 9. Clean-up Test Records
    console.log("\n[9/9] Cleaning up test inventory records...");
    await prisma.inventoryMovement.deleteMany({
      where: { item: { name: { startsWith: "Test " } } },
    });
    await prisma.recipeItem.deleteMany({
      where: { inventoryItem: { name: { startsWith: "Test " } } },
    });
    await prisma.order.delete({ where: { id: testOrder.id } });
    await prisma.inventoryItem.deleteMany({
      where: { name: { startsWith: "Test " } },
    });
    assert(true, "Test inventory and order records cleaned up safely");

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

runPhase12InventoryAudit();
