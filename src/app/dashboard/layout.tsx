import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.restaurants.length === 0) {
    if (user.isSuperAdmin) {
      redirect("/super-admin");
    }
    redirect("/onboarding");
  }

  const membership = user.restaurants[0];
  const currentRestaurant = membership.restaurant;

  // Session security: if staff account is disabled, show access suspended screen
  if (membership.status === "DISABLED") {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 sm:p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            ✕
          </div>
          <h1 className="text-xl font-black text-foreground mb-2">Account Access Suspended</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Your staff account at <strong>{currentRestaurant.name}</strong> has been deactivated by an administrator. Please contact your manager or the restaurant owner to restore access.
          </p>
          <a
            href="/login"
            className="inline-block w-full py-2.5 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition text-sm text-center shadow-xs"
          >
            Sign Out / Switch Account
          </a>
        </div>
      </div>
    );
  }

  // Tenant Status Security: if restaurant is suspended or inactive on the platform
  if (currentRestaurant.status === "SUSPENDED" || currentRestaurant.status === "INACTIVE") {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 sm:p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            !
          </div>
          <h1 className="text-xl font-black text-foreground mb-2">
            Restaurant Account {currentRestaurant.status === "SUSPENDED" ? "Suspended" : "Inactive"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            <strong>{currentRestaurant.name}</strong> is currently marked as{" "}
            <span className="font-semibold">{currentRestaurant.status}</span> on the platform.
            {currentRestaurant.suspendedReason
              ? ` Reason: ${currentRestaurant.suspendedReason}`
              : " Please contact platform support to restore operations."}
          </p>
          <div className="space-y-2.5">
            {user.isSuperAdmin && (
              <a
                href="/super-admin"
                className="inline-block w-full py-2.5 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition text-sm text-center shadow-xs"
              >
                Open Super Admin Panel
              </a>
            )}
            <a
              href="/login"
              className="inline-block w-full py-2.5 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition text-sm text-center shadow-xs"
            >
              Sign Out / Switch Account
            </a>
          </div>
        </div>
      </div>
    );
  }

  const brandStyle = {
    "--color-primary": currentRestaurant.accentColor || "#E85D2A",
  } as React.CSSProperties;

  return (
    <div
      id="dashboard-root"
      style={brandStyle}
      className="flex flex-col md:flex-row h-[100dvh] md:h-screen min-h-[100dvh] bg-surface-muted overflow-hidden"
    >
      {/* Responsive Navigation: Sidebar for Desktop + Topbar & Drawer & Bottom Nav for Mobile */}
      <DashboardNav 
        user={{ name: user.name, email: user.email }} 
        restaurant={{
          id: currentRestaurant.id,
          name: currentRestaurant.name,
          logoUrl: currentRestaurant.logoUrl,
          accentColor: currentRestaurant.accentColor,
        }}
        role={membership.role}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
