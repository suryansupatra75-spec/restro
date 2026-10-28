import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, StaffRole } from "@/lib/permissions";
import { ClientInventory } from "./client-inventory";

export default async function InventoryPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const membership = user.restaurants[0];
  if (membership.status === "DISABLED") {
    redirect("/login");
  }

  const role = membership.role as StaffRole;
  if (!hasPermission(role, "inventory.view")) {
    redirect("/dashboard");
  }

  const currency = membership.restaurant?.currency || "USD";

  return (
    <div className="space-y-6">
      <ClientInventory
        restaurantId={membership.restaurantId}
        role={role}
        currency={currency}
      />
    </div>
  );
}
