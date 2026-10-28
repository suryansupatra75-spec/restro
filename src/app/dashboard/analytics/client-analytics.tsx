"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Download, 
  RefreshCw, 
  Calendar, 
  DollarSign, 
  ShoppingCart, 
  CheckCircle2, 
  XCircle, 
  Users, 
  Boxes, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Layers,
  HelpCircle,
  Table as TableIcon
} from "lucide-react";
import { AnalyticsSummary, AnalyticsTrendPoint } from "@/lib/analytics/service";
import { hasPermission, StaffRole } from "@/lib/permissions";

interface ClientAnalyticsProps {
  restaurantId: string;
  role: StaffRole;
  currency: string;
}

export function ClientAnalytics({ restaurantId, role, currency }: ClientAnalyticsProps) {
  const [period, setPeriod] = useState<string>("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  const [trendMetric, setTrendMetric] = useState<"sales" | "orders">("sales");
  const [showDataTable, setShowDataTable] = useState<boolean>(false);
  const [activeTooltip, setActiveTooltip] = useState<AnalyticsTrendPoint | null>(null);

  const canExport = hasPermission(role, "analytics.export");

  const formatCurrency = useCallback(
    (amt: number) => {
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency || "USD",
          minimumFractionDigits: 2,
        }).format(amt);
      } catch {
        return `$${amt.toFixed(2)}`;
      }
    },
    [currency]
  );

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("restaurantId", restaurantId);
      params.set("period", period);

      if (period === "custom" && appliedCustom) {
        params.set("startDate", appliedCustom.start);
        params.set("endDate", appliedCustom.end);
      }

      const res = await fetch(`/api/v1/analytics?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load analytics");
      }

      setSummary(data.data);
    } catch (err: any) {
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, period, appliedCustom]);

  useEffect(() => {
    if (period !== "custom" || appliedCustom) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, period, appliedCustom]);

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      setError("Please select both a start date and an end date.");
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      setError("Start date cannot be after end date.");
      return;
    }
    setAppliedCustom({ start: customStart, end: customEnd });
  };

  const handleExportCsv = async () => {
    if (!canExport || exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("restaurantId", restaurantId);
      params.set("period", period);

      if (period === "custom" && appliedCustom) {
        params.set("startDate", appliedCustom.start);
        params.set("endDate", appliedCustom.end);
      }

      const res = await fetch(`/api/v1/analytics/export?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate CSV export");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics_report_${period}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  // Render KPI Card helper
  const renderKpiCard = (
    title: string,
    value: string,
    changePct: number | null,
    subtext: string,
    icon: React.ReactNode,
    colorClass: string
  ) => {
    const isPositive = changePct !== null && changePct > 0;
    const isNegative = changePct !== null && changePct < 0;

    return (
      <div className="bg-surface border border-border rounded-xl p-5 shadow-xs hover:border-border/80 transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <h3 className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {value}
            </h3>
          </div>
          <div className={`p-2.5 rounded-lg ${colorClass}`}>{icon}</div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{subtext}</span>
          {changePct !== null && (
            <span
              className={`inline-flex items-center font-medium gap-0.5 px-1.5 py-0.5 rounded-md ${
                isPositive
                  ? "bg-green-50 text-green-700"
                  : isNegative
                  ? "bg-red-50 text-red-700"
                  : "bg-surface-muted text-muted-foreground"
              }`}
            >
              {isPositive && <ArrowUpRight className="w-3 h-3" />}
              {isNegative && <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(changePct)}%
            </span>
          )}
        </div>
      </div>
    );
  };

  // Compute maximum value for trend scaling
  const maxTrendValue = summary?.trends.reduce(
    (max, pt) => Math.max(max, trendMetric === "sales" ? pt.sales : pt.orderCount),
    1
  ) || 1;

  return (
    <div className="space-y-6">
      {/* Top Header & Range Controls */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Analytics & Reports
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Comprehensive business performance, sales trends, and operational insights.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-muted transition-colors disabled:opacity-50 text-foreground cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            {canExport && (
              <button
                onClick={handleExportCsv}
                disabled={exporting || loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            )}
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center gap-1.5">
          {[
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "7d", label: "Last 7 Days" },
            { id: "30d", label: "Last 30 Days" },
            { id: "this_month", label: "This Month" },
            { id: "prev_month", label: "Previous Month" },
            { id: "custom", label: "Custom Range" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setPeriod(item.id);
                if (item.id !== "custom") setAppliedCustom(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                period === item.id
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground hover:bg-surface-muted/80"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Custom Range Selector */}
        {period === "custom" && (
          <form
            onSubmit={handleApplyCustom}
            className="mt-3 p-3 bg-surface-muted rounded-lg flex flex-wrap items-center gap-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">From:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-md border border-border bg-surface text-foreground font-sans focus:outline-hidden focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-md border border-border bg-surface text-foreground font-sans focus:outline-hidden focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Apply Dates
            </button>
          </form>
        )}

        {/* Freshness Indicator */}
        {summary && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Selected Period: {summary.dateRangeLabel} ({summary.startDate} to {summary.endDate})
            </span>
            <span>
              Updated: {new Date(summary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchAnalytics}
            className="underline font-medium hover:text-red-900 cursor-pointer ml-3 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-surface border border-border rounded-xl p-4" />
            ))}
          </div>
          <div className="h-72 bg-surface border border-border rounded-xl" />
        </div>
      )}

      {/* Main Content */}
      {!loading && summary && (
        <>
          {/* Executive KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderKpiCard(
              "Gross Sales",
              formatCurrency(summary.kpis.grossSales),
              summary.comparison.grossSalesChangePct,
              `vs. prev ${summary.comparison.previousPeriodLabel}`,
              <DollarSign className="w-5 h-5 text-emerald-600" />,
              "bg-emerald-50 text-emerald-600"
            )}

            {renderKpiCard(
              "Net Sales",
              formatCurrency(summary.kpis.netSales),
              null,
              `Excl. ${formatCurrency(summary.kpis.taxCollected)} tax`,
              <TrendingUp className="w-5 h-5 text-blue-600" />,
              "bg-blue-50 text-blue-600"
            )}

            {renderKpiCard(
              "Total Orders",
              summary.kpis.totalOrders.toLocaleString(),
              summary.comparison.totalOrdersChangePct,
              `${summary.kpis.completedOrders} completed`,
              <ShoppingCart className="w-5 h-5 text-primary" />,
              "bg-primary/10 text-primary"
            )}

            {renderKpiCard(
              "Average Order Value",
              formatCurrency(summary.kpis.aov),
              summary.comparison.aovChangePct,
              "Per placed order",
              <Layers className="w-5 h-5 text-purple-600" />,
              "bg-purple-50 text-purple-600"
            )}
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Paid Revenue Captured
                </p>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {formatCurrency(summary.kpis.paidRevenue)}
                </p>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Cancelled / Rejected
                </p>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {summary.kpis.cancelledOrders}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (
                    {summary.kpis.totalOrders > 0
                      ? Math.round((summary.kpis.cancelledOrders / summary.kpis.totalOrders) * 100)
                      : 0}
                    %)
                  </span>
                </p>
              </div>
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <XCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Orders In-Progress
                </p>
                <p className="text-xl font-bold text-foreground mt-0.5">
                  {summary.kpis.inProgressOrders}
                </p>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Sales & Orders Trend Section */}
          <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Performance Trend Over Time
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Visual volume and revenue distribution across continuous intervals.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Metric switch */}
                <div className="bg-surface-muted p-0.5 rounded-lg border border-border flex items-center text-xs">
                  <button
                    onClick={() => setTrendMetric("sales")}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      trendMetric === "sales"
                        ? "bg-surface text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sales ($)
                  </button>
                  <button
                    onClick={() => setTrendMetric("orders")}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      trendMetric === "orders"
                        ? "bg-surface text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Orders (Qty)
                  </button>
                </div>

                {/* Data table view toggle */}
                <button
                  onClick={() => setShowDataTable(!showDataTable)}
                  className={`p-1.5 rounded-lg border border-border cursor-pointer transition-colors ${
                    showDataTable
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface text-muted-foreground hover:bg-surface-muted"
                  }`}
                  title="Toggle accessible table view"
                >
                  <TableIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Trend Chart */}
            {!showDataTable && summary.trends.length > 0 && (
              <div className="space-y-3">
                <div className="h-64 flex items-end gap-1.5 sm:gap-2 pt-6 px-1 border-b border-border">
                  {summary.trends.map((pt, idx) => {
                    const value = trendMetric === "sales" ? pt.sales : pt.orderCount;
                    const heightPct = Math.max(4, Math.round((value / maxTrendValue) * 100));

                    return (
                      <div
                        key={pt.key || idx}
                        className="flex-1 flex flex-col items-center h-full justify-end group relative"
                        onMouseEnter={() => setActiveTooltip(pt)}
                        onMouseLeave={() => setActiveTooltip(null)}
                      >
                        {/* Interactive Bar */}
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t-sm transition-all duration-300 ${
                            value > 0
                              ? "bg-primary hover:bg-primary/80"
                              : "bg-surface-muted hover:bg-border"
                          }`}
                        />

                        {/* Hover Tooltip */}
                        {activeTooltip?.key === pt.key && (
                          <div className="absolute bottom-full mb-2 z-20 bg-neutral-900 text-white text-xs rounded-lg p-2.5 shadow-lg whitespace-nowrap pointer-events-none">
                            <p className="font-semibold text-neutral-200">{pt.label}</p>
                            <p className="text-primary font-bold mt-0.5">
                              Sales: {formatCurrency(pt.sales)}
                            </p>
                            <p className="text-neutral-300">Orders: {pt.orderCount}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* X Axis Labels */}
                <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground px-1 overflow-hidden">
                  <span>{summary.trends[0]?.label}</span>
                  {summary.trends.length > 4 && (
                    <span>{summary.trends[Math.floor(summary.trends.length / 2)]?.label}</span>
                  )}
                  <span>{summary.trends[summary.trends.length - 1]?.label}</span>
                </div>
              </div>
            )}

            {/* Accessible Data Table View */}
            {showDataTable && (
              <div className="overflow-x-auto max-h-72 border border-border rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-muted border-b border-border text-muted-foreground sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Period / Time</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Orders Placed</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Gross Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.trends.map((pt, i) => (
                      <tr key={i} className="hover:bg-surface-muted/50">
                        <td className="py-2 px-3 font-medium text-foreground">{pt.label}</td>
                        <td className="py-2 px-3 text-right">{pt.orderCount}</td>
                        <td className="py-2 px-3 text-right font-semibold text-foreground">
                          {formatCurrency(pt.sales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Breakdown Grid: Order Lifecycle & Payment Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Order Lifecycle Status */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Orders by Lifecycle Status
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                Distribution of order volume across fulfillment stages.
              </p>

              {summary.orderLifecycle.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No orders in this period.</p>
              ) : (
                <div className="space-y-3">
                  {summary.orderLifecycle.map((item) => (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{item.status}</span>
                        <span className="text-muted-foreground">
                          {item.count} orders ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-surface-muted h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${item.percentage}%` }}
                          className={`h-full rounded-full ${
                            item.status === "COMPLETED"
                              ? "bg-green-500"
                              : item.status === "CANCELLED"
                              ? "bg-red-500"
                              : "bg-blue-500"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment Method & Status Breakdown */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Payment Settlement Breakdown
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                Verified settlements and payment processing states.
              </p>

              <div className="space-y-3">
                {summary.paymentBreakdown.map((pay) => (
                  <div
                    key={pay.status}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-muted/50 border border-border/50 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          pay.status === "PAID"
                            ? "bg-green-500"
                            : pay.status === "REFUNDED"
                            ? "bg-purple-500"
                            : pay.status === "FAILED"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                        }`}
                      />
                      <span className="font-semibold text-foreground">{pay.status}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-foreground">{formatCurrency(pay.amount)}</span>
                      <span className="text-muted-foreground ml-2">({pay.count} txns)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Selling Menu Items */}
          <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Top Selling Menu Items
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Best performing dishes by persisted order quantity and total sales.
            </p>

            {summary.topItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                No menu items sold in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-muted border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Rank</th>
                      <th className="py-2.5 px-3 font-semibold">Item Name</th>
                      <th className="py-2.5 px-3 font-semibold">Category</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Quantity Sold</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total Revenue</th>
                      <th className="py-2.5 px-3 font-semibold text-right">% of Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.topItems.map((item, idx) => {
                      const sharePct =
                        summary.kpis.grossSales > 0
                          ? Math.round((item.totalRevenue / summary.kpis.grossSales) * 100)
                          : 0;

                      return (
                        <tr key={item.name} className="hover:bg-surface-muted/50">
                          <td className="py-2.5 px-3 font-bold text-muted-foreground">
                            #{idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {item.categoryName}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            {item.quantitySold}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            {formatCurrency(item.totalRevenue)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            {sharePct}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Operational Insights: Customers & Inventory */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Customer Insights */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Customer Engagement & CRM
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                Aggregate, privacy-preserving patron order metrics.
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-surface-muted rounded-lg">
                  <p className="text-muted-foreground font-medium">Unique Patrons</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                    {summary.customerInsights.uniqueCustomers}
                  </p>
                </div>
                <div className="p-3 bg-surface-muted rounded-lg">
                  <p className="text-muted-foreground font-medium">New Customers</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                    {summary.customerInsights.newCustomers}
                  </p>
                </div>
                <div className="p-3 bg-surface-muted rounded-lg">
                  <p className="text-muted-foreground font-medium">Returning Patrons</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                    {summary.customerInsights.returningCustomers}
                  </p>
                </div>
                <div className="p-3 bg-surface-muted rounded-lg">
                  <p className="text-muted-foreground font-medium">Repeat Order Rate</p>
                  <p className="text-xl font-bold text-primary mt-1">
                    {summary.customerInsights.repeatOrderRate}%
                  </p>
                </div>
              </div>
            </div>

            {/* Inventory Snapshot */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Boxes className="w-4 h-4 text-purple-600" />
                Inventory Operations
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                Real-time stock alerts and period movement summaries.
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-yellow-50/50 border border-yellow-200/50 rounded-lg">
                  <p className="text-yellow-800 font-medium">Low Stock Items</p>
                  <p className="text-xl font-bold text-yellow-900 mt-1">
                    {summary.inventorySnapshot.lowStockCount}
                  </p>
                </div>
                <div className="p-3 bg-red-50/50 border border-red-200/50 rounded-lg">
                  <p className="text-red-800 font-medium">Out of Stock</p>
                  <p className="text-xl font-bold text-red-900 mt-1">
                    {summary.inventorySnapshot.outOfStockCount}
                  </p>
                </div>
                <div className="p-3 bg-surface-muted rounded-lg">
                  <p className="text-muted-foreground font-medium">Stock Received</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                    +{summary.inventorySnapshot.receivedQuantity}
                  </p>
                </div>
                <div className="p-3 bg-surface-muted rounded-lg">
                  <p className="text-muted-foreground font-medium">Waste Recorded</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                    -{summary.inventorySnapshot.wasteQuantity}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
