/**
 * Load Testing Fixtures & Seed Setup
 *
 * Safely provisions and tears down synthetic tenant data prefixed with `LOADTEST_`.
 * Zero impact on existing production/demo tenant data.
 */

const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

const PREFIX = "LOADTEST_";

async function makeSessionToken(userId, email) {
  return await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

/**
 * Clean up all synthetic records prefixed with LOADTEST_
 */
async function cleanupTestTenant() {
  const summary = {
    orderItems: 0,
    payments: 0,
    orders: 0,
    notifications: 0,
    qrCodes: 0,
    tables: 0,
    menuItems: 0,
    categories: 0,
    memberships: 0,
    restaurants: 0,
    users: 0,
  };

  try {
    // 1. Find all synthetic restaurants
    const syntheticRestaurants = await prisma.restaurant.findMany({
      where: { name: { startsWith: PREFIX } },
      select: { id: true },
    });
    const restaurantIds = syntheticRestaurants.map((r) => r.id);

    if (restaurantIds.length > 0) {
      // Find orders
      const orders = await prisma.order.findMany({
        where: { restaurantId: { in: restaurantIds } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);

      if (orderIds.length > 0) {
        // Delete order item addons & variants
        await prisma.orderItemAddon.deleteMany({
          where: { orderItem: { orderId: { in: orderIds } } },
        });
        await prisma.orderItemVariant.deleteMany({
          where: { orderItem: { orderId: { in: orderIds } } },
        });
        const delItems = await prisma.orderItem.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        summary.orderItems += delItems.count;

        const delPayments = await prisma.payment.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        summary.payments += delPayments.count;

        const delOrders = await prisma.order.deleteMany({
          where: { id: { in: orderIds } },
        });
        summary.orders += delOrders.count;
      }

      // Delete notifications
      const delNotifs = await prisma.notification.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      summary.notifications += delNotifs.count;

      // Delete QR codes
      const delQRs = await prisma.qRCode.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      summary.qrCodes += delQRs.count;

      // Delete Tables
      const delTables = await prisma.table.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      summary.tables += delTables.count;

      // Delete Menu Items
      await prisma.menuItemAddonLink.deleteMany({
        where: { menuItem: { restaurantId: { in: restaurantIds } } },
      });
      await prisma.menuItemAddon.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      await prisma.menuItemVariant.deleteMany({
        where: { menuItem: { restaurantId: { in: restaurantIds } } },
      });
      const delItems = await prisma.menuItem.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      summary.menuItems += delItems.count;

      // Delete Categories
      const delCats = await prisma.menuCategory.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      summary.categories += delCats.count;

      // Delete Memberships
      const delMems = await prisma.restaurantUser.deleteMany({
        where: { restaurantId: { in: restaurantIds } },
      });
      summary.memberships += delMems.count;

      // Delete Restaurants
      const delRests = await prisma.restaurant.deleteMany({
        where: { id: { in: restaurantIds } },
      });
      summary.restaurants += delRests.count;
    }

    // Delete synthetic Users
    const delUsers = await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "loadtest_" } },
          { name: { startsWith: PREFIX } },
        ],
      },
    });
    summary.users += delUsers.count;

    return summary;
  } catch (error) {
    console.error("Cleanup error:", error);
    throw error;
  }
}

/**
 * Provision synthetic tenant for load testing
 */
async function setupTestTenant(baseUrl = "http://localhost:3000") {
  // Always clean any orphaned synthetic data first
  await cleanupTestTenant();

  const timestamp = Date.now();
  const slug = `loadtest-bistro-${timestamp}`;

  // 1. Create synthetic user
  const user = await prisma.user.create({
    data: {
      email: `loadtest_owner_${timestamp}@example.com`,
      name: `${PREFIX}Owner`,
      passwordHash: "$2b$10$epB/2VwY1f/t.JkU08yBLeE9uPqG5Y7E7sO48MvQdJdYvP7BqXJqm", // dummy hash
      isActive: true,
    },
  });

  // 2. Create synthetic restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `${PREFIX}Bistro`,
      slug,
      currency: "USD",
      taxPercentage: 8,
      status: "ACTIVE",
      isOrderingEnabled: true,
      accentColor: "#E85D2A",
      allowSpecialInstructions: true,
      googleReviewUrl: "https://g.page/r/loadtest-review",
    },
  });

  // 3. Link user as OWNER
  await prisma.restaurantUser.create({
    data: {
      userId: user.id,
      restaurantId: restaurant.id,
      role: "OWNER",
    },
  });

  // 4. Create Table
  const table = await prisma.table.create({
    data: {
      restaurantId: restaurant.id,
      name: `${PREFIX}Table 01`,
      number: "1",
      capacity: 4,
      status: "ACTIVE",
    },
  });

  // 5. Create active QRCode
  const qrToken = `loadtest_token_${timestamp}`;
  const qr = await prisma.qRCode.create({
    data: {
      restaurantId: restaurant.id,
      tableId: table.id,
      token: qrToken,
      url: `${baseUrl}/q/${qrToken}`,
      status: "ACTIVE",
    },
  });

  // 6. Create Menu Category
  const category = await prisma.menuCategory.create({
    data: {
      restaurantId: restaurant.id,
      name: `${PREFIX}Starters`,
      isActive: true,
      sortOrder: 1,
    },
  });

  // 7. Create 3 Menu Items
  const item1 = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: `${PREFIX}Truffle Burger`,
      slug: `loadtest-truffle-burger-${timestamp}`,
      price: 14.5,
      isAvailable: true,
      status: "ACTIVE",
      sortOrder: 1,
    },
  });

  const item2 = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: `${PREFIX}Crispy Calamari`,
      slug: `loadtest-crispy-calamari-${timestamp}`,
      price: 9.75,
      isAvailable: true,
      status: "ACTIVE",
      sortOrder: 2,
    },
  });

  const item3 = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: `${PREFIX}Craft Berry Lemonade`,
      slug: `loadtest-craft-lemonade-${timestamp}`,
      price: 4.5,
      isAvailable: true,
      status: "ACTIVE",
      sortOrder: 3,
    },
  });

  // 8. Generate auth session JWT token for staff polling
  const sessionToken = await makeSessionToken(user.id, user.email);

  return {
    restaurant,
    user,
    table,
    qr,
    category,
    items: [item1, item2, item3],
    sessionToken,
    qrToken,
    baseUrl,
  };
}

module.exports = {
  PREFIX,
  prisma,
  setupTestTenant,
  cleanupTestTenant,
  makeSessionToken,
};

// Direct CLI execution support
if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    if (arg === "--clean") {
      console.log("Cleaning up synthetic test data...");
      const res = await cleanupTestTenant();
      console.log("Cleaned:", res);
    } else {
      console.log("Setting up synthetic test tenant...");
      const tenant = await setupTestTenant();
      console.log("Setup complete:", {
        restaurantId: tenant.restaurant.id,
        restaurantName: tenant.restaurant.name,
        qrToken: tenant.qrToken,
        itemsCount: tenant.items.length,
      });
    }
    await prisma.$disconnect();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
