"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { 
  Users, UserPlus, Shield, ShieldCheck, ShieldAlert,
  Search, RefreshCw, Check, X, AlertCircle, Copy, 
  Trash2, Edit, Lock, Mail, Clock, CheckCircle2,
  ChevronRight, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ROLE_METADATA, StaffRole, canManageTargetRole, canAssignRole } from "@/lib/permissions";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  createdAt: string;
}

interface Member {
  id: string;
  restaurantId: string;
  userId: string;
  role: StaffRole;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  user: UserInfo;
}

interface Invitation {
  id: string;
  email: string;
  role: StaffRole;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface AuditLog {
  id: string;
  actorId: string;
  targetUserId: string | null;
  action: string;
  details: string | null;
  createdAt: string;
}

interface ClientStaffManagerProps {
  restaurantName: string;
  currentRole: string;
  currentUserId: string;
}

export function ClientStaffManager({
  restaurantName,
  currentRole,
  currentUserId,
}: ClientStaffManagerProps) {
  const [activeTab, setActiveTab] = useState<"MEMBERS" | "INVITATIONS" | "AUDIT">("MEMBERS");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Modals & Actions
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("STAFF");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccessUrl, setInviteSuccessUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [editRoleMember, setEditRoleMember] = useState<Member | null>(null);
  const [newRoleSelection, setNewRoleSelection] = useState<StaffRole>("STAFF");
  const [updatingRole, setUpdatingRole] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  const fetchStaffData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/staff");
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to load staff list");
      }
      const data = await res.json();
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
      setAuditLogs(data.auditLogs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaffData();
  }, [fetchStaffData]);

  // Handle Invite
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);

    try {
      const res = await fetch("/api/v1/staff/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to invite staff member");
      }

      setInviteSuccessUrl(json.inviteUrl);
      setInviteEmail("");
      await fetchStaffData(true);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite staff");
    } finally {
      setInviting(false);
    }
  };

  // Handle Role Change
  const handleRoleUpdate = async () => {
    if (!editRoleMember) return;
    setUpdatingRole(true);
    try {
      const res = await fetch(`/api/v1/staff/${editRoleMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRoleSelection }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update role");

      setEditRoleMember(null);
      await fetchStaffData(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating role");
    } finally {
      setUpdatingRole(false);
    }
  };

  // Handle Enable / Disable Toggle
  const handleToggleStatus = (member: Member) => {
    const nextStatus = member.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const actionVerb = nextStatus === "DISABLED" ? "Disable" : "Activate";

    setConfirmModal({
      title: `${actionVerb} Staff Member?`,
      message: nextStatus === "DISABLED"
        ? `Are you sure you want to disable ${member.user.name}? They will immediately lose access to all dashboard operations.`
        : `Activate ${member.user.name}? They will regain their assigned staff permissions.`,
      danger: nextStatus === "DISABLED",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/staff/${member.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          });
          if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error || "Failed to change status");
          }
          await fetchStaffData(true);
        } catch (err) {
          alert(err instanceof Error ? err.message : "Error updating status");
        }
      },
    });
  };

  // Handle Member Removal
  const handleRemoveMember = (member: Member) => {
    setConfirmModal({
      title: "Remove Staff Member?",
      message: `Are you sure you want to remove ${member.user.name} (${member.role}) from ${restaurantName}? Their restaurant membership will be revoked, but past order records will be preserved.`,
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/staff/${member.id}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error || "Failed to remove staff member");
          }
          await fetchStaffData(true);
        } catch (err) {
          alert(err instanceof Error ? err.message : "Error removing staff member");
        }
      },
    });
  };

  // Handle Cancel Invitation
  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/v1/staff/invitations/${invitationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to cancel invitation");
      }
      await fetchStaffData(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error cancelling invitation");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTokenId(id);
    setTimeout(() => setCopiedTokenId(null), 2500);
  };

  // Filtering
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.user.name.toLowerCase().includes(search.toLowerCase()) ||
      m.user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "ALL" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
            <Users className="w-7 h-7 text-primary" />
            Staff & Permissions
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage your team, invite members, assign roles, and audit operational access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 gap-1.5 text-xs font-bold"
            onClick={() => fetchStaffData()}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            className="h-9 px-4 gap-2 text-xs font-bold shadow-sm"
            onClick={() => {
              setInviteSuccessUrl(null);
              setInviteError(null);
              setInviteModalOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            Invite Staff
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("MEMBERS")}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === "MEMBERS"
              ? "bg-primary text-white shadow-xs"
              : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Active Staff ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("INVITATIONS")}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === "INVITATIONS"
              ? "bg-primary text-white shadow-xs"
              : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Pending Invites ({invitations.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("AUDIT")}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === "AUDIT"
              ? "bg-primary text-white shadow-xs"
              : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Activity Audit ({auditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: MEMBERS */}
      {activeTab === "MEMBERS" && (
        <Card className="overflow-hidden">
          <CardHeader className="p-4 sm:p-5 border-b border-border bg-surface-muted/20">
            <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search staff by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs bg-surface"
                />
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ALL">All Roles ({members.length})</option>
                  <option value="OWNER">Owners</option>
                  <option value="MANAGER">Managers</option>
                  <option value="STAFF">Floor Staff</option>
                  <option value="KITCHEN">Kitchen Chefs</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground flex flex-col items-center">
                <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
                <p className="text-sm font-semibold">Loading restaurant staff...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground p-6">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-foreground">No staff members match your criteria</p>
                <p className="text-xs mt-1">Try adjusting your search or role filter.</p>
              </div>
            ) : (
              <>
                {/* MOBILE VIEW (< md) */}
                <div className="md:hidden divide-y divide-border">
                  {filteredMembers.map((member) => {
                    const isOwner = member.role === "OWNER";
                    const isSelf = member.userId === currentUserId;
                    const canManage = !isOwner && !isSelf && canManageTargetRole(currentRole, member.role);
                    const meta = ROLE_METADATA[member.role] || { title: member.role, badgeColor: "bg-gray-100" };

                    return (
                      <div key={member.id} className="p-4 space-y-3 hover:bg-surface-muted/20 transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                              {member.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-bold text-sm text-foreground truncate">{member.user.name}</h4>
                                {isSelf && (
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                                    You
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${meta.badgeColor}`}>
                              {meta.title}
                            </span>
                            <div className="mt-1">
                              {member.status === "ACTIVE" ? (
                                <span className="text-[10px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-600 flex items-center justify-end gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Disabled
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions on Mobile */}
                        {canManage ? (
                          <div className="flex items-center gap-2 pt-2 border-t border-border">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 text-xs font-bold gap-1"
                              onClick={() => {
                                setEditRoleMember(member);
                                setNewRoleSelection(member.role);
                              }}
                            >
                              <Edit className="w-3.5 h-3.5" /> Edit Role
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-8 text-xs font-bold px-2.5 ${
                                member.status === "ACTIVE" ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
                              }`}
                              onClick={() => handleToggleStatus(member)}
                            >
                              {member.status === "ACTIVE" ? "Disable" : "Activate"}
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-bold px-2.5 text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveMember(member)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : isOwner ? (
                          <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1 font-semibold text-neutral-500">
                              <Lock className="w-3 h-3 text-red-500" /> Owner Protected
                            </span>
                            <span>Sole Proprietor</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* DESKTOP TABLE VIEW (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-5 font-bold">Staff Member</th>
                        <th className="py-3 px-4 font-bold">Assigned Role</th>
                        <th className="py-3 px-4 font-bold">Account Status</th>
                        <th className="py-3 px-4 font-bold">Joined</th>
                        <th className="py-3 px-5 text-right font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredMembers.map((member) => {
                        const isOwner = member.role === "OWNER";
                        const isSelf = member.userId === currentUserId;
                        const canManage = !isOwner && !isSelf && canManageTargetRole(currentRole, member.role);
                        const meta = ROLE_METADATA[member.role] || { title: member.role, badgeColor: "bg-gray-100" };

                        return (
                          <tr key={member.id} className="hover:bg-surface-muted/30 transition">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                  {member.user.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-sm text-foreground">{member.user.name}</span>
                                    {isSelf && (
                                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground text-[11px]">{member.user.email}</p>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${meta.badgeColor}`}>
                                {meta.title}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              {member.status === "ACTIVE" ? (
                                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Disabled
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-muted-foreground">
                              {format(new Date(member.createdAt), "MMM d, yyyy")}
                            </td>

                            <td className="py-3 px-5 text-right">
                              {canManage ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-xs font-semibold gap-1"
                                    onClick={() => {
                                      setEditRoleMember(member);
                                      setNewRoleSelection(member.role);
                                    }}
                                  >
                                    <Edit className="w-3 h-3" /> Role
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-7 px-2.5 text-xs font-semibold ${
                                      member.status === "ACTIVE" ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
                                    }`}
                                    onClick={() => handleToggleStatus(member)}
                                  >
                                    {member.status === "ACTIVE" ? "Disable" : "Activate"}
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveMember(member)}
                                    title="Remove from restaurant"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ) : isOwner ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-400">
                                  <Lock className="w-3 h-3 text-red-400" /> Protected
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">No actions</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 2: INVITATIONS */}
      {activeTab === "INVITATIONS" && (
        <Card>
          <CardHeader className="p-4 sm:p-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">Pending Staff Invitations</CardTitle>
                <CardDescription className="text-xs">
                  Sent invitation tokens expire after 7 days. Anyone with the secure link can join with their designated role.
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs font-bold"
                onClick={() => {
                  setInviteSuccessUrl(null);
                  setInviteError(null);
                  setInviteModalOpen(true);
                }}
              >
                <UserPlus className="w-3.5 h-3.5" /> New Invitation
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {invitations.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground p-6">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-foreground">No pending invitations</p>
                <p className="text-xs mt-1">Invite team members to help operate orders, menus, or kitchen display.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {invitations.map((inv) => {
                  const roleMeta = ROLE_METADATA[inv.role] || { title: inv.role, badgeColor: "bg-gray-100" };
                  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.id}` : "";

                  return (
                    <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-muted/20 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Mail className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground truncate">{inv.email}</span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${roleMeta.badgeColor}`}>
                              {roleMeta.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Expires on {format(new Date(inv.expiresAt), "MMM d, yyyy, h:mm a")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-bold gap-1.5"
                          onClick={() => copyToClipboard(inviteUrl, inv.id)}
                        >
                          {copiedTokenId === inv.id ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy Link
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10"
                          onClick={() => handleCancelInvitation(inv.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: AUDIT ACTIVITY LOG */}
      {activeTab === "AUDIT" && (
        <Card>
          <CardHeader className="p-4 sm:p-5 border-b border-border">
            <CardTitle className="text-base font-bold">Staff Activity Audit Trail</CardTitle>
            <CardDescription className="text-xs">
              Immutable record of staff invitations, role changes, activations, and membership revocations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {auditLogs.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground p-6">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-foreground">No audit logs recorded yet</p>
                <p className="text-xs mt-1">Staff management activities will be logged here automatically.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {auditLogs.map((log) => {
                  let parsedDetails: Record<string, any> = {};
                  try {
                    parsedDetails = log.details ? JSON.parse(log.details) : {};
                  } catch {
                    parsedDetails = { raw: log.details };
                  }

                  return (
                    <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-surface-muted/10 transition">
                      <div className="w-8 h-8 rounded-lg bg-surface-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <Shield className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                            {log.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {format(new Date(log.createdAt), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {parsedDetails.invitedEmail && `Invited: ${parsedDetails.invitedEmail} (${parsedDetails.assignedRole})`}
                          {parsedDetails.previousRole && `Changed role: ${parsedDetails.previousRole} → ${parsedDetails.newRole}`}
                          {parsedDetails.newStatus && `Status updated to ${parsedDetails.newStatus}`}
                          {parsedDetails.removedUserEmail && `Removed: ${parsedDetails.removedUserEmail} (${parsedDetails.removedRole})`}
                          {parsedDetails.acceptedEmail && `Accepted by: ${parsedDetails.acceptedEmail} (${parsedDetails.assignedRole})`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── MODAL: INVITE STAFF ─── */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Invite Staff Member</h3>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inviteSuccessUrl ? (
              <div className="py-6 space-y-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-foreground">Invitation Link Created!</h4>
                <p className="text-xs text-muted-foreground">
                  Share this single-use link with the staff member. It expires in 7 days.
                </p>

                <div className="p-3 bg-surface-muted rounded-xl border border-border flex items-center gap-2">
                  <Input
                    readOnly
                    value={inviteSuccessUrl}
                    className="h-8 text-xs bg-surface font-mono"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs font-bold shrink-0"
                    onClick={() => copyToClipboard(inviteSuccessUrl, "modal")}
                  >
                    {copiedTokenId === "modal" ? "Copied!" : "Copy"}
                  </Button>
                </div>

                <Button
                  className="w-full mt-4"
                  onClick={() => setInviteModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="py-4 space-y-4">
                <div>
                  <Label htmlFor="invite-email" className="text-xs font-bold">Staff Email *</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    placeholder="e.g. chef@restaurant.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1 text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="invite-role" className="text-xs font-bold">Assign Role *</Label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as StaffRole)}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-surface text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {currentRole === "OWNER" && (
                      <option value="MANAGER">Manager (Operational admin, menus, tables, staff)</option>
                    )}
                    <option value="STAFF">Floor Staff (Orders, tables, customer payments)</option>
                    <option value="KITCHEN">Kitchen Chef (KDS display & preparation only)</option>
                  </select>
                </div>

                {inviteError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{inviteError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setInviteModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={inviting || !inviteEmail.trim()}
                    className="flex-1 font-bold"
                  >
                    {inviting ? "Creating Link..." : "Create Invitation"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: EDIT ROLE ─── */}
      {editRoleMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface border border-border w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <h3 className="font-bold text-base text-foreground mb-1">Edit Staff Role</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Update role permissions for <span className="font-bold text-foreground">{editRoleMember.user.name}</span>.
            </p>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold">New Role</Label>
                <select
                  value={newRoleSelection}
                  onChange={(e) => setNewRoleSelection(e.target.value as StaffRole)}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-border bg-surface text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {currentRole === "OWNER" && (
                    <option value="MANAGER">Manager</option>
                  )}
                  <option value="STAFF">Floor Staff</option>
                  <option value="KITCHEN">Kitchen Chef</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditRoleMember(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold"
                  disabled={updatingRole}
                  onClick={handleRoleUpdate}
                >
                  {updatingRole ? "Saving..." : "Save Role"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CONFIRM ACTION ─── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface border border-border w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-foreground">{confirmModal.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
              <Button
                className={`flex-1 font-bold ${
                  confirmModal.danger ? "bg-destructive hover:bg-destructive/90 text-white" : ""
                }`}
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  await fn();
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
