"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck,
  LayoutGrid,
  Store,
  Users,
  FileSearch,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  CreditCard,
} from "lucide-react";

interface SuperAdminNavProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  hasRestaurantMembership: boolean;
}

const NAV_ITEMS = [
  {
    name: "Overview",
    href: "/super-admin",
    icon: LayoutGrid,
    exact: true,
  },
  {
    name: "Restaurants",
    href: "/super-admin/restaurants",
    icon: Store,
    exact: false,
  },
  {
    name: "Plans & Billing",
    href: "/super-admin/plans",
    icon: CreditCard,
    exact: false,
  },
  {
    name: "Users",
    href: "/super-admin/users",
    icon: Users,
    exact: false,
  },
  {
    name: "Audit Logs",
    href: "/super-admin/audit-logs",
    icon: FileSearch,
    exact: false,
  },
];

export function SuperAdminNav({
  user,
  hasRestaurantMembership,
}: SuperAdminNavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isItemActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await fetch("/api/v1/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-slate-950 text-slate-100 border-r border-slate-800 shrink-0">
        <div className="p-5 border-b border-slate-800">
          <Link href="/super-admin" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm tracking-tight text-white truncate">
                  Platform Admin
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Multi-Tenant Control Plane
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Super Admin Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                  active
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          {hasRestaurantMembership && (
            <Link
              href="/dashboard"
              className="flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition"
            >
              <span>Tenant Dashboard</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          )}

          <div className="px-2 py-1">
            <p className="text-xs font-bold text-white truncate">{user.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center justify-center gap-2 w-full px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-xs font-semibold transition disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-950 text-white border-b border-slate-800 shrink-0 z-30">
        <Link href="/super-admin" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-black text-sm tracking-tight text-white block truncate">
              Platform Super Admin
            </span>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Slide-Down Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[57px] z-40 bg-slate-950/95 backdrop-blur-xs flex flex-col justify-between p-4 overflow-y-auto">
          <nav className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                    active
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-slate-800 space-y-3">
            {hasRestaurantMembership && (
              <Link
                href="/dashboard"
                className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200"
              >
                <span>Open Tenant Dashboard</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </Link>
            )}
            <div className="px-2">
              <p className="text-xs font-bold text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-semibold"
            >
              <LogOut className="w-4 h-4" />
              <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
