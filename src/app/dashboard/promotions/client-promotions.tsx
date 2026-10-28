"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Tag,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Layers,
  Sparkles,
  Archive,
  Eye,
  Edit2,
  Calendar,
  Percent,
  DollarSign,
  TrendingUp,
  Receipt,
  UserCheck,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PromotionItem {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderSubtotal: number;
  maxDiscountAmount: number | null;
  appliesTo: "ALL" | "CATEGORIES" | "ITEMS";
  eligibleCategoryIds: string[];
  eligibleItemIds: string[];
  firstOrderOnly: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  currentUses: number;
  status: "ACTIVE" | "DISABLED" | "ARCHIVED";
  effectiveState: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "LIMIT_REACHED" | "DISABLED" | "ARCHIVED";
  appliedRedemptions: number;
  totalDiscountGranted: number;
  createdAt: string;
}

interface SummaryData {
  activeCount: number;
  totalPromotions: number;
  totalRedemptions: number;
  totalDiscountGranted: number;
  maxPromotions: number;
  planName: string;
  currency: string;
  canManage: boolean;
}

interface MenuCategoryOption {
  id: string;
  name: string;
}

interface MenuItemOption {
  id: string;
  name: string;
  price: number;
  categoryId: string;
}

interface RedemptionRow {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  tableName: string;
  codeSnapshot: string;
  discountAmount: number;
  eligibleSubtotal: number;
  orderTotal: number;
  status: string;
  releasedReason: string | null;
  createdAt: string;
}

export function ClientPromotions({
  restaurantId,
  restaurantName,
  currency,
  canManage,
}: {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  canManage: boolean;
}) {
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [categories, setCategories] = useState<MenuCategoryOption[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [formDiscountValue, setFormDiscountValue] = useState<string>("10");
  const [formMinOrderSubtotal, setFormMinOrderSubtotal] = useState<string>("0");
  const [formMaxDiscountAmount, setFormMaxDiscountAmount] = useState<string>("");
  const [formAppliesTo, setFormAppliesTo] = useState<"ALL" | "CATEGORIES" | "ITEMS">("ALL");
  const [formSelectedCats, setFormSelectedCats] = useState<string[]>([]);
  const [formSelectedItems, setFormSelectedItems] = useState<string[]>([]);
  const [formFirstOrderOnly, setFormFirstOrderOnly] = useState(false);
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formMaxUsesTotal, setFormMaxUsesTotal] = useState<string>("");
  const [formMaxUsesPerCustomer, setFormMaxUsesPerCustomer] = useState<string>("");
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "DISABLED">("ACTIVE");

  // Redemptions inspector state
  const [redemptionsModalOpen, setRedemptionsModalOpen] = useState(false);
  const [inspectingPromo, setInspectingPromo] = useState<PromotionItem | null>(null);
  const [redemptionsList, setRedemptionsList] = useState<RedemptionRow[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amt);
  };

  const fetchPromotions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ restaurantId });
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (search.trim()) params.append("search", search.trim());

      const res = await fetch(`/api/v1/promotions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load promotions");
      const data = await res.json();
      setPromotions(data.promotions || []);
      setSummary(data.summary || null);
      setCategories(data.categories || []);
      setMenuItems(data.menuItems || []);
    } catch (err) {
      console.error("fetchPromotions error:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, statusFilter, search]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormCode("");
    setFormName("");
    setFormDescription("");
    setFormDiscountType("PERCENTAGE");
    setFormDiscountValue("10");
    setFormMinOrderSubtotal("0");
    setFormMaxDiscountAmount("");
    setFormAppliesTo("ALL");
    setFormSelectedCats([]);
    setFormSelectedItems([]);
    setFormFirstOrderOnly(false);
    setFormStartsAt("");
    setFormEndsAt("");
    setFormMaxUsesTotal("");
    setFormMaxUsesPerCustomer("");
    setFormStatus("ACTIVE");
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: PromotionItem) => {
    setEditingId(p.id);
    setFormCode(p.code);
    setFormName(p.name);
    setFormDescription(p.description || "");
    setFormDiscountType(p.discountType);
    setFormDiscountValue(String(p.discountValue));
    setFormMinOrderSubtotal(String(p.minOrderSubtotal));
    setFormMaxDiscountAmount(p.maxDiscountAmount ? String(p.maxDiscountAmount) : "");
    setFormAppliesTo(p.appliesTo);
    setFormSelectedCats(p.eligibleCategoryIds || []);
    setFormSelectedItems(p.eligibleItemIds || []);
    setFormFirstOrderOnly(p.firstOrderOnly);
    setFormStartsAt(p.startsAt ? p.startsAt.slice(0, 16) : "");
    setFormEndsAt(p.endsAt ? p.endsAt.slice(0, 16) : "");
    setFormMaxUsesTotal(p.maxUsesTotal ? String(p.maxUsesTotal) : "");
    setFormMaxUsesPerCustomer(p.maxUsesPerCustomer ? String(p.maxUsesPerCustomer) : "");
    setFormStatus(p.status === "ACTIVE" ? "ACTIVE" : "DISABLED");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSavePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalSubmitting(true);
    setFormError(null);

    try {
      const payload: Record<string, unknown> = {
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        description: formDescription.trim() || null,
        discountType: formDiscountType,
        discountValue: Number(formDiscountValue),
        minOrderSubtotal: Number(formMinOrderSubtotal) || 0,
        maxDiscountAmount: formMaxDiscountAmount ? Number(formMaxDiscountAmount) : null,
        appliesTo: formAppliesTo,
        eligibleCategoryIds: formAppliesTo === "CATEGORIES" ? formSelectedCats : [],
        eligibleItemIds: formAppliesTo === "ITEMS" ? formSelectedItems : [],
        firstOrderOnly: formFirstOrderOnly,
        startsAt: formStartsAt ? new Date(formStartsAt).toISOString() : null,
        endsAt: formEndsAt ? new Date(formEndsAt).toISOString() : null,
        maxUsesTotal: formMaxUsesTotal ? parseInt(formMaxUsesTotal, 10) : null,
        maxUsesPerCustomer: formMaxUsesPerCustomer ? parseInt(formMaxUsesPerCustomer, 10) : null,
        status: formStatus,
      };

      const url = editingId
        ? `/api/v1/promotions/${editingId}?restaurantId=${restaurantId}`
        : `/api/v1/promotions?restaurantId=${restaurantId}`;
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save promotion");
      }

      setModalOpen(false);
      await fetchPromotions();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error saving promotion");
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleToggleStatus = async (p: PromotionItem) => {
    if (!canManage) return;
    const newStatus = p.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      const res = await fetch(`/api/v1/promotions/${p.id}?restaurantId=${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update status");
        return;
      }
      await fetchPromotions();
    } catch (err) {
      console.error("Toggle status error:", err);
    }
  };

  const handleArchive = async (p: PromotionItem) => {
    if (!canManage) return;
    if (!confirm(`Are you sure you want to archive "${p.code}"? It will no longer be redeemable.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/promotions/${p.id}?restaurantId=${restaurantId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to archive promotion");
        return;
      }
      await fetchPromotions();
    } catch (err) {
      console.error("Archive error:", err);
    }
  };

  const viewRedemptions = async (p: PromotionItem) => {
    setInspectingPromo(p);
    setRedemptionsModalOpen(true);
    setRedemptionsLoading(true);
    try {
      const res = await fetch(`/api/v1/promotions/${p.id}?restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error("Failed to load redemptions");
      const data = await res.json();
      setRedemptionsList(data.redemptions || []);
    } catch (err) {
      console.error("viewRedemptions error:", err);
    } finally {
      setRedemptionsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Promotions & Coupons
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
              Food Orders
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Create promotional coupon codes, percentage/fixed discounts, and usage limits for {restaurantName}.
          </p>
        </div>

        {canManage && (
          <Button
            onClick={openCreateModal}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Promotion
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Active Coupons</span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Tag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {summary.activeCount}
              </span>
              <span className="text-xs text-muted-foreground">
                / {summary.maxPromotions} allowed ({summary.planName})
              </span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Redemptions</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-foreground">
                {summary.totalRedemptions}
              </span>
              <span className="text-xs text-muted-foreground ml-2">orders discounted</span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Savings Given</span>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-foreground">
                {formatCurrency(summary.totalDiscountGranted)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">in customer discounts</span>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Configured Coupons</span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-foreground">
                {summary.totalPromotions}
              </span>
              <span className="text-xs text-muted-foreground ml-2">total configured</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {["ALL", "ACTIVE", "DISABLED", "ARCHIVED"].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                statusFilter === tab
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search coupon code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-muted border border-border rounded-lg text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Promotions List */}
      <div className="bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Loading promotions...
          </div>
        ) : promotions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Tag className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No promotions found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search
                ? "No promotion matched your search query."
                : "Create promotional codes to offer customer discounts on digital table orders."}
            </p>
            {canManage && (
              <Button onClick={openCreateModal} size="sm" className="mt-2">
                <Plus className="w-4 h-4 mr-1" /> Create Your First Promotion
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {promotions.map((p) => {
              const stateBadge =
                p.effectiveState === "ACTIVE"
                  ? { bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", label: "Active" }
                  : p.effectiveState === "SCHEDULED"
                  ? { bg: "bg-blue-500/10 text-blue-600 border-blue-500/20", label: "Scheduled" }
                  : p.effectiveState === "EXPIRED"
                  ? { bg: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Expired" }
                  : p.effectiveState === "LIMIT_REACHED"
                  ? { bg: "bg-purple-500/10 text-purple-600 border-purple-500/20", label: "Limit Reached" }
                  : p.effectiveState === "DISABLED"
                  ? { bg: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20", label: "Disabled" }
                  : { bg: "bg-red-500/10 text-red-600 border-red-500/20", label: "Archived" };

              return (
                <div
                  key={p.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-md tracking-wider">
                        {p.code}
                      </span>
                      <h3 className="font-semibold text-foreground text-sm">{p.name}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${stateBadge.bg}`}
                      >
                        {stateBadge.label}
                      </span>
                      {p.firstOrderOnly && (
                        <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                          First Order Only
                        </span>
                      )}
                    </div>

                    {p.description && (
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                      <span className="font-medium text-foreground">
                        {p.discountType === "PERCENTAGE"
                          ? `${p.discountValue}% OFF`
                          : `${formatCurrency(p.discountValue)} OFF`}
                        {p.maxDiscountAmount && (
                          <span className="text-muted-foreground font-normal ml-1">
                            (max {formatCurrency(p.maxDiscountAmount)})
                          </span>
                        )}
                      </span>

                      {p.minOrderSubtotal > 0 && (
                        <span>Min subtotal: {formatCurrency(p.minOrderSubtotal)}</span>
                      )}

                      <span>
                        Applies to:{" "}
                        <strong className="text-foreground font-medium">
                          {p.appliesTo === "ALL"
                            ? "All Items"
                            : p.appliesTo === "CATEGORIES"
                            ? `${p.eligibleCategoryIds.length} Categories`
                            : `${p.eligibleItemIds.length} Menu Items`}
                        </strong>
                      </span>

                      <span>
                        Usage:{" "}
                        <strong className="text-foreground font-medium">
                          {p.currentUses}
                        </strong>
                        {p.maxUsesTotal ? ` / ${p.maxUsesTotal}` : " (Unlimited)"}
                      </span>

                      {p.endsAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Ends {new Date(p.endsAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Metrics */}
                  <div className="flex flex-wrap items-center gap-2 lg:self-center">
                    <button
                      onClick={() => viewRedemptions(p)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-surface-muted text-foreground transition-colors"
                      title="View redemptions"
                    >
                      <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{p.appliedRedemptions} redemptions</span>
                    </button>

                    {canManage && p.status !== "ARCHIVED" && (
                      <>
                        <button
                          onClick={() => handleToggleStatus(p)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                            p.status === "ACTIVE"
                              ? "border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                              : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          }`}
                        >
                          {p.status === "ACTIVE" ? "Disable" : "Enable"}
                        </button>

                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 rounded-lg border border-border hover:bg-surface-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit promotion"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleArchive(p)}
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                          title="Archive promotion"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Promotion Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-2xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {editingId ? "Edit Promotion" : "Create New Promotion"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure discount rules and usage conditions for customer QR orders.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePromotion} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Coupon Code *</Label>
                  <Input
                    placeholder="e.g. WELCOME20"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    required
                    className="font-mono text-xs uppercase"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Uppercase letters, numbers, hyphens, underscores (3-24 chars).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Promotion Name *</Label>
                  <Input
                    placeholder="e.g. Welcome Discount"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description (Optional)</Label>
                <Input
                  placeholder="e.g. 20% off on all starters for new guests"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Discount Type and Value */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 rounded-lg bg-surface-muted/50 border border-border">
                <div className="space-y-1.5">
                  <Label className="text-xs">Discount Type</Label>
                  <select
                    value={formDiscountType}
                    onChange={(e) =>
                      setFormDiscountType(e.target.value as "PERCENTAGE" | "FIXED")
                    }
                    className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-foreground"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount ({currency})</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {formDiscountType === "PERCENTAGE" ? "Percentage (%)" : `Amount (${currency})`} *
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={formDiscountType === "PERCENTAGE" ? "100" : undefined}
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Max Discount Cap ({currency})
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="None (uncapped)"
                    value={formMaxDiscountAmount}
                    onChange={(e) => setFormMaxDiscountAmount(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Scope (Applies to) */}
              <div className="space-y-2">
                <Label className="text-xs">Applies To</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "ALL", label: "All Items" },
                    { id: "CATEGORIES", label: "Specific Categories" },
                    { id: "ITEMS", label: "Specific Items" },
                  ].map((sc) => (
                    <button
                      type="button"
                      key={sc.id}
                      onClick={() => setFormAppliesTo(sc.id as "ALL" | "CATEGORIES" | "ITEMS")}
                      className={`py-2 px-3 text-xs rounded-lg border font-medium transition-colors ${
                        formAppliesTo === sc.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-surface border-border text-foreground hover:bg-surface-muted"
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>

                {formAppliesTo === "CATEGORIES" && (
                  <div className="p-3 rounded-lg border border-border bg-surface-muted/30 space-y-2 mt-2">
                    <p className="text-xs font-medium text-foreground">Select Eligible Categories:</p>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                      {categories.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formSelectedCats.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormSelectedCats([...formSelectedCats, c.id]);
                              } else {
                                setFormSelectedCats(formSelectedCats.filter((id) => id !== c.id));
                              }
                            }}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {formAppliesTo === "ITEMS" && (
                  <div className="p-3 rounded-lg border border-border bg-surface-muted/30 space-y-2 mt-2">
                    <p className="text-xs font-medium text-foreground">Select Eligible Menu Items:</p>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                      {menuItems.map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formSelectedItems.includes(m.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormSelectedItems([...formSelectedItems, m.id]);
                              } else {
                                setFormSelectedItems(formSelectedItems.filter((id) => id !== m.id));
                              }
                            }}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="truncate">{m.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Conditions & Usage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Minimum Order Subtotal ({currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formMinOrderSubtotal}
                    onChange={(e) => setFormMinOrderSubtotal(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="firstOrderOnly"
                    checked={formFirstOrderOnly}
                    onChange={(e) => setFormFirstOrderOnly(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="firstOrderOnly" className="text-xs cursor-pointer">
                    First Order Only (verified patron)
                  </Label>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Max Total Redemptions</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={formMaxUsesTotal}
                    onChange={(e) => setFormMaxUsesTotal(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Max Uses Per Customer</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={formMaxUsesPerCustomer}
                    onChange={(e) => setFormMaxUsesPerCustomer(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Start Date/Time (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">End Date/Time (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={modalSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={modalSubmitting}>
                  {modalSubmitting ? "Saving..." : editingId ? "Update Promotion" : "Create Promotion"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Redemptions Inspector Modal */}
      {redemptionsModalOpen && inspectingPromo && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface border border-border rounded-xl shadow-xl max-w-3xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    Redemption History: {inspectingPromo.code}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded font-mono bg-primary/10 text-primary">
                    {inspectingPromo.name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Orders where this coupon code was applied.
                </p>
              </div>
              <button
                onClick={() => setRedemptionsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {redemptionsLoading ? (
                <p className="text-center py-8 text-xs text-muted-foreground">
                  Loading redemption records...
                </p>
              ) : redemptionsList.length === 0 ? (
                <p className="text-center py-8 text-xs text-muted-foreground">
                  No orders have redeemed this coupon yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-surface-muted text-muted-foreground border-b border-border">
                      <tr>
                        <th className="py-2 px-3">Order</th>
                        <th className="py-2 px-3">Table</th>
                        <th className="py-2 px-3 text-right">Eligible Subtotal</th>
                        <th className="py-2 px-3 text-right">Discount</th>
                        <th className="py-2 px-3 text-right">Order Total</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {redemptionsList.map((r) => (
                        <tr key={r.id} className="hover:bg-surface-muted/50">
                          <td className="py-2.5 px-3 font-semibold font-mono text-foreground">
                            {r.orderNumber}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{r.tableName}</td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            {formatCurrency(r.eligibleSubtotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                            -{formatCurrency(r.discountAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                            {formatCurrency(r.orderTotal)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                r.status === "APPLIED"
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : "bg-zinc-500/10 text-zinc-600"
                              }`}
                            >
                              {r.status}
                              {r.releasedReason ? ` (${r.releasedReason})` : ""}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 bg-surface-muted/50 border-t border-border flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRedemptionsModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
