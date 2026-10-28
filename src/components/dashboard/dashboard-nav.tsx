"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  UtensilsCrossed, 
  List, 
  Grid2X2, 
  ChefHat,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Store,
  Users,
  UserCheck,
  Boxes,
  BarChart3,
  Bell,
  Settings,
  CreditCard,
  Tag,
  Gift,
  Share2,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { hasPermission, ROLE_METADATA, StaffRole, Permission } from "@/lib/permissions";
import { NotificationBell } from "@/components/dashboard/notification-bell";

interface DashboardNavProps {
  user: {
    name: string;
    email: string;
  };
  restaurant: {
    id: string;
    name: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
  role?: string;
}

export interface NavLinkItem {
  name: string;
  href: string;
  icon: any;
  permission?: Permission;
}

export const NAV_LINKS: NavLinkItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, permission: "analytics.view" },
  { name: "Live Orders", href: "/dashboard/orders", icon: ShoppingCart, permission: "orders.view" },
  { name: "Kitchen (KDS)", href: "/dashboard/kitchen", icon: ChefHat, permission: "kitchen.view" },
  { name: "Receipts", href: "/dashboard/receipts", icon: Receipt, permission: "receipts.view" },
  { name: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { name: "Customers (CRM)", href: "/dashboard/customers", icon: UserCheck, permission: "customers.view" },
  { name: "Promotions", href: "/dashboard/promotions", icon: Tag, permission: "promotions.view" },
  { name: "Loyalty Program", href: "/dashboard/loyalty", icon: Gift, permission: "loyalty.view" },
  { name: "Inventory", href: "/dashboard/inventory", icon: Boxes, permission: "inventory.view" },
  { name: "Menu Overview", href: "/dashboard/menu", icon: UtensilsCrossed, permission: "menu.view" },
  { name: "Menu Items", href: "/dashboard/menu/items", icon: UtensilsCrossed, permission: "menu.view" },
  { name: "Categories", href: "/dashboard/menu/categories", icon: List, permission: "menu.view" },
  { name: "Tables & QR", href: "/dashboard/tables", icon: Grid2X2, permission: "tables.view" },
  { name: "Staff & Roles", href: "/dashboard/staff", icon: Users, permission: "staff.view" },
  { name: "Billing & Plan", href: "/dashboard/billing", icon: CreditCard, permission: "billing.view" },
  { name: "Integrations", href: "/dashboard/integrations", icon: Share2, permission: "integrations.view" },
  { name: "Audit Logs", href: "/dashboard/audit-logs", icon: ShieldCheck, permission: "audit.view" },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, permission: "settings.view" },
];

export const BOTTOM_TABS: NavLinkItem[] = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingCart, permission: "orders.view" },
  { name: "Kitchen", href: "/dashboard/kitchen", icon: ChefHat, permission: "kitchen.view" },
  { name: "CRM", href: "/dashboard/customers", icon: UserCheck, permission: "customers.view" },
  { name: "Stock", href: "/dashboard/inventory", icon: Boxes, permission: "inventory.view" },
  { name: "Menu", href: "/dashboard/menu", icon: UtensilsCrossed, permission: "menu.view" },
  { name: "Staff", href: "/dashboard/staff", icon: Users, permission: "staff.view" },
];

export function DashboardNav({ user, restaurant, role = "OWNER" }: DashboardNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liveRestaurant, setLiveRestaurant] = useState({
    name: restaurant.name,
    logoUrl: restaurant.logoUrl || null,
    accentColor: restaurant.accentColor || "#E85D2A",
  });

  useEffect(() => {
    setLiveRestaurant({
      name: restaurant.name,
      logoUrl: restaurant.logoUrl || null,
      accentColor: restaurant.accentColor || "#E85D2A",
    });
  }, [restaurant.name, restaurant.logoUrl, restaurant.accentColor]);

  useEffect(() => {
    const handleSettingsUpdated = (e: Event) => {
      const custom = e as CustomEvent<{
        name?: string;
        logoUrl?: string | null;
        accentColor?: string | null;
      }>;
      if (custom.detail) {
        setLiveRestaurant((prev) => ({
          name: custom.detail.name ?? prev.name,
          logoUrl:
            custom.detail.logoUrl !== undefined
              ? custom.detail.logoUrl
              : prev.logoUrl,
          accentColor: custom.detail.accentColor || prev.accentColor,
        }));
      }
    };
    window.addEventListener("restaurant-settings-updated", handleSettingsUpdated);
    return () => {
      window.removeEventListener("restaurant-settings-updated", handleSettingsUpdated);
    };
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  const isLinkActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  const roleInfo = ROLE_METADATA[role as StaffRole] || { title: role, description: "", badgeColor: "bg-surface-muted text-foreground" };
  const roleLabel = roleInfo.title || role;

  const visibleNavLinks = NAV_LINKS.filter(
    (link) => !link.permission || hasPermission(role, link.permission)
  );

  const visibleBottomTabs = BOTTOM_TABS.filter(
    (tab) => !tab.permission || hasPermission(role, tab.permission)
  ).slice(0, 5);

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. DESKTOP SIDEBAR (Visible on md and above)
          ───────────────────────────────────────────────────────────── */}
      <aside className="w-64 bg-surface border-r border-border hidden md:flex flex-col shrink-0">
        <div className="h-16 flex items-center justify-between px-4 border-b border-border gap-2">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-black text-lg text-primary focus-visible:outline-none min-w-0">
            {liveRestaurant.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={liveRestaurant.logoUrl}
                alt={liveRestaurant.name}
                className="w-8 h-8 rounded-xl object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
            )}
            <span className="truncate">{liveRestaurant.name}</span>
          </Link>
          <NotificationBell restaurantId={restaurant.id} role={role} align="left" />
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {visibleNavLinks.map((link) => {
              const active = isLinkActive(link.href);
              const Icon = link.icon;
              return (
                <li key={link.href + link.name}>
                  <Link
                    href={link.href}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? "bg-primary text-white shadow-xs"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{link.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-border bg-surface-muted/30">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold truncate text-foreground">{user.name}</p>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase shrink-0">
                  {roleLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          2. MOBILE TOPBAR (Visible on screens < md)
          ───────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 md:hidden shrink-0 sticky top-0 z-40 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-xl bg-surface-muted hover:bg-surface-muted/80 flex items-center justify-center text-foreground cursor-pointer transition active:scale-95 shrink-0"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-extrabold text-sm text-foreground truncate">{liveRestaurant.name}</h2>
            <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <Store className="w-2.5 h-2.5 text-primary" /> Admin Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <NotificationBell restaurantId={restaurant.id} role={role} align="right" />
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition cursor-pointer"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          3. MOBILE SLIDE-OUT DRAWER (Full Navigation Sheet)
          ───────────────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-4/5 max-w-xs bg-surface h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-surface-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                {liveRestaurant.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={liveRestaurant.logoUrl}
                    alt={liveRestaurant.name}
                    className="w-8 h-8 rounded-xl object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <UtensilsCrossed className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-sm truncate">{liveRestaurant.name}</h3>
                  <span className="text-[10px] text-primary font-bold">{roleLabel}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Close Navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Links */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleNavLinks.map((link) => {
                const active = isLinkActive(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href + link.name}
                    href={link.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? "bg-primary text-white shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{link.name}</span>
                    </div>
                    {active && <ChevronRight className="w-4 h-4" />}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer Footer / User Profile & Logout */}
            <div className="p-4 border-t border-border bg-surface-muted/40">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold truncate text-foreground">{user.name}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary uppercase shrink-0">
                      {roleLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 px-3 text-xs font-bold text-white bg-destructive hover:bg-destructive/90 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. MOBILE BOTTOM TAB BAR (Persistent Quick Navigation)
          ───────────────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border md:hidden flex items-center justify-around px-2 py-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {visibleBottomTabs.map((tab) => {
          const active = isLinkActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer relative ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className={`text-[10px] mt-0.5 ${active ? "font-black" : "font-medium"}`}>
                {tab.name}
              </span>
              {active && (
                <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
