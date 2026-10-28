import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, StaffRole } from "@/lib/permissions";
import { ClientSettings } from "./client-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const membership = user.restaurants[0];
  if (membership.status === "DISABLED") {
    redirect("/login");
  }

  const role = membership.role as StaffRole;
  if (!hasPermission(role, "settings.view")) {
    redirect("/dashboard");
  }

  const canManageSettings = hasPermission(role, "settings.manage");

  return (
    <div className="space-y-6">
      <ClientSettings
        restaurantId={membership.restaurantId}
        role={role}
        canManageSettings={canManageSettings}
      />
    </div>
  );
}
