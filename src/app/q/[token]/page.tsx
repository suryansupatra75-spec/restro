import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CustomerMenu } from "./client-menu";
import { CartProvider } from "@/components/customer/cart-context";
import { parseClosedDays } from "@/lib/validations/settings";
import { getCachedMenuCategories } from "@/lib/cache/menu-cache";

export const dynamic = "force-dynamic";

export default async function PublicQRPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  // 1. Fetch QR code and validate
  const qr = await prisma.qRCode.findUnique({
    where: { token },
    include: {
      table: true,
      restaurant: true,
    }
  });

  if (
    !qr ||
    qr.status !== "ACTIVE" ||
    qr.table.status === "ARCHIVED" ||
    qr.restaurant.status === "INACTIVE"
  ) {
    notFound();
  }

  const isRestaurantSuspended = qr.restaurant.status === "SUSPENDED";

  // 2. Fetch categories and items for this restaurant (in-memory cached for instantaneous response)
  const categoriesData = await getCachedMenuCategories(qr.restaurantId);

  // 3. Clean and map data for public consumption (strictly safe public fields only)
  const categories = categoriesData.map(cat => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    items: cat.items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      price: Number(item.price),
      isAvailable: item.isAvailable,
      isVegetarian: item.isVegetarian,
      isVegan: item.isVegan,
      variants: item.variants.map(v => ({
        id: v.id,
        name: v.name,
        price: Number(v.price),
        isAvailable: v.isAvailable
      })),
      addons: item.addonLinks.map(link => ({
        id: link.addon.id,
        name: link.addon.name,
        price: Number(link.addon.price),
        isAvailable: link.addon.isAvailable
      }))
    }))
  }));

  const restaurant = {
    id: qr.restaurant.id,
    name: qr.restaurant.name,
    description: qr.restaurant.description,
    logoUrl: qr.restaurant.logoUrl,
    coverImageUrl: qr.restaurant.coverImageUrl,
    currency: qr.restaurant.currency || "USD",
    taxPercentage: Number(qr.restaurant.taxPercentage ?? 0),
    accentColor: qr.restaurant.accentColor || "#E85D2A",
    openingTime: qr.restaurant.openingTime ?? null,
    closingTime: qr.restaurant.closingTime ?? null,
    closedDays: parseClosedDays(qr.restaurant.closedDays),
    isOrderingEnabled: !isRestaurantSuspended && qr.restaurant.isOrderingEnabled !== false,
    customerNotice: isRestaurantSuspended
      ? "This restaurant is temporarily unavailable to accept online orders."
      : (qr.restaurant.customerNotice ?? null),
    allowSpecialInstructions: qr.restaurant.allowSpecialInstructions !== false,
    googleReviewUrl: qr.restaurant.googleReviewUrl ?? null,
    phone: qr.restaurant.phone ?? null,
    address: qr.restaurant.address ?? null,
    city: qr.restaurant.city ?? null,
  };

  const table = {
    name: qr.table.name,
  };

  return (
    <CartProvider restaurantId={restaurant.id} taxPercentage={restaurant.taxPercentage}>
      <CustomerMenu 
        restaurant={restaurant} 
        table={table} 
        categories={categories} 
        token={token}
      />
    </CartProvider>
  );
}

