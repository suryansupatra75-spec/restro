import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientKitchenDisplay } from "./client-kitchen";

export const metadata = {
  title: "Kitchen Display System",
};

export default async function KitchenPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Kitchen Display</h1>
      </div>
      <ClientKitchenDisplay currency={user.restaurants[0]?.restaurant.currency} />
    </div>
  );
}
