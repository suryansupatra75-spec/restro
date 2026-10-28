"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Store,
  Users,
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Activity,
  FileSearch,
} from "lucide-react";

interface OverviewData {
  metrics: {
    restaurants: {
      total: number;
      active: number;
      suspended: number;
      inactive: number;
    };
    users: {
      total: number;
      active: number;
      disabled: number;
      superAdmins: number;
      restaurantOwners: number;
      totalStaffMemberships: number;
      totalCustomers: number;
    };
    orders: {
      total: number;
      completed: number;
      active: number;
      cancelledOrRejected: number;
      paidOrdersCount: number;
      paidGrossVolume: number;
      last24h: number;
      last7d: number;
    };
  };
  recentRestaurants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    suspendedReason: string | null;
    city: string | null;
    currency: string;
    isOrderingEnabled: boolean;
    createdAt: string;
    owner: {
      id: string;
      name: string;
      email: string;
      isActive: boolean;
    } | null;
    counts: {
      orders: number;
      menuItems: number;
      tables: number;
      staff: number;
    };
  }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    isSuperAdmin: boolean;
    createdAt: string;
    memberships: Array<{
      role: string;
      status: string;
      restaurantId: string;
      restaurantName: string;
      restaurantSlug: string;
      restaurantStatus: string;
    }>;
  }>;
  recentAuditLogs: Array<{
    id: string;
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    targetLabel: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  systemStatus: {
    databaseConnected: boolean;
    timestamp: string;
  };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  }
  if (status === "SUSPENDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
        <Ban className="w-3 h-3" /> Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
      <AlertTriangle className="w-3 h-3" /> Inactive
    </span>
  );
}

export function SuperAdminOverviewClient() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/super-admin/overview", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load platform overview");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-32 bg-white border border-slate-200 rounded-2xl p-5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-600 font-bold mb-2">
          Unable to load platform overview
        </p>
        <p className="text-sm text-slate-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={fetchOverview}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const { metrics, recentRestaurants, recentUsers, recentAuditLogs } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Platform Overview
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Real-time multi-tenant operational metrics across all registered restaurants and users.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchOverview}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Restaurants
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900">
            {metrics.restaurants.total}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-medium">
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              {metrics.restaurants.active} Active
            </span>
            <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-md">
              {metrics.restaurants.suspended} Suspended
            </span>
            {metrics.restaurants.inactive > 0 && (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                {metrics.restaurants.inactive} Inactive
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Platform Users
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900">
            {metrics.users.total}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-medium">
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              {metrics.users.active} Active
            </span>
            <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              {metrics.users.disabled} Disabled
            </span>
            <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
              {metrics.users.superAdmins} Super Admin
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Platform Orders
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900">
            {metrics.orders.total}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-medium text-slate-600">
            <span>{metrics.orders.completed} Completed</span>
            <span>•</span>
            <span>{metrics.orders.active} Active</span>
            <span>•</span>
            <span>{metrics.orders.last24h} in 24h</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Paid Order Volume
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900">
            ${metrics.orders.paidGrossVolume.toFixed(2)}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-medium text-slate-600">
            <span>{metrics.orders.paidOrdersCount} Paid Orders</span>
            <span>•</span>
            <span>{metrics.users.totalCustomers} Guests Tracked</span>
          </div>
        </div>
      </div>

      {/* Recent Restaurants & Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Restaurants */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Recent Restaurants
              </h2>
              <p className="text-xs text-slate-500">
                Latest onboarded restaurant tenants
              </p>
            </div>
            <Link
              href="/super-admin/restaurants"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentRestaurants.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No restaurants have been registered yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentRestaurants.map((r) => (
                <div
                  key={r.id}
                  className="p-4 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/super-admin/restaurants/${r.id}`}
                        className="font-bold text-sm text-slate-900 hover:text-amber-700 truncate"
                      >
                        {r.name}
                      </Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Slug: <span className="font-mono">{r.slug}</span>
                      {r.owner ? ` • Owner: ${r.owner.email}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {r.counts.orders}
                      </span>{" "}
                      orders •{" "}
                      <span className="font-semibold text-slate-900">
                        {r.counts.menuItems}
                      </span>{" "}
                      items
                    </div>
                    <Link
                      href={`/super-admin/restaurants/${r.id}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition"
                    >
                      Inspect
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Users */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Recent Users
              </h2>
              <p className="text-xs text-slate-500">
                Latest registered platform accounts
              </p>
            </div>
            <Link
              href="/super-admin/users"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentUsers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No users found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentUsers.map((u) => (
                <div
                  key={u.id}
                  className="p-4 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/super-admin/users/${u.id}`}
                        className="font-bold text-sm text-slate-900 hover:text-amber-700 truncate"
                      >
                        {u.name}
                      </Link>
                      {u.isSuperAdmin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <ShieldCheck className="w-3 h-3" /> Super Admin
                        </span>
                      )}
                      {!u.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {u.email}
                      {u.memberships.length > 0
                        ? ` • ${u.memberships
                            .map((m) => `${m.role} @ ${m.restaurantName}`)
                            .join(", ")}`
                        : " • No restaurant membership"}
                    </p>
                  </div>

                  <Link
                    href={`/super-admin/users/${u.id}`}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition self-start sm:self-auto shrink-0"
                  >
                    Inspect
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent Platform Audit Logs */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSearch className="w-5 h-5 text-slate-700" />
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Recent Platform Audit Trail
              </h2>
              <p className="text-xs text-slate-500">
                Sensitive Super Admin status and permission actions
              </p>
            </div>
          </div>
          <Link
            href="/super-admin/audit-logs"
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800"
          >
            <span>Full Audit Log</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentAuditLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No platform audit events recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentAuditLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                      {log.action}
                    </span>
                    <span className="text-slate-600">
                      on <strong>{log.targetType}</strong>{" "}
                      {log.targetLabel ? `(${log.targetLabel})` : ""}
                    </span>
                  </div>
                  {log.reason && (
                    <p className="text-slate-500">Reason: {log.reason}</p>
                  )}
                </div>
                <div className="text-slate-500 sm:text-right shrink-0">
                  <p className="font-medium text-slate-700">{log.actorEmail}</p>
                  <p>{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
