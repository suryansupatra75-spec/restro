import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientOrderDashboard } from "./client-dashboard";

export const metadata = {
  title: "Order Management",
};

export default async function OrdersPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const restaurant = user.restaurants[0].restaurant;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Orders</h1>
      </div>
      <ClientOrderDashboard currency={restaurant.currency} />
    </div>
  );
}
