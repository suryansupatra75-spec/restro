import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { ClientIntegrations } from "./client-integrations";

export const metadata = {
  title: "External Integrations | Restaurant Dashboard",
  description: "Manage printers, messaging, accounting exports, API keys, and webhooks",
};

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const membership = user.restaurants?.[0];
  if (!membership) {
    redirect("/onboarding");
  }

  // RBAC Permission check
  const canView = hasPermission(membership.role, "integrations.view");
  if (!canView) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-800">
          <h2 className="text-lg font-bold">Access Restricted</h2>
          <p className="text-sm mt-1">
            You do not have permission to view integrations. Please contact your restaurant owner.
          </p>
        </div>
      </div>
    );
  }

  const canManage = hasPermission(membership.role, "integrations.manage");
  const canTest = hasPermission(membership.role, "integrations.test");
  const canManageKeys = hasPermission(membership.role, "api_keys.manage");

  return (
    <ClientIntegrations
      restaurantId={membership.restaurantId}
      restaurantName={membership.restaurant.name}
      currency={membership.restaurant.currency}
      userRole={membership.role}
      canManage={canManage}
      canTest={canTest}
      canManageKeys={canManageKeys}
    />
  );
}
