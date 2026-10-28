"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  CheckCircle2,
  Ban,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface RestaurantDirectoryItem {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  suspendedReason: string | null;
  suspendedAt: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  isOrderingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isActive: boolean;
  } | null;
  counts: {
    orders: number;
    menuItems: number;
    tables: number;
    staff: number;
    customers: number;
  };
  paidRevenue: number;
}

interface RestaurantsResponse {
  restaurants: RestaurantDirectoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    active: number;
    suspended: number;
    inactive: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" /> Active
      </span>
    );
  }
  if (status === "SUSPENDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
        <Ban className="w-3.5 h-3.5" /> Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
      <AlertTriangle className="w-3.5 h-3.5" /> Inactive
    </span>
  );
}

export function SuperAdminRestaurantsClient() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [page, setPage] = useState<number>(1);
  const [data, setData] = useState<RestaurantsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRestaurants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        search: searchQuery,
        status: statusFilter,
        sortBy,
        sortOrder,
        page: String(page),
        limit: "15",
      });
      const res = await fetch(
        `/api/v1/super-admin/restaurants?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load restaurants");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load restaurants");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Restaurant Directory
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Inspect tenant restaurants, operational volume, owners, and platform status.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchRestaurants}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status Summary Tabs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "ALL", label: "All Restaurants", count: data.summary.total },
            { key: "ACTIVE", label: "Active", count: data.summary.active },
            { key: "SUSPENDED", label: "Suspended", count: data.summary.suspended },
            { key: "INACTIVE", label: "Inactive", count: data.summary.inactive },
          ].map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`p-3.5 rounded-2xl border text-left transition ${
                  active
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p
                  className={`text-xs font-bold uppercase tracking-wider ${
                    active ? "text-amber-300" : "text-slate-500"
                  }`}
                >
                  {tab.label}
                </p>
                <p className="text-2xl font-black mt-1">{tab.count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Sort Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col lg:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by restaurant name, slug, city, or owner email..."
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

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Sort By:
          </label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            aria-label="Sort restaurants by"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
          >
            <option value="createdAt">Created Date</option>
            <option value="name">Restaurant Name</option>
            <option value="ordersCount">Order Count</option>
            <option value="status">Status</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              setPage(1);
            }}
            aria-label="Sort order"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          {error}
        </div>
      )}

      {/* Directory List / Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading && !data ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading restaurants...
          </div>
        ) : !data || data.restaurants.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-slate-800">
              No matching restaurants found
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">Restaurant</th>
                    <th className="py-3.5 px-4">Owner</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Activity</th>
                    <th className="py-3.5 px-4">Paid Revenue</th>
                    <th className="py-3.5 px-4">Created</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {data.restaurants.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/super-admin/restaurants/${r.id}`}
                          className="font-bold text-slate-900 hover:text-amber-700 block"
                        >
                          {r.name}
                        </Link>
                        <span className="text-xs font-mono text-slate-500">
                          /{r.slug}
                        </span>
                        {r.city && (
                          <span className="text-xs text-slate-400">
                            {" "}
                            • {r.city}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {r.owner ? (
                          <div>
                            <Link
                              href={`/super-admin/users/${r.owner.id}`}
                              className="font-semibold text-slate-800 hover:underline block"
                            >
                              {r.owner.name}
                            </Link>
                            <span className="text-xs text-slate-500">
                              {r.owner.email}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            No owner linked
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <StatusBadge status={r.status} />
                          {r.suspendedReason && (
                            <p className="text-[11px] text-red-600 max-w-[180px] truncate">
                              {r.suspendedReason}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div>
                          <strong className="text-slate-900">
                            {r.counts.orders}
                          </strong>{" "}
                          orders •{" "}
                          <strong className="text-slate-900">
                            {r.counts.menuItems}
                          </strong>{" "}
                          items
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {r.counts.tables} tables • {r.counts.staff} staff
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {r.currency} {r.paidRevenue.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/super-admin/restaurants/${r.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
                        >
                          <span>Manage</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {data.restaurants.map((r) => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/super-admin/restaurants/${r.id}`}
                        className="font-bold text-base text-slate-900 hover:text-amber-700 block truncate"
                      >
                        {r.name}
                      </Link>
                      <p className="text-xs font-mono text-slate-500 truncate">
                        /{r.slug} {r.city ? `• ${r.city}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  {r.owner && (
                    <p className="text-xs text-slate-600 truncate">
                      Owner: <strong>{r.owner.name}</strong> ({r.owner.email})
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs">
                    <div>
                      <span className="text-slate-500 block">Orders</span>
                      <strong className="text-slate-900">
                        {r.counts.orders}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Items</span>
                      <strong className="text-slate-900">
                        {r.counts.menuItems}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Revenue</span>
                      <strong className="text-slate-900">
                        {r.currency} {r.paidRevenue.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-400">
                      Created {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/super-admin/restaurants/${r.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                    >
                      <span>Inspect & Manage</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Footer */}
            <div className="px-4 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
              <span>
                Showing page <strong>{data.pagination.page}</strong> of{" "}
                <strong>{data.pagination.totalPages}</strong> (
                {data.pagination.total} matching restaurants)
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
