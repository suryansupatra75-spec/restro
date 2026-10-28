import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

async function main() {
  const qr = await prisma.qRCode.findUnique({
    where: { token: "9c3fac487338425c" },
    include: {
      restaurant: {
        include: {
          categories: { include: { items: true } }
        }
      }
    }
  });

  const validItem = qr.restaurant.categories[0].items[0];
  const raceKey = `INVESTIGATE_RACE_${Date.now()}`;
  const payload = {
    token: qr.token,
    paymentMethod: "CASH",
    idempotencyKey: raceKey,
    customerName: "Race Investigator",
    items: [{ menuItemId: validItem.id, quantity: 1 }],
  };

  console.log("Firing 5 simultaneous requests with identical idempotencyKey:", raceKey);
  const results = await Promise.all(
    Array.from({ length: 5 }, async (_, i) => {
      const s = performance.now();
      const res = await fetch(`${BASE_URL}/api/v1/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = performance.now() - s;
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { req: i, status: res.status, duration: d, json, text };
    })
  );

  console.log("Results:");
  for (const r of results) {
    console.log(`Req ${r.req}: status ${r.status} (${r.duration.toFixed(1)}ms) ->`, r.json || r.text.slice(0, 120));
  }

  const inDb = await prisma.order.findMany({ where: { idempotencyKey: raceKey } });
  console.log("Orders found in DB with this idempotencyKey:", inDb.length);

  // cleanup
  if (inDb.length > 0) {
    for (const ord of inDb) {
      await prisma.orderItem.deleteMany({ where: { orderId: ord.id } });
      await prisma.payment.deleteMany({ where: { orderId: ord.id } });
      await prisma.order.delete({ where: { id: ord.id } });
    }
  }
}

main().finally(() => prisma.$disconnect());
