import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ClientBilling } from "./client-billing";

export const dynamic = "force-dynamic";

export default async function DashboardBillingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.restaurants || user.restaurants.length === 0) {
    redirect("/onboarding");
  }

  const primaryMembership = user.restaurants[0];
  const role = primaryMembership.role || "STAFF";

  if (!hasPermission(role, "billing.view")) {
    redirect("/dashboard?denied=billing");
  }

  return (
    <ClientBilling
      restaurantId={primaryMembership.restaurantId}
      restaurantName={primaryMembership.restaurant.name}
      role={role}
    />
  );
}
