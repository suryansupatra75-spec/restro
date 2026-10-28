"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Ban,
  ShieldAlert,
  Store,
  RefreshCw,
} from "lucide-react";

interface UserDetailData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  isLastActiveSuperAdmin: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    membershipId: string;
    role: string;
    membershipStatus: string;
    joinedAt: string;
    updatedAt: string;
    restaurant: {
      id: string;
      name: string;
      slug: string;
      status: string;
      city: string | null;
      currency: string;
      isOrderingEnabled: boolean;
      createdAt: string;
      counts: {
        orders: number;
        menuItems: number;
        tables: number;
        staff: number;
      };
    };
  }>;
  platformAuditLogs: Array<{
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
  staffAuditLogs: Array<{
    id: string;
    restaurantId: string;
    restaurantName: string;
    actorId: string;
    targetUserId: string | null;
    action: string;
    details: string | null;
    createdAt: string;
  }>;
}

export function SuperAdminUserDetailClient({
  userId,
  currentActorId,
}: {
  userId: string;
  currentActorId: string;
}) {
  const [user, setUser] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetIsActive, setTargetIsActive] = useState(true);
  const [targetIsSuperAdmin, setTargetIsSuperAdmin] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/super-admin/users/${userId}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load user details");
      }
      setUser(json.user);
      setTargetIsActive(json.user.isActive);
      setTargetIsSuperAdmin(json.user.isSuperAdmin);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load user details"
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);

    if (!confirmed) {
      setActionMessage({
        type: "error",
        text: "Please check the confirmation box before applying user account changes.",
      });
      return;
    }

    if (reason.trim().length < 3) {
      setActionMessage({
        type: "error",
        text: "Please provide a clear reason (at least 3 characters) for the audit log.",
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/super-admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: targetIsActive,
          isSuperAdmin: targetIsSuperAdmin,
          reason: reason.trim(),
          confirm: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update user account");
      }
      setActionMessage({
        type: "success",
        text: json.message || "User account updated.",
      });
      setReason("");
      setConfirmed(false);
      await fetchUser();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update user",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading user inspection data...
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-6 text-center space-y-3">
        <p className="text-red-600 font-bold">{error || "User not found"}</p>
        <Link
          href="/super-admin/users"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to User Directory
        </Link>
      </div>
    );
  }

  const isSelf = user.id === currentActorId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/super-admin/users"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to User Directory
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {user.name}
            </h1>
            {user.isSuperAdmin && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <ShieldCheck className="w-3.5 h-3.5" /> SUPER ADMIN
              </span>
            )}
            {user.isActive ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                <Ban className="w-3.5 h-3.5" /> DISABLED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono">
            User ID: {user.id} • Email: {user.email}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchUser}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-100 transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Profile & Memberships */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">
              Safe Account Metadata
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block">
                  Full Name
                </span>
                <span className="font-semibold text-slate-900">
                  {user.name}
                </span>
              </div>

              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block">
                  Email Address
                </span>
                <span className="font-semibold text-slate-900">
                  {user.email}
                </span>
              </div>

              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block">
                  Phone Number
                </span>
                <span className="text-slate-800">
                  {user.phone || "Not provided"}
                </span>
              </div>

              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block">
                  Account Created
                </span>
                <span className="text-slate-800">
                  {new Date(user.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {user.suspendedReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800">
                <strong>Disabled Reason:</strong> {user.suspendedReason}
                {user.suspendedAt
                  ? ` (${new Date(user.suspendedAt).toLocaleString()})`
                  : ""}
              </div>
            )}
          </section>

          {/* Linked Restaurants */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Store className="w-4 h-4 text-slate-700" />
              <h2 className="text-base font-extrabold text-slate-900">
                Linked Restaurant Memberships ({user.memberships.length})
              </h2>
            </div>

            {user.memberships.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                This user is not currently a member of any restaurant tenant.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {user.memberships.map((m) => (
                  <div
                    key={m.membershipId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/super-admin/restaurants/${m.restaurant.id}`}
                          className="font-bold text-sm text-slate-900 hover:text-amber-700"
                        >
                          {m.restaurant.name}
                        </Link>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800">
                          {m.role}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            m.membershipStatus === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          Membership: {m.membershipStatus}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Slug: /{m.restaurant.slug} • Restaurant Status:{" "}
                        <strong>{m.restaurant.status}</strong> •{" "}
                        {m.restaurant.counts.orders} orders
                      </p>
                    </div>

                    <Link
                      href={`/super-admin/restaurants/${m.restaurant.id}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 self-start sm:self-auto"
                    >
                      Inspect Restaurant
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Account Status & Super Admin Privilege Control */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 h-fit">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              Platform Account Control
            </h2>
          </div>

          {isSelf && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              <strong>Self-Lockout Protection Active:</strong> You are viewing
              your own Super Admin account. You cannot disable your own account
              or revoke your own Super Admin role.
            </div>
          )}

          {user.isLastActiveSuperAdmin && !isSelf && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              <strong>Last Super Admin Protection:</strong> This is the last
              active Super Admin on the platform and cannot be demoted or
              disabled.
            </div>
          )}

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

          <form onSubmit={handleUpdateUser} className="space-y-3.5">
            <div>
              <label
                htmlFor="user-active-select"
                className="block text-xs font-bold uppercase text-slate-600 mb-1"
              >
                Account Login Status
              </label>
              <select
                id="user-active-select"
                value={targetIsActive ? "ACTIVE" : "DISABLED"}
                onChange={(e) =>
                  setTargetIsActive(e.target.value === "ACTIVE")
                }
                disabled={isSelf}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:bg-slate-100"
              >
                <option value="ACTIVE">ACTIVE (Can Sign In)</option>
                <option value="DISABLED">DISABLED (Platform Suspended)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="user-superadmin-select"
                className="block text-xs font-bold uppercase text-slate-600 mb-1"
              >
                Platform Privilege Level
              </label>
              <select
                id="user-superadmin-select"
                value={targetIsSuperAdmin ? "SUPER_ADMIN" : "STANDARD"}
                onChange={(e) =>
                  setTargetIsSuperAdmin(e.target.value === "SUPER_ADMIN")
                }
                disabled={isSelf}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:bg-slate-100"
              >
                <option value="STANDARD">Standard Tenant User</option>
                <option value="SUPER_ADMIN">Platform Super Admin</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="user-update-reason"
                className="block text-xs font-bold uppercase text-slate-600 mb-1"
              >
                Audit Reason (Required)
              </label>
              <textarea
                id="user-update-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this user account is being modified..."
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
                I confirm this platform account change for{" "}
                <strong>{user.email}</strong>.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition disabled:opacity-50"
            >
              {submitting ? "Updating User..." : "Apply Account Update"}
            </button>
          </form>
        </section>
      </div>

      {/* Platform Audit History for this User */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-extrabold text-slate-900">
            Platform Audit History ({user.platformAuditLogs.length})
          </h2>
        </div>

        {user.platformAuditLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No platform audit events involving this user yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {user.platformAuditLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {log.action}
                  </span>
                  <span className="ml-2 text-slate-600">
                    Target: {log.targetType}{" "}
                    {log.targetLabel ? `(${log.targetLabel})` : ""}
                  </span>
                  {log.reason && (
                    <p className="text-slate-500 mt-1">Reason: {log.reason}</p>
                  )}
                </div>
                <div className="text-slate-500">
                  Actor: {log.actorEmail} •{" "}
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
