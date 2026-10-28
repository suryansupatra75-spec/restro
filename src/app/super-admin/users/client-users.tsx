"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Ban,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    membershipId: string;
    role: string;
    membershipStatus: string;
    joinedAt: string;
    restaurantId: string;
    restaurantName: string;
    restaurantSlug: string;
    restaurantStatus: string;
    restaurantCity: string | null;
  }>;
}

interface UsersResponse {
  users: UserDirectoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    active: number;
    disabled: number;
    superAdmins: number;
  };
}

export function SuperAdminUsersClient() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [page, setPage] = useState<number>(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        search: searchQuery,
        role: roleFilter,
        status: statusFilter,
        sortBy,
        sortOrder,
        page: String(page),
        limit: "15",
      });
      const res = await fetch(
        `/api/v1/super-admin/users?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load users");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, roleFilter, statusFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
            User Directory
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Inspect platform user accounts, Super Admins, restaurant owners, and staff memberships.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "All Users",
              count: data.summary.total,
              onClick: () => {
                setStatusFilter("ALL");
                setRoleFilter("ALL");
                setPage(1);
              },
              active: statusFilter === "ALL" && roleFilter === "ALL",
            },
            {
              label: "Active Accounts",
              count: data.summary.active,
              onClick: () => {
                setStatusFilter("ACTIVE");
                setPage(1);
              },
              active: statusFilter === "ACTIVE",
            },
            {
              label: "Disabled Accounts",
              count: data.summary.disabled,
              onClick: () => {
                setStatusFilter("DISABLED");
                setPage(1);
              },
              active: statusFilter === "DISABLED",
            },
            {
              label: "Super Admins",
              count: data.summary.superAdmins,
              onClick: () => {
                setRoleFilter("SUPER_ADMIN");
                setStatusFilter("ALL");
                setPage(1);
              },
              active: roleFilter === "SUPER_ADMIN",
            },
          ].map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className={`p-3.5 rounded-2xl border text-left transition ${
                card.active
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p
                className={`text-xs font-bold uppercase tracking-wider ${
                  card.active ? "text-amber-300" : "text-slate-500"
                }`}
              >
                {card.label}
              </p>
              <p className="text-2xl font-black mt-1">{card.count}</p>
            </button>
          ))}
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col lg:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by user name, email, phone, or restaurant..."
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
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
          >
            <option value="ALL">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="OWNER">Restaurant Owner</option>
            <option value="MANAGER">Manager</option>
            <option value="STAFF">Floor Staff</option>
            <option value="KITCHEN">Kitchen (KDS)</option>
            <option value="NO_RESTAURANT">No Restaurant</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by account status"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Accounts</option>
            <option value="DISABLED">Disabled Accounts</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            aria-label="Sort users by"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
          >
            <option value="createdAt">Created Date</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
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
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          {error}
        </div>
      )}

      {/* Users Table & Mobile List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading && !data ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading platform users...
          </div>
        ) : !data || data.users.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-slate-800">No matching users found</p>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search query or filters.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">User</th>
                    <th className="py-3.5 px-4">Platform Role</th>
                    <th className="py-3.5 px-4">Account Status</th>
                    <th className="py-3.5 px-4">Linked Restaurants</th>
                    <th className="py-3.5 px-4">Created</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {data.users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/super-admin/users/${u.id}`}
                          className="font-bold text-slate-900 hover:text-amber-700 block"
                        >
                          {u.name}
                        </Link>
                        <span className="text-xs text-slate-500">
                          {u.email}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.isSuperAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <ShieldCheck className="w-3.5 h-3.5" /> SUPER_ADMIN
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-600">
                            Tenant User
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                              <Ban className="w-3.5 h-3.5" /> Disabled
                            </span>
                            {u.suspendedReason && (
                              <p className="text-[11px] text-red-600 mt-0.5 max-w-[160px] truncate">
                                {u.suspendedReason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {u.memberships.length === 0 ? (
                          <span className="text-slate-400">
                            No restaurant linked
                          </span>
                        ) : (
                          <div className="space-y-1">
                            {u.memberships.map((m) => (
                              <div
                                key={m.membershipId}
                                className="flex items-center gap-1.5"
                              >
                                <span className="px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-800">
                                  {m.role}
                                </span>
                                <Link
                                  href={`/super-admin/restaurants/${m.restaurantId}`}
                                  className="font-semibold text-slate-800 hover:underline truncate max-w-[180px]"
                                >
                                  {m.restaurantName}
                                </Link>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/super-admin/users/${u.id}`}
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
              {data.users.map((u) => (
                <div key={u.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/super-admin/users/${u.id}`}
                        className="font-bold text-base text-slate-900 block truncate"
                      >
                        {u.name}
                      </Link>
                      <p className="text-xs text-slate-500 truncate">
                        {u.email}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {u.isSuperAdmin && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          SUPER ADMIN
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.isActive ? "ACTIVE" : "DISABLED"}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600">
                    {u.memberships.length === 0 ? (
                      <span className="text-slate-400">
                        No restaurant memberships
                      </span>
                    ) : (
                      u.memberships
                        .map((m) => `${m.role} @ ${m.restaurantName}`)
                        .join(" • ")
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-400">
                      Joined {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/super-admin/users/${u.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                    >
                      <span>Inspect</span>
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
                {data.pagination.total} matching users)
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
