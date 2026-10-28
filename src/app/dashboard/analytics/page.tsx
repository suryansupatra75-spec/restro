import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, StaffRole } from "@/lib/permissions";
import { ClientAnalytics } from "./client-analytics";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const membership = user.restaurants[0];
  if (membership.status === "DISABLED") {
    redirect("/login");
  }

  const role = membership.role as StaffRole;
  if (!hasPermission(role, "analytics.view")) {
    redirect("/dashboard");
  }

  const currency = membership.restaurant?.currency || "USD";

  return (
    <div className="space-y-6">
      <ClientAnalytics
        restaurantId={membership.restaurantId}
        role={role}
        currency={currency}
      />
    </div>
  );
}
