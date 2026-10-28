const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      tables: { include: { qrCodes: true } },
      menuItems: true,
    }
  });

  console.log("Restaurants count:", restaurants.length);
  for (const r of restaurants) {
    console.log(`Restaurant: ${r.name} (${r.id}) status=${r.status}`);
    console.log(`  Tables: ${r.tables.length}`);
    for (const t of r.tables) {
      console.log(`    Table: ${t.name} (${t.id}) status=${t.status} QRs=${t.qrCodes.length}`);
      for (const q of t.qrCodes) {
        console.log(`      QR token: ${q.token} status=${q.status}`);
      }
    }
    console.log(`  Menu items: ${r.menuItems.length}`);
    for (const m of r.menuItems) {
      console.log(`    Item: ${m.name} (${m.id}) price=${m.price} avail=${m.isAvailable} status=${m.status}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
