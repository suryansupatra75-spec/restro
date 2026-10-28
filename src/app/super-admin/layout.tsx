import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminNav } from "@/components/super-admin/super-admin-nav";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Default-deny platform authorization: ordinary restaurant roles cannot access /super-admin
  if (!user.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 mb-3">
            403 Forbidden
          </span>
          <h1 className="text-xl font-black text-white mb-2">
            Platform Super Admin Required
          </h1>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Your account (<strong>{user.email}</strong>) does not have SaaS platform-level
            Super Admin privileges. Restaurant owners and staff can only access their own
            restaurant workspace.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Link
              href="/dashboard"
              className="flex-1 py-2.5 px-4 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition text-sm text-center"
            >
              Go to Restaurant Dashboard
            </Link>
            <Link
              href="/login"
              className="py-2.5 px-4 bg-slate-800 text-slate-200 font-semibold rounded-xl hover:bg-slate-700 transition text-sm text-center"
            >
              Switch Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-screen min-h-[100dvh] bg-slate-50 text-slate-900 overflow-hidden">
      <SuperAdminNav
        user={{ id: user.id, name: user.name, email: user.email }}
        hasRestaurantMembership={user.restaurants.length > 0}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="bg-slate-900 text-slate-200 px-4 sm:px-6 py-2 text-xs border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">SaaS Control Plane</span>
            <span className="text-slate-400 hidden sm:inline">
              — Platform-level oversight only. All status changes require confirmation and are recorded in the platform audit log.
            </span>
          </div>
          <span className="text-[11px] font-mono text-amber-300">
            Actor: {user.email}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
