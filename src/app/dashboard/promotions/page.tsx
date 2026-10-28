import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { ClientPromotions } from "./client-promotions";

export default async function PromotionsPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const currentRole = user.restaurants[0].role;
  if (!hasPermission(currentRole, "promotions.view")) {
    redirect("/dashboard");
  }

  const restaurant = user.restaurants[0].restaurant;

  return (
    <div className="space-y-6">
      <ClientPromotions
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        currency={restaurant.currency || "USD"}
        canManage={hasPermission(currentRole, "promotions.manage")}
      />
    </div>
  );
}
