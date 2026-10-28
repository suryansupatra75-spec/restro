"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Ban,
  AlertTriangle,
  Store,
  Users,
  ShoppingBag,
  QrCode,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

interface RestaurantDetailData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  taxPercentage: number;
  isOrderingEnabled: boolean;
  allowSpecialInstructions: boolean;
  customerNotice: string | null;
  openingTime: string | null;
  closingTime: string | null;
  closedDays: string[];
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    isSuperAdmin: boolean;
  } | null;
  members: Array<{
    membershipId: string;
    role: string;
    status: string;
    joinedAt: string;
    user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      isActive: boolean;
      isSuperAdmin: boolean;
      createdAt: string;
    };
  }>;
  metrics: {
    totalOrders: number;
    completedOrders: number;
    activeOrders: number;
    cancelledOrRejectedOrders: number;
    paidOrdersCount: number;
    paidRevenue: number;
    categoriesCount: number;
    menuItemsCount: number;
    availableItemsCount: number;
    tablesCount: number;
    qrCodesCount: number;
    activeQrCodesCount: number;
    customersCount: number;
    inventoryItemsCount: number;
    lowStockItemsCount: number;
    staffCount: number;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    subtotal: number;
    tax: number;
    total: number;
    itemCount: number;
    tableName: string;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    actorEmail: string;
    action: string;
    reason: string | null;
    createdAt: string;
  }>;
}

export function SuperAdminRestaurantDetailClient({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const [restaurant, setRestaurant] = useState<RestaurantDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status update form state
  const [targetStatus, setTargetStatus] = useState<
    "ACTIVE" | "SUSPENDED" | "INACTIVE"
  >("ACTIVE");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/v1/super-admin/restaurants/${restaurantId}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load restaurant detail");
      }
      setRestaurant(json.restaurant);
      setTargetStatus(json.restaurant.status);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load restaurant detail"
      );
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);

    if (!confirmed) {
      setActionMessage({
        type: "error",
        text: "Please check the confirmation box before applying a restaurant status change.",
      });
      return;
    }

    if (reason.trim().length < 3) {
      setActionMessage({
        type: "error",
        text: "Please enter a clear reason (at least 3 characters) for the audit log.",
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(
        `/api/v1/super-admin/restaurants/${restaurantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: targetStatus,
            reason: reason.trim(),
            confirm: true,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update restaurant status");
      }
      setActionMessage({
        type: "success",
        text: json.message || "Restaurant status updated.",
      });
      setReason("");
      setConfirmed(false);
      await fetchDetail();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update status",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !restaurant) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading restaurant inspection data...
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-center space-y-3">
        <p className="text-red-600 font-bold">
          {error || "Restaurant not found"}
        </p>
        <Link
          href="/super-admin/restaurants"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Restaurant Directory
        </Link>
      </div>
    );
  }

  const { metrics } = restaurant;

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/super-admin/restaurants"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Restaurant Directory
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {restaurant.name}
            </h1>
            {restaurant.status === "ACTIVE" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVE
              </span>
            )}
            {restaurant.status === "SUSPENDED" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                <Ban className="w-3.5 h-3.5" /> SUSPENDED
              </span>
            )}
            {restaurant.status === "INACTIVE" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" /> INACTIVE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono">
            Tenant ID: {restaurant.id} • Slug: /{restaurant.slug}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDetail}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-100 transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Operational KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Orders</span>
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.totalOrders}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.completedOrders} completed • {metrics.activeOrders} active
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Paid Volume</span>
            <Store className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {restaurant.currency} {metrics.paidRevenue.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.paidOrdersCount} paid orders • {metrics.customersCount} guests
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Menu & Catalog</span>
            <QrCode className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.menuItemsCount} Items
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.categoriesCount} categories • {metrics.availableItemsCount}{" "}
            available
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Tables & Team</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {metrics.tablesCount} Tables
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.activeQrCodesCount} active QRs • {metrics.staffCount} staff
          </p>
        </div>
      </div>

      {/* Profile + Platform Status Control */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Restaurant Profile & Configuration */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">
            Tenant Profile & Operational Configuration
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 block">
                Owner Account
              </span>
              {restaurant.owner ? (
                <Link
                  href={`/super-admin/users/${restaurant.owner.id}`}
                  className="font-bold text-slate-900 hover:text-amber-700"
                >
                  {restaurant.owner.name} ({restaurant.owner.email})
                </Link>
              ) : (
                <span className="text-slate-500">None assigned</span>
              )}
            </div>

            <div>
              <span className="text-xs font-bold uppercase text-slate-400 block">
                Contact Info
              </span>
              <span className="text-slate-800">
                {restaurant.email || "No email"} •{" "}
                {restaurant.phone || "No phone"}
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase text-slate-400 block">
                Location
              </span>
              <span className="text-slate-800">
                {[restaurant.address, restaurant.city, restaurant.country]
                  .filter(Boolean)
                  .join(", ") || "Not specified"}
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase text-slate-400 block">
                Currency & Tax
              </span>
              <span className="text-slate-800">
                {restaurant.currency} • {restaurant.taxPercentage}% Tax
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase text-slate-400 block">
                QR Ordering Enabled (Tenant Toggle)
              </span>
              <span className="font-semibold text-slate-800">
                {restaurant.isOrderingEnabled ? "Enabled" : "Paused by Tenant"}
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase text-slate-400 block">
                Operating Hours
              </span>
              <span className="text-slate-800">
                {restaurant.openingTime && restaurant.closingTime
                  ? `${restaurant.openingTime} – ${restaurant.closingTime}`
                  : "Always Open (No hours restriction)"}
              </span>
            </div>
          </div>

          {restaurant.suspendedReason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800">
              <strong>Current Suspension / Inactive Reason:</strong>{" "}
              {restaurant.suspendedReason}
              {restaurant.suspendedAt
                ? ` (${new Date(restaurant.suspendedAt).toLocaleString()})`
                : ""}
            </div>
          )}
        </section>

        {/* Platform Account Status Control */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              Platform Status Control
            </h2>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Suspending or deactivating a restaurant immediately blocks new QR orders
            and tenant dashboard operations until reactivated.
          </p>

          {actionMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold border ${
                actionMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          <form onSubmit={handleStatusSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="restaurant-status-select"
                className="block text-xs font-bold uppercase text-slate-600 mb-1"
              >
                Target Status
              </label>
              <select
                id="restaurant-status-select"
                value={targetStatus}
                onChange={(e) =>
                  setTargetStatus(
                    e.target.value as "ACTIVE" | "SUSPENDED" | "INACTIVE"
                  )
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold bg-white"
              >
                <option value="ACTIVE">ACTIVE (Operational)</option>
                <option value="SUSPENDED">SUSPENDED (Temporarily Blocked)</option>
                <option value="INACTIVE">INACTIVE (Deactivated)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="restaurant-status-reason"
                className="block text-xs font-bold uppercase text-slate-600 mb-1"
              >
                Audit Reason (Required)
              </label>
              <textarea
                id="restaurant-status-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this restaurant status is being changed..."
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>
                I confirm this platform status change for{" "}
                <strong>{restaurant.name}</strong> and understand it will be
                logged.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition disabled:opacity-50"
            >
              {submitting ? "Applying Change..." : "Apply Status Change"}
            </button>
          </form>
        </section>
      </div>

      {/* Staff Roster & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Roster */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-extrabold text-slate-900">
              Restaurant Team ({restaurant.members.length})
            </h2>
            <p className="text-xs text-slate-500">
              Owners, managers, floor staff, and kitchen users linked to this tenant
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {restaurant.members.map((m) => (
              <div
                key={m.membershipId}
                className="p-4 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/super-admin/users/${m.user.id}`}
                    className="font-bold text-slate-900 hover:text-amber-700 block truncate"
                  >
                    {m.user.name}
                  </Link>
                  <p className="text-xs text-slate-500 truncate">
                    {m.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800">
                    {m.role}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      m.status === "ACTIVE" && m.user.isActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {m.user.isActive ? m.status : "USER DISABLED"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Orders */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-extrabold text-slate-900">
              Recent Orders Summary
            </h2>
            <p className="text-xs text-slate-500">
              Read-only inspection of recent order flow
            </p>
          </div>
          {restaurant.recentOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No orders placed at this restaurant yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {restaurant.recentOrders.map((o) => (
                <div
                  key={o.id}
                  className="p-4 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-sm text-slate-900">
                      {o.orderNumber} • {o.tableName}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {o.itemCount} items •{" "}
                      {new Date(o.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-slate-900">
                      {restaurant.currency} {o.total.toFixed(2)}
                    </p>
                    <p className="text-slate-600 mt-0.5">
                      {o.status} • {o.paymentStatus}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Audit History for this Restaurant */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-extrabold text-slate-900">
            Platform Audit History for {restaurant.name}
          </h2>
        </div>
        {restaurant.auditLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No platform status changes recorded for this restaurant yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {restaurant.auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {log.action}
                  </span>
                  {log.reason && (
                    <span className="ml-2 text-slate-600">
                      Reason: {log.reason}
                    </span>
                  )}
                </div>
                <div className="text-slate-500">
                  {log.actorEmail} • {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
