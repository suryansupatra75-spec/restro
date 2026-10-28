/**
 * Baseline Performance Profiler
 */
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

async function makeToken(userId, email) {
  return await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

async function measure(name, fn) {
  const times = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      await fn();
      times.push(performance.now() - start);
    } catch (e) {
      console.error(`Error in ${name}:`, e.message);
    }
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  return { name, avg: Number(avg.toFixed(2)), min: Number(min.toFixed(2)), samples: times.map(t => Number(t.toFixed(2))) };
}

async function main() {
  console.log("Measuring Baseline Latency on Localhost...");

  // Find an active restaurant and owner
  const restaurant = await prisma.restaurant.findFirst({
    where: { status: "ACTIVE" },
    include: {
      tables: { include: { qrCodes: true } },
      users: { include: { user: true } },
      categories: { include: { items: true } },
    },
  });

  const table = restaurant.tables.find(t => t.qrCodes.some(q => q.status === "ACTIVE")) || restaurant.tables[0];
  const qr = table.qrCodes.find(q => q.status === "ACTIVE") || table.qrCodes[0];
  const owner = restaurant.users[0].user;
  const token = await makeToken(owner.id, owner.email);
  const item = restaurant.categories[0]?.items[0];

  const results = [];

  // 1. Healthcheck
  results.push(await measure("Healthcheck (GET /api/health)", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  }));

  // 2. Customer Menu Load
  results.push(await measure("Customer Menu (GET /q/[token])", async () => {
    const res = await fetch(`${BASE_URL}/q/${qr.token}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  }));

  // 3. Order Placement
  results.push(await measure("Place Order (POST /api/v1/orders)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: qr.token,
        paymentMethod: "CASH",
        idempotencyKey: `baseline_${Date.now()}_${Math.random()}`,
        items: [{ menuItemId: item.id, quantity: 1 }],
        customerName: "Baseline Tester",
      }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  }));

  // 4. Restaurant Order Dashboard
  results.push(await measure("Dashboard Orders (GET /api/v1/orders/admin)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/orders/admin?restaurantId=${restaurant.id}&status=ACTIVE`, {
      headers: { Cookie: `session=${token}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  }));

  // 5. Call Waiter
  results.push(await measure("Call Waiter (POST /api/v1/tables/call-waiter)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tables/call-waiter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: qr.token, type: "WATER" }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  }));

  // 6. Analytics
  results.push(await measure("Analytics Summary (GET /api/v1/analytics)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/analytics?restaurantId=${restaurant.id}&period=7d`, {
      headers: { Cookie: `session=${token}` },
    });
    // Analytics might return 402/403 if entitlement disabled, still records time
  }));

  console.log("\n--- BASELINE LATENCY RESULTS ---");
  console.table(results);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Baseline profiling error:", err);
  process.exit(1);
});
