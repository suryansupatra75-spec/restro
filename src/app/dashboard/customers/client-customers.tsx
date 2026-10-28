"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  Users,
  Search,
  ArrowUpDown,
  Phone,
  Mail,
  ShoppingBag,
  DollarSign,
  Calendar,
  Clock,
  Shield,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  UserCheck,
  RefreshCw,
  ExternalLink,
  Table as TableIcon,
  Gift,
  Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { format, formatDistanceToNow } from "date-fns";

interface CustomerSummary {
  id: string;
  restaurantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  isContactMasked: boolean;
  orderCount: number;
  paidOrderCount: number;
  lifetimeSpend: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  notesCount: number;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  table: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  tax: number;
  total: number;
  specialInstructions: string | null;
  itemsCount: number;
  itemsSummary: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    variant: string | null;
    addons: string[];
  }[];
  payments: {
    id: string;
    provider: string;
    amount: number;
    status: string;
    method: string | null;
    createdAt: string;
  }[];
  createdAt: string;
}

interface NoteDetail {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface CustomerFullDetail {
  customer: {
    id: string;
    restaurantId: string;
    name: string;
    phone: string | null;
    email: string | null;
    isContactMasked: boolean;
    createdAt: string;
    updatedAt: string;
  };
  metrics: {
    totalOrders: number;
    completedOrders: number;
    paidOrdersCount: number;
    lifetimeSpend: number;
    avgOrderValue: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
  orders: OrderDetail[];
  notes: NoteDetail[];
  permissions: {
    canViewContact: boolean;
    canManageNotes: boolean;
  };
}

interface ClientCustomersProps {
  restaurantName: string;
  currency: string;
  currentRole: string;
  currentUserId: string;
}

export function ClientCustomersManager({
  restaurantName,
  currency,
  currentRole,
}: ClientCustomersProps) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "orders" | "spend" | "name">("recent");
  const [canViewContact, setCanViewContact] = useState(false);
  const [canManageNotes, setCanManageNotes] = useState(false);

  // Detail Modal / Drawer State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerFullDetail | null>(null);
  const [loyaltyData, setLoyaltyData] = useState<{
    pointsBalance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    programEnabled: boolean;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"orders" | "receipts" | "notes">("orders");
  const [customerReceipts, setCustomerReceipts] = useState<any[]>([]);

  // New Note State
  const [newNoteContent, setNewNoteContent] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  const fmtCurrency = useCallback(
    (amt: number) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2,
      }).format(amt);
    },
    [currency]
  );

  // Fetch Customers List
  const fetchCustomers = useCallback(
    async (pageToLoad = 1, searchQuery = search, sort = sortBy) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams({
          page: String(pageToLoad),
          limit: "10",
          sortBy: sort,
        });
        if (searchQuery.trim()) {
          queryParams.set("search", searchQuery.trim());
        }

        const res = await fetch(`/api/v1/customers?${queryParams.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load customers");
        }

        setCustomers(data.customers || []);
        setPagination(data.pagination);
        setCanViewContact(!!data.permissions?.canViewContact);
        setCanManageNotes(!!data.permissions?.canManageNotes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading customers");
      } finally {
        setLoading(false);
      }
    },
    [search, sortBy]
  );

  useEffect(() => {
    fetchCustomers(1, search, sortBy);
  }, [fetchCustomers, search, sortBy]);

  // Fetch Single Customer Detail
  const fetchCustomerDetail = async (id: string) => {
    setSelectedCustomerId(id);
    setDetailLoading(true);
    setDetailError(null);
    setLoyaltyData(null);
    setCustomerReceipts([]);
    try {
      const [res, loyaltyRes, receiptsRes] = await Promise.all([
        fetch(`/api/v1/customers/${id}`),
        fetch(`/api/v1/loyalty/customers/${id}`),
        fetch(`/api/v1/customers/${id}/receipts`),
      ]);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load customer profile");
      }
      setCustomerDetail(data);

      if (receiptsRes.ok) {
        const rData = await receiptsRes.json();
        setCustomerReceipts(rData.receipts || []);
      }

      if (loyaltyRes.ok) {
        const lData = await loyaltyRes.json();
        if (lData?.summary) {
          setLoyaltyData({
            pointsBalance: lData.summary.pointsBalance ?? 0,
            lifetimeEarned: lData.summary.lifetimeEarned ?? 0,
            lifetimeRedeemed: lData.summary.lifetimeRedeemed ?? 0,
            programEnabled: !!lData.summary.program?.isEnabled,
          });
        }
      }
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Error loading profile");
    } finally {
      setDetailLoading(false);
    }
  };

  // Add Internal Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !newNoteContent.trim() || submittingNote) return;

    setSubmittingNote(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/v1/customers/${selectedCustomerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNoteContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create note");
      }

      setCustomerDetail((prev) =>
        prev
          ? {
              ...prev,
              notes: [data.note, ...prev.notes],
            }
          : prev
      );
      setNewNoteContent("");

      // Update count in list
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomerId ? { ...c, notesCount: c.notesCount + 1 } : c
        )
      );
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSubmittingNote(false);
    }
  };

  // Delete Internal Note
  const handleDeleteNote = async (noteId: string) => {
    if (!selectedCustomerId) return;
    try {
      const res = await fetch(`/api/v1/customers/${selectedCustomerId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete note");
      }

      setCustomerDetail((prev) =>
        prev
          ? {
              ...prev,
              notes: prev.notes.filter((n) => n.id !== noteId),
            }
          : prev
      );

      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomerId
            ? { ...c, notesCount: Math.max(0, c.notesCount - 1) }
            : c
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting note");
    }
  };

  // Derived Summary Metrics
  const totalSpendSum = customers.reduce((acc, c) => acc + c.lifetimeSpend, 0);
  const totalOrdersSum = customers.reduce((acc, c) => acc + c.orderCount, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Customer CRM
            </h1>
            <span className="text-xs bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full border border-primary/20">
              {pagination.total} Profiles
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Tenant-isolated customer profiles, lifetime order history, and service notes for{" "}
            <span className="font-semibold text-foreground">{restaurantName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCustomers(pagination.page, search, sortBy)}
            disabled={loading}
            className="gap-2 text-xs h-9 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 border-border/80 bg-surface/50 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Customers</p>
              <p className="text-xl font-extrabold text-foreground mt-0.5">{pagination.total}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-border/80 bg-surface/50 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Page Lifetime Spend</p>
              <p className="text-xl font-extrabold text-foreground mt-0.5">
                {fmtCurrency(totalSpendSum)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-border/80 bg-surface/50 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Tracked Orders</p>
              <p className="text-xl font-extrabold text-foreground mt-0.5">{totalOrdersSum}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-border/80 bg-surface/50 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Role Privacy Level</p>
              <p className="text-xs font-bold text-foreground mt-1 flex items-center gap-1">
                {canViewContact ? (
                  <span className="text-emerald-600">Full PII Access</span>
                ) : (
                  <span className="text-amber-600">Contact Masked</span>
                )}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 border-border/80 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-border bg-surface-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs font-medium bg-surface border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="recent">Most Recent Order</option>
              <option value="spend">Highest Spend</option>
              <option value="orders">Most Orders</option>
              <option value="name">Customer Name</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Customer List Table & Responsive Cards */}
      <Card className="border-border/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Loading restaurant customer records...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3 px-4">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => fetchCustomers()}>
              Try Again
            </Button>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-20 text-center space-y-3 px-4">
            <div className="w-12 h-12 rounded-full bg-surface-muted border border-border flex items-center justify-center mx-auto text-muted-foreground">
              <UserCheck className="w-6 h-6" />
            </div>
            <p className="text-base font-bold text-foreground">No customer records found</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search
                ? `No customers match query "${search}". Try searching a different name, phone, or email.`
                : "Customers will appear here automatically as they place orders via table QR menus."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Contact</th>
                    <th className="py-3.5 px-4 text-center">Orders</th>
                    <th className="py-3.5 px-4 text-right">Lifetime Spend</th>
                    <th className="py-3.5 px-4">Last Order</th>
                    <th className="py-3.5 px-4 text-center">Notes</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-muted/20 transition cursor-pointer"
                      onClick={() => fetchCustomerDetail(c.id)}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm leading-snug">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Customer since {format(new Date(c.createdAt), "MMM yyyy")}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {c.phone ? (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="w-3 h-3 text-primary/70 shrink-0" />
                              <span className="font-mono text-[11px]">{c.phone}</span>
                            </div>
                          ) : null}
                          {c.email ? (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="w-3 h-3 text-primary/70 shrink-0" />
                              <span className="text-[11px] truncate max-w-[140px]">{c.email}</span>
                            </div>
                          ) : null}
                          {!c.phone && !c.email && (
                            <span className="text-[11px] text-muted-foreground italic">Guest (No contact)</span>
                          )}
                          {c.isContactMasked && (c.phone || c.email) && (
                            <span className="inline-block text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.2 rounded font-medium">
                              Masked
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center justify-center font-extrabold text-foreground px-2 py-0.5 bg-surface-muted rounded-full">
                          {c.orderCount}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span className="font-extrabold text-foreground text-sm">
                          {fmtCurrency(c.lifetimeSpend)}
                        </span>
                        {c.paidOrderCount > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {c.paidOrderCount} paid {c.paidOrderCount === 1 ? "order" : "orders"}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {c.lastOrderAt ? (
                          <div>
                            <p className="font-medium text-foreground">
                              {formatDistanceToNow(new Date(c.lastOrderAt), { addSuffix: true })}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(c.lastOrderAt), "MMM d, h:mm a")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {c.notesCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                            <FileText className="w-3 h-3" /> {c.notesCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7.5 px-2.5 cursor-pointer hover:bg-primary hover:text-primary-foreground transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchCustomerDetail(c.id);
                          }}
                        >
                          View History
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-border">
              {customers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => fetchCustomerDetail(c.id)}
                  className="p-4 space-y-3 hover:bg-surface-muted/20 active:bg-surface-muted/30 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-foreground text-sm">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.lastOrderAt
                            ? `Last active ${formatDistanceToNow(new Date(c.lastOrderAt), { addSuffix: true })}`
                            : "New profile"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-extrabold text-foreground text-sm">
                        {fmtCurrency(c.lifetimeSpend)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{c.orderCount} orders</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-border/50 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {c.phone && <span className="font-mono text-[11px]">{c.phone}</span>}
                      {c.email && <span className="truncate max-w-[120px]">{c.email}</span>}
                      {!c.phone && !c.email && <span className="italic">Guest checkout</span>}
                    </div>

                    <span className="text-primary text-xs font-semibold flex items-center gap-0.5">
                      View <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-muted/30 text-xs text-muted-foreground">
              <div>
                Showing page <span className="font-bold text-foreground">{pagination.page}</span> of{" "}
                <span className="font-bold text-foreground">{pagination.totalPages}</span> (
                {pagination.total} total)
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs cursor-pointer"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => fetchCustomers(pagination.page - 1)}
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs cursor-pointer"
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => fetchCustomers(pagination.page + 1)}
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-surface h-full shadow-2xl flex flex-col border-l border-border overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0 border border-primary/20">
                  {customerDetail?.customer?.name?.slice(0, 2).toUpperCase() || "CU"}
                </div>
                <div>
                  <h2 className="font-bold text-lg text-foreground leading-tight">
                    {customerDetail?.customer?.name || "Customer Profile"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Tenant-scoped CRM ID:{" "}
                    <span className="font-mono text-[10px]">{selectedCustomerId.slice(0, 8)}...</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerDetail(null);
                }}
                className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {detailLoading ? (
                <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading customer order history...</p>
                </div>
              ) : detailError ? (
                <div className="py-16 text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
                  <p className="text-sm font-semibold text-destructive">{detailError}</p>
                </div>
              ) : customerDetail ? (
                <>
                  {/* Contact & Profile Card */}
                  <div className="bg-surface-muted/40 rounded-xl p-4 border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                        Contact Information
                      </span>
                      {customerDetail.customer.isContactMasked ? (
                        <span className="text-[10px] bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> Masked (Role restriction)
                        </span>
                      ) : (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Verified Contact Access
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-mono text-foreground">
                          {customerDetail.customer.phone || "No phone provided"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate">
                          {customerDetail.customer.email || "No email provided"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Loyalty Retention Summary Card */}
                  <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 rounded-xl p-4 border border-amber-200/60 dark:border-amber-900/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                          Loyalty & Rewards
                        </span>
                      </div>
                      {loyaltyData?.programEnabled ? (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                          Program Active
                        </span>
                      ) : (
                        <span className="text-[10px] bg-surface-muted text-muted-foreground font-medium px-2 py-0.5 rounded-full">
                          Program Inactive
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                      <div className="bg-surface rounded-lg p-2.5 border border-border shadow-2xs">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Balance</p>
                        <p className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                          {loyaltyData ? loyaltyData.pointsBalance.toLocaleString() : "0"}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">pts</span>
                        </p>
                      </div>
                      <div className="bg-surface rounded-lg p-2.5 border border-border shadow-2xs">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Earned</p>
                        <p className="text-base font-extrabold text-foreground">
                          {loyaltyData ? loyaltyData.lifetimeEarned.toLocaleString() : "0"}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">pts</span>
                        </p>
                      </div>
                      <div className="bg-surface rounded-lg p-2.5 border border-border shadow-2xs">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Redeemed</p>
                        <p className="text-base font-extrabold text-foreground">
                          {loyaltyData ? loyaltyData.lifetimeRedeemed.toLocaleString() : "0"}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">pts</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Authoritative Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface border border-border rounded-xl p-3 text-center shadow-2xs">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Lifetime Spend
                      </p>
                      <p className="text-base sm:text-lg font-extrabold text-foreground mt-1">
                        {fmtCurrency(customerDetail.metrics.lifetimeSpend)}
                      </p>
                      <p className="text-[9px] text-emerald-600 font-medium">Verified Paid</p>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-3 text-center shadow-2xs">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Total Orders
                      </p>
                      <p className="text-base sm:text-lg font-extrabold text-foreground mt-1">
                        {customerDetail.metrics.totalOrders}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {customerDetail.metrics.completedOrders} completed
                      </p>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-3 text-center shadow-2xs">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Avg Order (AOV)
                      </p>
                      <p className="text-base sm:text-lg font-extrabold text-foreground mt-1">
                        {fmtCurrency(customerDetail.metrics.avgOrderValue)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">Per paid ticket</p>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-3 text-center shadow-2xs">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        First Order
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-foreground mt-1 truncate">
                        {customerDetail.metrics.firstOrderAt
                          ? format(new Date(customerDetail.metrics.firstOrderAt), "MMM d, yyyy")
                          : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground">First visit</p>
                    </div>
                  </div>

                  {/* Tab Navigation */}
                  <div className="border-b border-border flex items-center gap-6">
                    <button
                      onClick={() => setActiveDetailTab("orders")}
                      className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                        activeDetailTab === "orders"
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" /> Order History ({customerDetail.orders.length})
                    </button>

                    <button
                      onClick={() => setActiveDetailTab("receipts")}
                      className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                        activeDetailTab === "receipts"
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Receipt className="w-4 h-4" /> Digital Receipts ({customerReceipts.length})
                    </button>

                    <button
                      onClick={() => setActiveDetailTab("notes")}
                      className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                        activeDetailTab === "notes"
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <FileText className="w-4 h-4" /> Service Notes ({customerDetail.notes.length})
                    </button>
                  </div>

                  {/* TAB 1: ORDER HISTORY */}
                  {activeDetailTab === "orders" && (
                    <div className="space-y-3">
                      {customerDetail.orders.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-xs">
                          No order history found for this customer.
                        </div>
                      ) : (
                        customerDetail.orders.map((order) => (
                          <div
                            key={order.id}
                            className="bg-surface rounded-xl border border-border p-4 space-y-2.5 shadow-2xs hover:border-primary/40 transition"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-foreground">
                                  {order.orderNumber}
                                </span>
                                <span className="text-[11px] bg-surface-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                                  {order.table}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    order.status === "COMPLETED"
                                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                      : order.status === "CANCELLED"
                                      ? "bg-destructive/10 text-destructive border border-destructive/20"
                                      : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                  }`}
                                >
                                  {order.status}
                                </span>

                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    order.paymentStatus === "PAID"
                                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                      : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                  }`}
                                >
                                  {order.paymentStatus}
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-foreground font-medium">
                              {order.itemsSummary || "Order items summary"}
                            </p>

                            <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50 text-muted-foreground">
                              <span className="flex items-center gap-1 text-[11px]">
                                <Clock className="w-3 h-3" />
                                {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
                              </span>

                              <span className="font-extrabold text-foreground text-sm">
                                {fmtCurrency(order.total)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 2: DIGITAL RECEIPTS */}
                  {activeDetailTab === "receipts" && (
                    <div className="space-y-3">
                      {customerReceipts.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground text-xs space-y-2">
                          <Receipt className="w-8 h-8 mx-auto text-muted-foreground/60" />
                          <p>No digital receipts issued for this customer yet.</p>
                          <p className="text-[10px]">
                            Receipts are created automatically when orders are paid.
                          </p>
                        </div>
                      ) : (
                        customerReceipts.map((rcpt) => (
                          <div
                            key={rcpt.id}
                            className="bg-surface rounded-xl border border-border p-4 space-y-2.5 shadow-2xs hover:border-primary/40 transition"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm text-foreground">
                                  {rcpt.receiptNumber}
                                </span>
                                {rcpt.isTaxInvoice && (
                                  <span className="text-[9px] bg-purple-500/10 text-purple-700 font-bold px-1.5 py-0.2 rounded">
                                    TAX INVOICE
                                  </span>
                                )}
                              </div>

                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  rcpt.paymentStatus === "PAID"
                                    ? "bg-emerald-500/10 text-emerald-700"
                                    : "bg-amber-500/10 text-amber-700"
                                }`}
                              >
                                {rcpt.paymentStatus}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                Order #{rcpt.orderNumber} &bull; {rcpt.tableName} &bull; {rcpt.paymentMethod || "CASH"}
                              </span>
                              <span className="font-extrabold text-foreground text-sm">
                                {fmtCurrency(rcpt.finalTotal)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">
                                  {format(new Date(rcpt.issueDate), "MMM d, yyyy h:mm a")}
                                </span>
                              </div>

                              <a
                                href={`/receipt/${rcpt.receiptToken}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                              >
                                View Receipt <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 3: SERVICE NOTES */}
                  {activeDetailTab === "notes" && (
                    <div className="space-y-4">
                      {/* Add Note Input */}
                      {canManageNotes ? (
                        <form onSubmit={handleAddNote} className="space-y-2">
                          <label className="text-xs font-bold text-foreground">
                            Add Internal Note
                          </label>
                          <textarea
                            rows={3}
                            maxLength={1000}
                            placeholder="e.g. Regular guest, prefers corner tables. Allergies: peanuts..."
                            value={newNoteContent}
                            onChange={(e) => setNewNoteContent(e.target.value)}
                            className="w-full text-xs p-3 rounded-xl border border-border bg-surface-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition resize-none"
                          />
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{newNoteContent.length}/1000 characters</span>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={!newNoteContent.trim() || submittingNote}
                              className="text-xs h-8 cursor-pointer"
                            >
                              {submittingNote ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5 mr-1" /> Post Note
                                </>
                              )}
                            </Button>
                          </div>
                          {noteError && (
                            <p className="text-xs text-destructive font-medium">{noteError}</p>
                          )}
                        </form>
                      ) : (
                        <div className="p-3 bg-surface-muted rounded-xl text-xs text-muted-foreground flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary shrink-0" />
                          <span>Managing customer service notes requires Manager or Owner role.</span>
                        </div>
                      )}

                      {/* Notes Thread */}
                      <div className="space-y-2.5 pt-2">
                        {customerDetail.notes.length === 0 ? (
                          <div className="py-8 text-center text-muted-foreground text-xs">
                            No service notes recorded for this customer yet.
                          </div>
                        ) : (
                          customerDetail.notes.map((note) => (
                            <div
                              key={note.id}
                              className="bg-surface rounded-xl border border-border p-3.5 space-y-1.5 shadow-2xs relative group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground">
                                  {note.authorName}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(note.createdAt), "MMM d, h:mm a")}
                                  </span>
                                  {canManageNotes && (
                                    <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      className="text-muted-foreground hover:text-destructive transition p-1 rounded cursor-pointer"
                                      title="Delete note"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                                {note.content}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
