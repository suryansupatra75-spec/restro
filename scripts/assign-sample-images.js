const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FOOD_IMAGES = {
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
  special: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80", // Gourmet Biryani / Platter
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
  pasta: "https://images.unsplash.com/photo-1621996346565-e3d5d6281290?auto=format&fit=crop&w=800&q=80",
  default: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"
};

async function main() {
  const items = await prisma.menuItem.findMany();
  console.log(`Found ${items.length} menu items.`);

  for (const item of items) {
    const lower = item.name.toLowerCase();
    let img = FOOD_IMAGES.default;
    if (lower.includes("piz")) img = FOOD_IMAGES.pizza;
    else if (lower.includes("special") || lower.includes("bite")) img = FOOD_IMAGES.special;
    else if (lower.includes("burg")) img = FOOD_IMAGES.burger;
    else if (lower.includes("past")) img = FOOD_IMAGES.pasta;

    const updated = await prisma.menuItem.update({
      where: { id: item.id },
      data: { imageUrl: img }
    });
    console.log(`Updated ${item.name} -> ${updated.imageUrl}`);
  }

  console.log("✅ All items updated with appetizing food photos!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
