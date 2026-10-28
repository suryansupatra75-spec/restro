"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  FileText,
  Sparkles,
  Lock,
  XCircle,
  Users,
  UtensilsCrossed,
  Grid2X2,
} from "lucide-react";

interface ClientBillingProps {
  restaurantId: string;
  restaurantName: string;
  role: string;
}

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

export function ClientBilling({
  restaurantId,
  restaurantName,
  role,
}: ClientBillingProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const fetchBilling = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/billing", {
        headers: { "x-restaurant-id": restaurantId },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load billing information");
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || "Unable to load billing information");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const handlePlanAction = async (
    planId: string,
    action: "START_TRIAL" | "CREATE_CHECKOUT"
  ) => {
    try {
      setActionLoading(`${action}_${planId}`);
      setBanner(null);
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-restaurant-id": restaurantId,
        },
        body: JSON.stringify({ planId, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to process plan request");
      }

      if (json.mode === "TRIAL_UPDATED") {
        setBanner({
          type: "success",
          text: `Trial plan switched to ${json.subscription.planNameSnapshot}. Limits and entitlements updated immediately.`,
        });
      } else if (json.checkoutSession) {
        setBanner({
          type: "info",
          text: json.checkoutSession.isSandbox
            ? `Pending invoice created (${json.invoice.invoiceNumber}). ${json.checkoutSession.notice}`
            : `Checkout order ${json.checkoutSession.providerOrderId} initialized. Subscription activates after verified webhook confirmation.`,
        });
      }

      await fetchBilling();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err.message || "Failed to process plan selection",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSubscription = async (immediate: boolean) => {
    try {
      setActionLoading(immediate ? "CANCEL_NOW" : "CANCEL_PERIOD_END");
      setBanner(null);
      const res = await fetch("/api/v1/billing/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-restaurant-id": restaurantId,
        },
        body: JSON.stringify({
          immediate,
          reason: "Requested from restaurant dashboard billing settings",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to cancel subscription");
      }
      setBanner({
        type: "info",
        text: immediate
          ? "Your subscription has been cancelled. Existing restaurant data remains safe."
          : "Cancellation scheduled for the end of your current billing period.",
      });
      await fetchBilling();
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err.message || "Cancellation request failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="h-24 rounded-2xl bg-stone-100 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-44 rounded-2xl bg-stone-100 animate-pulse" />
          <div className="h-44 rounded-2xl bg-stone-100 animate-pulse" />
          <div className="h-44 rounded-2xl bg-stone-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <div className="flex items-center gap-3 font-bold text-lg mb-2">
            <ShieldAlert className="w-6 h-6 text-red-600" />
            Unable to Load Billing
          </div>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchBilling}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { entitlements, availablePlans, invoices, canManageBilling } = data;
  const { subscription, limits, usage, overLimit, features, providerConfig } =
    entitlements;

  const statusBadgeColor: Record<string, string> = {
    TRIALING: "bg-blue-100 text-blue-800 border-blue-200",
    ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    PAST_DUE: "bg-amber-100 text-amber-800 border-amber-200",
    CANCELLED: "bg-stone-200 text-stone-800 border-stone-300",
    EXPIRED: "bg-red-100 text-red-800 border-red-200",
    INCOMPLETE: "bg-purple-100 text-purple-800 border-purple-200",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-600 mb-1">
            <CreditCard className="w-4 h-4" />
            SaaS Subscription & Plan Entitlements
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
            Billing & Plan — {restaurantName}
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Manage your platform subscription, monitor plan usage limits, and
            view verified SaaS billing invoices.
          </p>
        </div>
        <button
          onClick={fetchBilling}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 text-xs font-bold hover:bg-stone-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Status
        </button>
      </div>

      {/* Provider Mode Notice */}
      <div
        className={`rounded-2xl border p-4 flex items-start gap-3 ${
          providerConfig.isSandbox
            ? "bg-amber-50/80 border-amber-200 text-amber-900"
            : "bg-emerald-50/80 border-emerald-200 text-emerald-900"
        }`}
      >
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
        <div className="text-xs sm:text-sm">
          <span className="font-bold">
            Billing Provider Mode:{" "}
            {providerConfig.isSandbox
              ? "SANDBOX / TEST MODE"
              : "LIVE RAZORPAY CONFIGURED"}
          </span>{" "}
          —{" "}
          {providerConfig.isSandbox
            ? "Live SaaS payment credentials are not configured on this environment. Checkout sessions create persisted OPEN/PENDING invoices in sandbox mode without charging real money."
            : "Live Razorpay billing is active. Subscriptions activate only after verified webhook confirmation."}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : banner.type === "error"
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-xs font-bold underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Expired / Cancelled / Past Due Alert */}
      {(subscription.status === "EXPIRED" ||
        subscription.status === "CANCELLED" ||
        subscription.status === "PAST_DUE") && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
          <div className="flex items-center gap-2 font-bold text-base mb-1">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            Subscription Status: {subscription.status}
          </div>
          <p className="text-sm text-red-800">
            {subscription.status === "PAST_DUE"
              ? "Your subscription payment is past due. Existing restaurant data and read-only reporting remain accessible during the grace period, but creating new staff, menu items, or tables is paused until payment is resolved."
              : "Your subscription is currently inactive. None of your existing menu items, tables, staff, orders, or customer records have been deleted, and Billing remains accessible at all times. Select a plan below to restore full access."}
          </p>
        </div>
      )}

      {/* Over-Limit Warning */}
      {overLimit.any && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-center gap-2 font-bold text-base mb-1">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Plan Limit Exceeded (Existing Data Preserved)
          </div>
          <p className="text-sm text-amber-800">
            Your restaurant currently exceeds one or more limits of your{" "}
            <strong>{subscription.planName}</strong> plan. Existing records are
            never deleted, but creating new items in over-limit categories is
            blocked server-side until you upgrade your plan.
          </p>
        </div>
      )}

      {/* Current Subscription Overview & Usage Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Plan Card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Current Plan
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  statusBadgeColor[subscription.status] ||
                  "bg-stone-100 text-stone-700"
                }`}
              >
                {subscription.status}
              </span>
            </div>
            <h2 className="text-2xl font-black text-stone-900">
              {subscription.planName}
            </h2>
            <p className="text-lg font-bold text-orange-600 mt-1">
              {formatMoneyMinor(subscription.priceMinor, subscription.currency)}{" "}
              <span className="text-xs font-normal text-stone-500">
                / {subscription.billingInterval === "YEARLY" ? "year" : "month"}
              </span>
            </p>

            <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-xs text-stone-600">
              {subscription.status === "TRIALING" && subscription.trialEndsAt && (
                <div className="flex items-center justify-between text-blue-700 font-semibold bg-blue-50 px-3 py-2 rounded-xl">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Trial Remaining:
                  </span>
                  <span>
                    {subscription.trialRemainingDays}d (
                    {subscription.trialRemainingHours}h)
                  </span>
                </div>
              )}
              {subscription.trialEndsAt && (
                <div className="flex justify-between">
                  <span>Trial Ends:</span>
                  <span className="font-semibold text-stone-900">
                    {new Date(subscription.trialEndsAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              {subscription.currentPeriodEnd && (
                <div className="flex justify-between">
                  <span>
                    {subscription.status === "ACTIVE" &&
                    !subscription.cancelAtPeriodEnd
                      ? "Next Renewal:"
                      : "Current Period Ends:"}
                  </span>
                  <span className="font-semibold text-stone-900">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
              )}
              {subscription.cancelAtPeriodEnd && (
                <div className="text-amber-700 font-semibold">
                  Scheduled to cancel at period end
                </div>
              )}
            </div>
          </div>

          {canManageBilling &&
            (subscription.status === "TRIALING" ||
              subscription.status === "ACTIVE") && (
              <div className="mt-6 pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                {subscription.status === "ACTIVE" &&
                  !subscription.cancelAtPeriodEnd && (
                    <button
                      onClick={() => handleCancelSubscription(false)}
                      disabled={Boolean(actionLoading)}
                      className="px-3 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-50 disabled:opacity-50"
                    >
                      Cancel at Period End
                    </button>
                  )}
                <button
                  onClick={() => handleCancelSubscription(true)}
                  disabled={Boolean(actionLoading)}
                  className="px-3 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel Immediately
                </button>
              </div>
            )}
        </div>

        {/* Numeric Limits & Current Usage */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Server-Enforced Plan Limits
          </div>

          {/* Staff Limit */}
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-stone-800 mb-1">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-stone-500" />
                Staff Seats (Active + Invited)
              </span>
              <span
                className={
                  usage.totalStaffSeatsUsed >= limits.maxStaff
                    ? "text-red-600"
                    : "text-stone-900"
                }
              >
                {usage.totalStaffSeatsUsed} / {limits.maxStaff}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  usage.totalStaffSeatsUsed >= limits.maxStaff
                    ? "bg-red-500"
                    : "bg-orange-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((usage.totalStaffSeatsUsed / limits.maxStaff) * 100)
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              {usage.activeStaff} active members, {usage.pendingInvitations}{" "}
              pending invitations
            </p>
          </div>

          {/* Menu Items Limit */}
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-stone-800 mb-1">
              <span className="flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4 text-stone-500" />
                Active Menu Items
              </span>
              <span
                className={
                  usage.menuItems >= limits.maxMenuItems
                    ? "text-red-600"
                    : "text-stone-900"
                }
              >
                {usage.menuItems} / {limits.maxMenuItems}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  usage.menuItems >= limits.maxMenuItems
                    ? "bg-red-500"
                    : "bg-emerald-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((usage.menuItems / limits.maxMenuItems) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Tables Limit */}
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-stone-800 mb-1">
              <span className="flex items-center gap-1.5">
                <Grid2X2 className="w-4 h-4 text-stone-500" />
                Active Tables & QR
              </span>
              <span
                className={
                  usage.tables >= limits.maxTables
                    ? "text-red-600"
                    : "text-stone-900"
                }
              >
                {usage.tables} / {limits.maxTables}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  usage.tables >= limits.maxTables
                    ? "bg-red-500"
                    : "bg-blue-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((usage.tables / limits.maxTables) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Feature Entitlements */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Included Module Entitlements
          </div>
          {[
            {
              label: "Analytics & Revenue Reports",
              enabled: features.analyticsEnabled,
            },
            {
              label: "Analytics CSV Data Export",
              enabled: features.analyticsExportEnabled,
            },
            {
              label: "Inventory & Recipe Deduction",
              enabled: features.inventoryEnabled,
            },
            {
              label: "Custom Branding & Theme Controls",
              enabled: features.customBrandingEnabled,
            },
          ].map((feat) => (
            <div
              key={feat.label}
              className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 text-sm"
            >
              <span className="text-stone-700 font-medium">{feat.label}</span>
              {feat.enabled ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Enabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full">
                  <Lock className="w-3.5 h-3.5" />
                  Locked
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Plan Catalogue */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <div>
            <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              Available Subscription Plans
            </h3>
            <p className="text-xs text-stone-500">
              {canManageBilling
                ? "Select a plan to switch your active trial or initiate a server-verified subscription checkout."
                : `You are viewing billing as ${role}. Only the Restaurant OWNER can change plans or initiate checkout.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {availablePlans.map((plan: any) => {
            const isCurrentPlan = plan.id === subscription.planId;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between ${
                  isCurrentPlan
                    ? "border-orange-500 bg-orange-50/30 ring-1 ring-orange-500"
                    : "border-stone-200 bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-black text-base text-stone-900">
                      {plan.name}
                    </span>
                    {isCurrentPlan && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-orange-600 text-white">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-black text-stone-900">
                    {formatMoneyMinor(plan.priceMinor, plan.currency)}
                    <span className="text-xs font-normal text-stone-500">
                      /{plan.billingInterval === "YEARLY" ? "yr" : "mo"}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-2 line-clamp-2">
                    {plan.description}
                  </p>

                  <ul className="mt-4 pt-3 border-t border-stone-100 space-y-1.5 text-xs text-stone-700">
                    <li>• Up to {plan.maxStaff} Staff Seats</li>
                    <li>• Up to {plan.maxMenuItems} Menu Items</li>
                    <li>• Up to {plan.maxTables} Tables & QR Codes</li>
                    <li>
                      • Analytics:{" "}
                      <strong>{plan.analyticsEnabled ? "Yes" : "No"}</strong>
                    </li>
                    <li>
                      • Inventory:{" "}
                      <strong>{plan.inventoryEnabled ? "Yes" : "No"}</strong>
                    </li>
                  </ul>
                </div>

                {canManageBilling && (
                  <div className="mt-5 pt-3 border-t border-stone-100 space-y-2">
                    {subscription.status === "TRIALING" && !isCurrentPlan && (
                      <button
                        onClick={() => handlePlanAction(plan.id, "START_TRIAL")}
                        disabled={Boolean(actionLoading)}
                        className="w-full py-2 px-3 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs font-bold hover:bg-stone-50 disabled:opacity-50"
                      >
                        Switch Trial to {plan.name}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        handlePlanAction(plan.id, "CREATE_CHECKOUT")
                      }
                      disabled={Boolean(actionLoading)}
                      className="w-full py-2 px-3 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 disabled:opacity-50"
                    >
                      {providerConfig.isSandbox
                        ? `Create Sandbox Checkout (${plan.name})`
                        : `Subscribe to ${plan.name}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verified SaaS Subscription Invoice History */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-stone-600" />
              Subscription Invoices & Payment History
            </h3>
            <p className="text-xs text-stone-500">
              Showing persisted SaaS subscription billing records only (strictly
              separate from restaurant food-order payments).
            </p>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="text-center py-8 text-sm text-stone-500 border border-dashed border-stone-200 rounded-xl">
            No SaaS subscription invoices have been generated for this
            restaurant yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase text-[11px]">
                  <th className="py-3 px-3">Invoice #</th>
                  <th className="py-3 px-3">Plan</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Invoice State</th>
                  <th className="py-3 px-3">Payment State</th>
                  <th className="py-3 px-3">Verification</th>
                  <th className="py-3 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-stone-50/70">
                    <td className="py-3 px-3 font-mono font-bold text-stone-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-stone-900">
                        {inv.planNameSnapshot}
                      </span>{" "}
                      <span className="text-xs text-stone-500">
                        ({inv.billingIntervalSnapshot})
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-stone-900">
                      {formatMoneyMinor(inv.amountMinor, inv.currency)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          inv.invoiceStatus === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : inv.invoiceStatus === "FAILED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.invoiceStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          inv.paymentStatus === "SUCCEEDED"
                            ? "bg-emerald-100 text-emerald-800"
                            : inv.paymentStatus === "FAILED"
                              ? "bg-red-100 text-red-800"
                              : "bg-stone-100 text-stone-700"
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-stone-600">
                      {inv.verifiedBySource || inv.provider}
                      {inv.failureReason && (
                        <div className="text-[11px] text-red-600">
                          {inv.failureReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-stone-500">
                      {new Date(inv.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
