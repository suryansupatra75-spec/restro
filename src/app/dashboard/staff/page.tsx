import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { ClientStaffManager } from "./client-staff";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Staff Management & Roles | Restaurant SaaS",
};

export default async function StaffPage() {
  const user = await getCurrentUser();

  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const membership = user.restaurants[0];
  const restaurant = membership.restaurant;

  // Session Security: Block disabled accounts
  if (membership.status === "DISABLED") {
    redirect("/dashboard");
  }

  // Permission Check: staff.view
  const canViewStaff = hasPermission(membership.role, "staff.view");

  if (!canViewStaff) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Access Restricted</h2>
        <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
          Staff management is restricted to Restaurant Owners and Managers. Your current role is{" "}
          <span className="font-bold text-foreground">{membership.role}</span>.
        </p>
        <div className="mt-6">
          <Link href="/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ClientStaffManager
      restaurantName={restaurant.name}
      currentRole={membership.role}
      currentUserId={user.id}
    />
  );
}
