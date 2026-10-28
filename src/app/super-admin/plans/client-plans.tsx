"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  CheckCircle2,
  Archive,
  Edit3,
  AlertTriangle,
} from "lucide-react";

function formatMoneyMinor(amountMinor: number, currency = "INR"): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function ClientSuperAdminPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [tenantItems, setTenantItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Create plan form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlan, setNewPlan] = useState({
    key: "",
    name: "",
    description: "",
    billingInterval: "MONTHLY" as "MONTHLY" | "YEARLY",
    priceMinor: 149900,
    currency: "INR",
    trialDays: 14,
    maxStaff: 5,
    maxMenuItems: 250,
    maxTables: 25,
    analyticsEnabled: true,
    analyticsExportEnabled: false,
    inventoryEnabled: true,
    customBrandingEnabled: false,
  });

  // Edit plan modal state
  const [editingPlan, setEditingPlan] = useState<any | null>(null);

  // Tenant assignment modal state
  const [assigningTenant, setAssigningTenant] = useState<any | null>(null);
  const [assignForm, setAssignForm] = useState({
    planId: "",
    status: "TRIALING",
    trialDays: 14,
    recordManualInvoicePaid: false,
    notes: "",
  });

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [plansRes, subsRes] = await Promise.all([
        fetch("/api/v1/super-admin/plans", { cache: "no-store" }),
        fetch("/api/v1/super-admin/subscriptions", { cache: "no-store" }),
      ]);

      const plansJson = await plansRes.json();
      const subsJson = await subsRes.json();

      if (!plansRes.ok) {
        throw new Error(plansJson.error || "Failed to load plans");
      }
      if (!subsRes.ok) {
        throw new Error(subsJson.error || "Failed to load subscriptions");
      }

      setPlans(plansJson.plans || []);
      setTenantItems(subsJson.items || []);
      setSummary(subsJson.summary || null);
    } catch (err: any) {
      setError(err.message || "Failed to load platform billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBanner(null);
      const res = await fetch("/api/v1/super-admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPlan,
          key: newPlan.key.trim().toUpperCase(),
          priceMinor: Number(newPlan.priceMinor),
          trialDays: Number(newPlan.trialDays),
          maxStaff: Number(newPlan.maxStaff),
          maxMenuItems: Number(newPlan.maxMenuItems),
          maxTables: Number(newPlan.maxTables),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create plan");
      }
      setBanner({
        type: "success",
        text: `Created plan "${json.plan.name}" (${json.plan.key}).`,
      });
      setShowCreateForm(false);
      await loadAll();
    } catch (err: any) {
      setBanner({ type: "error", text: err.message });
    }
  };

  const handleUpdatePlan = async (planId: string, payload: any) => {
    try {
      setBanner(null);
      const res = await fetch(`/api/v1/super-admin/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update plan");
      }
      setBanner({
        type: "success",
        text: `Updated plan "${json.plan.name}". Existing subscription snapshots remain untouched.`,
      });
      setEditingPlan(null);
      await loadAll();
    } catch (err: any) {
      setBanner({ type: "error", text: err.message });
    }
  };

  const handleAssignSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningTenant) return;
    try {
      setBanner(null);
      const res = await fetch(
        `/api/v1/super-admin/subscriptions/${assigningTenant.restaurant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: assignForm.planId,
            status: assignForm.status,
            trialDays: Number(assignForm.trialDays),
            recordManualInvoicePaid: Boolean(
              assignForm.recordManualInvoicePaid
            ),
            notes: assignForm.notes || undefined,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update tenant subscription");
      }
      setBanner({
        type: "success",
        text: `Updated subscription for "${assigningTenant.restaurant.name}" to ${json.subscription.planNameSnapshot} (${json.subscription.status}).`,
      });
      setAssigningTenant(null);
      await loadAll();
    } catch (err: any) {
      setBanner({ type: "error", text: err.message });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 mb-1">
            <ShieldCheck className="w-4 h-4" />
            Platform Monetization & Plan Enforcement
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            SaaS Subscription Plans & Tenant Billing
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure the platform plan catalogue, numeric limits, feature
            entitlements, and tenant subscription states.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            New Plan
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-2xl border p-4 text-sm font-semibold flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* KPI Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold uppercase text-slate-500">
              Verified SaaS Revenue
            </div>
            <div className="text-xl font-black text-emerald-700 mt-1">
              {formatMoneyMinor(
                summary.verifiedSaasRevenueMinor,
                summary.currency
              )}
            </div>
            <div className="text-[11px] text-slate-500">
              {summary.verifiedPaidInvoicesCount} paid SaaS invoice(s)
            </div>
          </div>
          {["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"].map(
            (st) => (
              <div
                key={st}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="text-[11px] font-bold uppercase text-slate-500">
                  {st}
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {summary.statusCounts?.[st] ?? 0}
                </div>
                <div className="text-[11px] text-slate-500">Restaurants</div>
              </div>
            )
          )}
        </div>
      )}

      {/* Create Plan Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreatePlan}
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <h3 className="text-base font-black text-slate-900">
            Create New Subscription Plan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Plan Key (UPPERCASE)
              </label>
              <input
                required
                value={newPlan.key}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, key: e.target.value.toUpperCase() })
                }
                placeholder="PLUS_MONTHLY"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Display Name
              </label>
              <input
                required
                value={newPlan.name}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, name: e.target.value })
                }
                placeholder="Plus Plan"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Price in Minor Units (Paise)
              </label>
              <input
                type="number"
                required
                min={0}
                value={newPlan.priceMinor}
                onChange={(e) =>
                  setNewPlan({
                    ...newPlan,
                    priceMinor: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Max Staff Seats
              </label>
              <input
                type="number"
                required
                min={1}
                value={newPlan.maxStaff}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, maxStaff: Number(e.target.value) })
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Max Menu Items
              </label>
              <input
                type="number"
                required
                min={1}
                value={newPlan.maxMenuItems}
                onChange={(e) =>
                  setNewPlan({
                    ...newPlan,
                    maxMenuItems: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Max Tables
              </label>
              <input
                type="number"
                required
                min={1}
                value={newPlan.maxTables}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, maxTables: Number(e.target.value) })
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newPlan.analyticsEnabled}
                onChange={(e) =>
                  setNewPlan({
                    ...newPlan,
                    analyticsEnabled: e.target.checked,
                  })
                }
              />
              Analytics Enabled
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newPlan.analyticsExportEnabled}
                onChange={(e) =>
                  setNewPlan({
                    ...newPlan,
                    analyticsExportEnabled: e.target.checked,
                  })
                }
              />
              Analytics CSV Export
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newPlan.inventoryEnabled}
                onChange={(e) =>
                  setNewPlan({
                    ...newPlan,
                    inventoryEnabled: e.target.checked,
                  })
                }
              />
              Inventory & Recipes Enabled
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
            >
              Create Plan
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Plan Catalogue Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-amber-600" />
          Platform Plan Catalogue
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between ${
                p.isArchived
                  ? "border-slate-200 bg-slate-50 opacity-75"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-slate-500">
                    {p.key}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.isArchived
                        ? "bg-slate-200 text-slate-700"
                        : p.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {p.isArchived
                      ? "ARCHIVED"
                      : p.isActive
                        ? "ACTIVE"
                        : "INACTIVE"}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{p.name}</h3>
                <div className="text-xl font-black text-amber-600 mt-1">
                  {formatMoneyMinor(p.priceMinor, p.currency)}
                  <span className="text-xs font-normal text-slate-500">
                    /{p.billingInterval === "YEARLY" ? "yr" : "mo"}
                  </span>
                </div>

                <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-700">
                  <li>• Max Staff: {p.maxStaff}</li>
                  <li>• Max Menu Items: {p.maxMenuItems}</li>
                  <li>• Max Tables: {p.maxTables}</li>
                  <li>• Trial Days: {p.trialDays}</li>
                  <li>
                    • Analytics: {p.analyticsEnabled ? "Enabled" : "Disabled"}
                  </li>
                  <li>
                    • Inventory: {p.inventoryEnabled ? "Enabled" : "Disabled"}
                  </li>
                  <li className="font-bold text-slate-900 pt-1">
                    • Active Subscribers: {p.activeSubscribersCount}
                  </li>
                </ul>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setEditingPlan(p)}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
                {!p.isArchived && (
                  <button
                    onClick={() =>
                      handleUpdatePlan(p.id, {
                        isArchived: true,
                        isActive: false,
                      })
                    }
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">
              Edit Plan — {editingPlan.name} ({editingPlan.key})
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Price (Paise)</label>
                <input
                  type="number"
                  value={editingPlan.priceMinor}
                  onChange={(e) =>
                    setEditingPlan({
                      ...editingPlan,
                      priceMinor: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Max Staff</label>
                <input
                  type="number"
                  value={editingPlan.maxStaff}
                  onChange={(e) =>
                    setEditingPlan({
                      ...editingPlan,
                      maxStaff: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Max Menu Items</label>
                <input
                  type="number"
                  value={editingPlan.maxMenuItems}
                  onChange={(e) =>
                    setEditingPlan({
                      ...editingPlan,
                      maxMenuItems: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Max Tables</label>
                <input
                  type="number"
                  value={editingPlan.maxTables}
                  onChange={(e) =>
                    setEditingPlan({
                      ...editingPlan,
                      maxTables: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-3">
              <button
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleUpdatePlan(editingPlan.id, {
                    priceMinor: Number(editingPlan.priceMinor),
                    maxStaff: Number(editingPlan.maxStaff),
                    maxMenuItems: Number(editingPlan.maxMenuItems),
                    maxTables: Number(editingPlan.maxTables),
                  })
                }
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                Save Plan Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Subscriptions Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
          <Store className="w-5 h-5 text-amber-600" />
          Tenant Subscription Directory & Plan Assignment
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="py-3 px-3">Restaurant</th>
                <th className="py-3 px-3">Current Plan</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Resource Usage</th>
                <th className="py-3 px-3">Trial / Period Ends</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenantItems.map((item) => (
                <tr key={item.restaurant.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">
                      {item.restaurant.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      /{item.restaurant.slug}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">
                      {item.subscription.planName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatMoneyMinor(
                        item.subscription.priceMinor,
                        item.subscription.currency
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                      {item.subscription.status}
                    </span>
                    {item.overLimit.any && (
                      <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" />
                        Over Limit
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-600">
                    <div>
                      Staff: {item.usage.totalStaffSeatsUsed}/
                      {item.limits.maxStaff}
                    </div>
                    <div>
                      Menu: {item.usage.menuItems}/{item.limits.maxMenuItems}
                    </div>
                    <div>
                      Tables: {item.usage.tables}/{item.limits.maxTables}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-600">
                    {item.subscription.status === "TRIALING" &&
                    item.subscription.trialEndsAt
                      ? `Trial ends ${new Date(
                          item.subscription.trialEndsAt
                        ).toLocaleDateString()} (${
                          item.subscription.trialRemainingDays
                        }d)`
                      : item.subscription.currentPeriodEnd
                        ? new Date(
                            item.subscription.currentPeriodEnd
                          ).toLocaleDateString()
                        : "—"}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => {
                        setAssigningTenant(item);
                        setAssignForm({
                          planId: item.subscription.planId,
                          status: item.subscription.status,
                          trialDays: 14,
                          recordManualInvoicePaid: false,
                          notes: "",
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                    >
                      Manage Plan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage Tenant Subscription Modal */}
      {assigningTenant && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAssignSubscription}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-slate-900">
              Manage Subscription — {assigningTenant.restaurant.name}
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Select Plan</label>
                <select
                  value={assignForm.planId}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, planId: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {plans
                    .filter((p) => !p.isArchived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (
                        {formatMoneyMinor(p.priceMinor, p.currency)}/
                        {p.billingInterval})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">
                  Subscription Status
                </label>
                <select
                  value={assignForm.status}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, status: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {[
                    "TRIALING",
                    "ACTIVE",
                    "PAST_DUE",
                    "CANCELLED",
                    "EXPIRED",
                  ].map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              {assignForm.status === "TRIALING" && (
                <div>
                  <label className="font-bold block mb-1">
                    Trial Duration (Days from Server Now)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={assignForm.trialDays}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        trialDays: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
              )}
              {assignForm.status === "ACTIVE" && (
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={assignForm.recordManualInvoicePaid}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        recordManualInvoicePaid: e.target.checked,
                      })
                    }
                  />
                  Record verified manual PAID invoice
                </label>
              )}
              <div>
                <label className="font-bold block mb-1">Audit Reason</label>
                <input
                  value={assignForm.notes}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, notes: e.target.value })
                  }
                  placeholder="Optional reason for audit log"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setAssigningTenant(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                Apply Subscription
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
