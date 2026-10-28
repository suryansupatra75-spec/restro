"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileSearch,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
  };
}

export function SuperAdminAuditLogsClient() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        search: searchQuery,
        targetType: targetTypeFilter,
        page: String(page),
        limit: "20",
      });
      const res = await fetch(
        `/api/v1/super-admin/audit-logs?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load audit logs");
      }
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load audit logs"
      );
    } finally {
      setLoading(false);
    }
  }, [searchQuery, targetTypeFilter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Platform Audit Logs
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Immutable read-only audit log of all sensitive Super Admin actions across restaurants and users.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search & Target Type Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by actor email, target name, action, or reason..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition shrink-0"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition shrink-0"
            >
              Clear
            </button>
          )}
        </form>

        <select
          value={targetTypeFilter}
          onChange={(e) => {
            setTargetTypeFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by target type"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
        >
          <option value="ALL">All Target Types</option>
          <option value="RESTAURANT">Restaurants</option>
          <option value="USER">Users</option>
          <option value="SYSTEM">System</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          {error}
        </div>
      )}

      {/* Logs List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading && !data ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading platform audit logs...
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="p-10 text-center">
            <FileSearch className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="font-bold text-slate-800">
              No matching audit log entries
            </p>
            <p className="text-xs text-slate-500 mt-1">
              All sensitive restaurant and user status transitions will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {data.logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold px-2.5 py-0.5 rounded-md bg-slate-900 text-amber-300">
                        {log.action}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                        {log.targetType}
                      </span>
                      {log.targetType === "RESTAURANT" ? (
                        <Link
                          href={`/super-admin/restaurants/${log.targetId}`}
                          className="font-bold text-slate-900 hover:text-amber-700 underline"
                        >
                          {log.targetLabel || log.targetId}
                        </Link>
                      ) : log.targetType === "USER" ? (
                        <Link
                          href={`/super-admin/users/${log.targetId}`}
                          className="font-bold text-slate-900 hover:text-amber-700 underline"
                        >
                          {log.targetLabel || log.targetId}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-800">
                          {log.targetLabel || log.targetId}
                        </span>
                      )}
                    </div>

                    {log.reason && (
                      <p className="text-slate-600">
                        <strong>Reason:</strong> {log.reason}
                      </p>
                    )}

                    {log.metadata && (
                      <p className="font-mono text-[11px] text-slate-500 truncate">
                        Metadata: {JSON.stringify(log.metadata)}
                      </p>
                    )}
                  </div>

                  <div className="text-slate-500 sm:text-right shrink-0">
                    <p className="font-semibold text-slate-800">
                      Actor: {log.actorEmail}
                    </p>
                    <p>{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
              <span>
                Showing page <strong>{data.pagination.page}</strong> of{" "}
                <strong>{data.pagination.totalPages}</strong> (
                {data.pagination.total} entries)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  type="button"
                  disabled={page >= data.pagination.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 disabled:opacity-40"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
