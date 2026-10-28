"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  Copy,
  Check,
  Calendar,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditLogItem {
  id: string;
  restaurantId: string | null;
  actor: {
    id: string | null;
    email: string | null;
    name: string | null;
    role: string | null;
    avatarUrl: string | null;
  };
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

interface ClientAuditLogsProps {
  restaurantName: string;
  currentRole: string;
  canExport: boolean;
}

export function ClientAuditLogs({
  restaurantName,
  currentRole,
  canExport,
}: ClientAuditLogsProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filter States
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "SUCCESS" | "FAILURE" | "DENIED">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Drawer detail state
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedMetadata, setCopiedMetadata] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "20");

      if (search.trim()) params.set("search", search.trim());
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (resourceFilter !== "ALL") params.set("resourceType", resourceFilter);
      if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/v1/audit-logs?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load audit logs");
      }

      const data = await res.json();
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading audit records";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, search, actionFilter, resourceFilter, outcomeFilter, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle Export CSV
  const handleExportCsv = async () => {
    if (!canExport || exporting) return;
    setExporting(true);
    setExportNotice(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (resourceFilter !== "ALL") params.set("resourceType", resourceFilter);
      if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/v1/audit-logs/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export audit logs");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportNotice("Audit logs exported successfully as CSV.");
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setExportNotice(`Export error: ${msg}`);
      setTimeout(() => setExportNotice(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text: string, type: "id" | "meta") => {
    navigator.clipboard.writeText(text);
    if (type === "id") {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedMetadata(true);
      setTimeout(() => setCopiedMetadata(false), 2000);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setActionFilter("ALL");
    setResourceFilter("ALL");
    setOutcomeFilter("ALL");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // Outcome Badge
  const renderOutcomeBadge = (outcome: "SUCCESS" | "FAILURE" | "DENIED") => {
    if (outcome === "SUCCESS") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Success
        </span>
      );
    }
    if (outcome === "DENIED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Lock className="w-3 h-3 text-amber-600" /> Denied
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
        <XCircle className="w-3 h-3 text-rose-600" /> Failure
      </span>
    );
  };

  // Action Badge styling
  const renderActionBadge = (action: string) => {
    let color = "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200";
    if (action.startsWith("AUTH_")) {
      color = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
    } else if (action.startsWith("STAFF_") || action.includes("ROLE")) {
      color = "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
    } else if (action.startsWith("ORDER_")) {
      color = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    } else if (action.startsWith("PAYMENT_") || action.startsWith("RECEIPT_")) {
      color = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    } else if (action.includes("SETTINGS")) {
      color = "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
    } else if (action.includes("EXPORT")) {
      color = "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300";
    }

    return (
      <span className={`px-2 py-0.5 rounded font-mono text-xs font-medium ${color}`}>
        {action}
      </span>
    );
  };

  // KPI Calculations
  const successCount = logs.filter((l) => l.outcome === "SUCCESS").length;
  const deniedCount = logs.filter((l) => l.outcome === "DENIED" || l.outcome === "FAILURE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Audit Logs & Security
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
              Append-Only
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Immutable security and operational event trail for{" "}
            <span className="font-semibold text-foreground">{restaurantName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canExport && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting || loading}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          )}
        </div>
      </div>

      {/* Export notification banner */}
      {exportNotice && (
        <div className="p-3 bg-muted rounded-lg text-sm border flex items-center justify-between animate-fade-in">
          <span>{exportNotice}</span>
          <button
            onClick={() => setExportNotice(null)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Logged Events</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {totalCount.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Page contains {logs.length} records</p>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Successful Operations</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {successCount}
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Normal system activity</p>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Denied / Security Warnings</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {deniedCount}
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Access denials & rate blocks</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl border bg-card shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search action, actor, resource, or IP..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Actions</option>
              <option value="AUTH_LOGIN_SUCCESS">Login Success</option>
              <option value="AUTH_LOGIN_FAILED">Login Failed</option>
              <option value="AUTH_LOGOUT">Logout</option>
              <option value="STAFF_INVITED">Staff Invited</option>
              <option value="ROLE_CHANGED">Role Changed</option>
              <option value="STAFF_DISABLED">Staff Disabled</option>
              <option value="RESTAURANT_SETTINGS_UPDATED">Settings Updated</option>
              <option value="MENU_ITEM_CREATED">Menu Item Created</option>
              <option value="MENU_ITEM_UPDATED">Menu Item Updated</option>
              <option value="MENU_ITEM_DELETED">Menu Item Deleted</option>
              <option value="ORDER_STATUS_UPDATED">Order Status Changed</option>
              <option value="PAYMENT_CAPTURED">Payment Captured</option>
              <option value="REFUND_ISSUED">Refund Issued</option>
              <option value="RECEIPT_ISSUED">Receipt Issued</option>
              <option value="RECEIPT_RESENT">Receipt Resent</option>
              <option value="DATA_EXPORTED">Data Exported</option>
              <option value="RATE_LIMIT_EXCEEDED">Rate Limit Exceeded</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div>
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Outcomes</option>
              <option value="SUCCESS">Success Only</option>
              <option value="FAILURE">Failure Only</option>
              <option value="DENIED">Denied Only</option>
            </select>
          </div>

          {/* Date Picker Range */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              title="From Date"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              title="To Date"
            />
          </div>
        </div>

        {/* Clear Filters Helper */}
        {(search || actionFilter !== "ALL" || resourceFilter !== "ALL" || outcomeFilter !== "ALL" || startDate || endDate) && (
          <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
            <span>Filtering active</span>
            <button
              onClick={resetFilters}
              className="text-primary hover:underline font-medium"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading audit records...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => fetchLogs()}>
              Retry
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <h3 className="text-base font-semibold text-foreground">No Audit Records Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No audit records matched your active filter criteria. Try adjusting filters or searching a different keyword.
            </p>
            <Button size="sm" variant="outline" onClick={resetFilters}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Client IP</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span>
                          {new Date(log.createdAt).toLocaleDateString()}{" "}
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                          {log.actor.name ? log.actor.name.charAt(0) : "S"}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground leading-tight">
                            {log.actor.name || "System"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {log.actor.role || "SYSTEM"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderActionBadge(log.action)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-xs text-foreground">
                      <span className="font-semibold text-muted-foreground text-[11px] uppercase mr-1">
                        [{log.resourceType}]
                      </span>
                      {log.resourceName || log.resourceId || "—"}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderOutcomeBadge(log.outcome)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {log.ipAddress || "—"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing page {page} of {totalPages} ({totalCount} total events)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-7 px-2 text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-7 px-2 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Over Detail Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-xl bg-background border-l shadow-2xl h-full flex flex-col overflow-hidden animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b flex items-center justify-between bg-muted/30">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Audit Event Details</h3>
                  {renderOutcomeBadge(selectedLog.outcome)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Immutable event record #{selectedLog.id.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-6">
              {/* Event Summary Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                    Action
                  </span>
                  <div className="mt-1">{renderActionBadge(selectedLog.action)}</div>
                </div>

                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                    Timestamp (UTC)
                  </span>
                  <span className="font-mono text-foreground mt-1 block">
                    {new Date(selectedLog.createdAt).toISOString()}
                  </span>
                </div>

                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                    Actor
                  </span>
                  <span className="font-semibold text-foreground mt-1 block">
                    {selectedLog.actor.name || "System"} ({selectedLog.actor.role || "SYSTEM"})
                  </span>
                  <span className="text-muted-foreground block text-[11px]">
                    {selectedLog.actor.email || "No email"}
                  </span>
                </div>

                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-muted-foreground block text-[11px] uppercase font-semibold">
                    Client Context
                  </span>
                  <span className="font-mono text-foreground mt-1 block">
                    IP: {selectedLog.ipAddress || "127.0.0.1"}
                  </span>
                  <span className="text-muted-foreground block text-[10px] truncate" title={selectedLog.userAgent || ""}>
                    UA: {selectedLog.userAgent || "Unknown"}
                  </span>
                </div>
              </div>

              {/* Resource Target */}
              <div className="p-4 rounded-lg border bg-card">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Target Resource
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px]">Type:</span>{" "}
                    <span className="font-semibold text-foreground">{selectedLog.resourceType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Name:</span>{" "}
                    <span className="font-semibold text-foreground">{selectedLog.resourceName || "—"}</span>
                  </div>
                  {selectedLog.resourceId && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-[11px]">ID:</span>{" "}
                      <span className="font-mono text-[11px] text-foreground">{selectedLog.resourceId}</span>
                    </div>
                  )}
                  {selectedLog.reason && (
                    <div className="col-span-2 mt-1 p-2 rounded bg-destructive/10 text-destructive text-xs">
                      <span className="font-bold">Failure / Denial Reason:</span> {selectedLog.reason}
                    </div>
                  )}
                </div>
              </div>

              {/* Safe Metadata JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Safe Metadata & Diff
                  </h4>
                  {selectedLog.metadata && (
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedLog.metadata, null, 2), "meta")}
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      {copiedMetadata ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy JSON
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="p-3 rounded-lg border bg-stone-900 text-stone-100 font-mono text-xs overflow-x-auto max-h-72">
                  {selectedLog.metadata ? (
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-stone-400 italic">No extra metadata recorded for this event.</span>
                  )}
                </div>
              </div>

              {/* Technical Identifiers */}
              <div className="text-[11px] text-muted-foreground space-y-1 font-mono pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span>Event ID: {selectedLog.id}</span>
                  <button
                    onClick={() => copyToClipboard(selectedLog.id, "id")}
                    className="text-primary hover:underline flex items-center gap-0.5"
                  >
                    {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                {selectedLog.requestId && <div>Correlation ID: {selectedLog.requestId}</div>}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t bg-muted/20 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
