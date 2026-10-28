"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Boxes, Package, AlertTriangle, XCircle, DollarSign,
  Plus, ArrowDownToLine, SlidersHorizontal, History, 
  Search, Filter, RefreshCw, X, ChevronRight, Eye,
  BookOpen, Trash2, Edit2, CheckCircle2, ArrowUpRight, ArrowDownLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffRole, hasPermission } from "@/lib/permissions";
import { INVENTORY_UNITS, UNIT_LABELS } from "@/lib/validations/inventory";

interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  costPerUnit: number | null;
  totalValuation: number | null;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string | null;
  type: string;
  quantityChange: number;
  resultingBalance: number;
  unit: string;
  costPerUnit: number | null;
  reason: string | null;
  actorName: string | null;
  orderId: string | null;
  createdAt: string;
}

interface RecipeItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  currentStock: number;
  quantity: number;
  unit: string;
}

interface ClientInventoryProps {
  restaurantId: string;
  role: StaffRole;
  currency?: string;
}

export function ClientInventory({ restaurantId, role, currency = "USD" }: ClientInventoryProps) {
  const canCreate = hasPermission(role, "inventory.create");
  const canUpdate = hasPermission(role, "inventory.update");
  const canReceive = hasPermission(role, "inventory.receive");
  const canAdjust = hasPermission(role, "inventory.adjust");
  const canViewHistory = hasPermission(role, "inventory.viewHistory");
  const canManageRecipes = hasPermission(role, "inventory.manageRecipes");
  const canViewCosts = hasPermission(role, "inventory.viewCosts");

  // Tab navigation
  const [activeTab, setActiveTab] = useState<"items" | "movements" | "recipes">("items");

  // Items State
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState({
    totalItemsCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalValuation: null as number | null,
  });
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Movements State
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsTotalPages, setMovementsTotalPages] = useState(1);
  const [movementTypeFilter, setMovementTypeFilter] = useState("ALL");

  // Recipes State
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Target item for quick modals
  const [actionItem, setActionItem] = useState<InventoryItem | null>(null);

  // Feedback state
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Item Form State
  const [newItemName, setNewItemName] = useState("");
  const [newItemSku, setNewItemSku] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("PIECE");
  const [newItemOpeningStock, setNewItemOpeningStock] = useState("0");
  const [newItemThreshold, setNewItemThreshold] = useState("5");
  const [newItemCost, setNewItemCost] = useState("0");

  // Receive Stock Form State
  const [receiveItemId, setReceiveItemId] = useState("");
  const [receiveQuantity, setReceiveQuantity] = useState("");
  const [receiveUnit, setReceiveUnit] = useState("");
  const [receiveCost, setReceiveCost] = useState("");
  const [receiveReason, setReceiveReason] = useState("");

  // Adjust / Waste Form State
  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustType, setAdjustType] = useState<"ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE" | "WASTE">("ADJUSTMENT_INCREASE");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustUnit, setAdjustUnit] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Recipe Form State
  const [menuItemsList, setMenuItemsList] = useState<any[]>([]);
  const [recipeMenuItemId, setRecipeMenuItemId] = useState("");
  const [recipeInventoryItemId, setRecipeInventoryItemId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("1");
  const [recipeUnit, setRecipeUnit] = useState("");

  // 1. Fetch Items
  const fetchItems = useCallback(async () => {
    setIsLoadingItems(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        status: statusFilter,
        sortBy: "name",
        sortOrder: "asc",
      });
      if (search.trim()) params.append("search", search.trim());
      if (selectedCategory !== "ALL") params.append("category", selectedCategory);

      const res = await fetch(`/api/v1/inventory?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setCategories(data.categories || []);
        setSummary(data.summary);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingItems(false);
    }
  }, [page, search, selectedCategory, statusFilter]);

  // 2. Fetch Movements
  const fetchMovements = useCallback(async () => {
    setIsLoadingMovements(true);
    try {
      const params = new URLSearchParams({
        page: movementsPage.toString(),
        limit: "20",
      });
      if (movementTypeFilter !== "ALL") params.append("type", movementTypeFilter);

      const res = await fetch(`/api/v1/inventory/movements?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMovements(data.movements);
        setMovementsTotalPages(data.pagination.totalPages);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMovements(false);
    }
  }, [movementsPage, movementTypeFilter]);

  // 3. Fetch Recipes
  const fetchRecipes = useCallback(async () => {
    setIsLoadingRecipes(true);
    try {
      const res = await fetch(`/api/v1/inventory/recipes`);
      if (res.ok) {
        const data = await res.json();
        setRecipes(data.recipes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingRecipes(false);
    }
  }, []);

  // Fetch Menu Items for Recipe Modal
  const fetchMenuItems = async () => {
    try {
      const res = await fetch(`/api/v1/menu/items`);
      if (res.ok) {
        const data = await res.json();
        setMenuItemsList(data.items || data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (activeTab === "movements") {
      fetchMovements();
    } else if (activeTab === "recipes") {
      fetchRecipes();
    }
  }, [activeTab, fetchMovements, fetchRecipes]);

  // Open Item Detail
  const handleViewDetail = async (item: InventoryItem) => {
    setIsLoadingDetail(true);
    setSelectedItemDetail(null);
    try {
      const res = await fetch(`/api/v1/inventory/${item.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedItemDetail(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Safe Deactivate / Delete Item
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Are you sure you want to deactivate/delete this inventory item?")) return;
    try {
      const res = await fetch(`/api/v1/inventory/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedItemDetail(null);
        fetchItems();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to remove item");
      }
    } catch {
      alert("Network error");
    }
  };

  // Submit Add Item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItemName,
          sku: newItemSku || null,
          category: newItemCategory || null,
          unit: newItemUnit,
          openingStock: parseFloat(newItemOpeningStock) || 0,
          lowStockThreshold: parseFloat(newItemThreshold) || 0,
          costPerUnit: parseFloat(newItemCost) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create item");
      } else {
        setShowAddModal(false);
        setNewItemName("");
        setNewItemSku("");
        setNewItemCategory("");
        setNewItemOpeningStock("0");
        fetchItems();
      }
    } catch {
      setFormError("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Receive Stock
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/inventory/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: receiveItemId,
          type: "STOCK_RECEIVED",
          quantity: parseFloat(receiveQuantity),
          unit: receiveUnit,
          costPerUnit: receiveCost ? parseFloat(receiveCost) : null,
          reason: receiveReason || "Received delivery",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to record stock receipt");
      } else {
        setShowReceiveModal(false);
        setReceiveQuantity("");
        setReceiveReason("");
        fetchItems();
        if (activeTab === "movements") fetchMovements();
      }
    } catch {
      setFormError("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Adjust / Waste
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/inventory/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: adjustItemId,
          type: adjustType,
          quantity: parseFloat(adjustQuantity),
          unit: adjustUnit,
          reason: adjustReason || "Stock adjustment",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to record adjustment");
      } else {
        setShowAdjustModal(false);
        setAdjustQuantity("");
        setAdjustReason("");
        fetchItems();
        if (activeTab === "movements") fetchMovements();
      }
    } catch {
      setFormError("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Recipe Mapping
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/inventory/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: recipeMenuItemId,
          inventoryItemId: recipeInventoryItemId,
          quantity: parseFloat(recipeQuantity),
          unit: recipeUnit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save recipe mapping");
      } else {
        setShowRecipeModal(false);
        setRecipeQuantity("1");
        fetchRecipes();
      }
    } catch {
      setFormError("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Recipe Mapping
  const handleDeleteRecipe = async (recipeId: string) => {
    if (!confirm("Remove this ingredient from recipe?")) return;
    try {
      const res = await fetch(`/api/v1/inventory/recipes/${recipeId}`, { method: "DELETE" });
      if (res.ok) {
        fetchRecipes();
      } else {
        alert("Failed to delete recipe");
      }
    } catch {
      alert("Network error");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Boxes className="w-8 h-8 text-primary" />
            Inventory & Stock
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track ingredients, monitor stock levels, receive shipments, and audit movement history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canReceive && (
            <Button
              onClick={() => {
                setFormError(null);
                if (items.length > 0) {
                  setReceiveItemId(items[0].id);
                  setReceiveUnit(items[0].unit);
                }
                setShowReceiveModal(true);
              }}
              variant="outline"
              className="flex items-center gap-1.5"
            >
              <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
              Receive Stock
            </Button>
          )}

          {canCreate && (
            <Button
              onClick={() => {
                setFormError(null);
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Items</p>
            <p className="text-xl sm:text-2xl font-bold mt-1">{summary.totalItemsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Low Stock</p>
            <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">{summary.lowStockCount}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Out of Stock</p>
            <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">{summary.outOfStockCount}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valuation</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
              {canViewCosts
                ? summary.totalValuation !== null
                  ? `${currency === "USD" ? "$" : currency + " "}${summary.totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"
                : "••••"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-6">
        <button
          onClick={() => setActiveTab("items")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "items"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Stock Items ({items.length})
        </button>

        {canViewHistory && (
          <button
            onClick={() => setActiveTab("movements")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "movements"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="w-4 h-4" />
            Movement Ledger
          </button>
        )}

        {canManageRecipes && (
          <button
            onClick={() => setActiveTab("recipes")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "recipes"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Menu Recipes
          </button>
        )}
      </div>

      {/* TAB 1: ITEMS */}
      {activeTab === "items" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-surface p-3 rounded-xl border border-border">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search items by name, SKU, or category..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-surface-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="text-sm bg-surface-muted border border-border rounded-lg px-3 py-2"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="text-sm bg-surface-muted border border-border rounded-lg px-3 py-2"
              >
                <option value="ALL">All Stock Statuses</option>
                <option value="LOW_STOCK">Low Stock Only</option>
                <option value="OUT_OF_STOCK">Out of Stock Only</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Table / Cards */}
          {isLoadingItems ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span>Loading inventory items...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center bg-surface rounded-xl border border-border">
              <Boxes className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg">No inventory items found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {search ? "No items matched your search query." : "Start by adding raw ingredients and supplies to track stock."}
              </p>
              {canCreate && !search && (
                <Button onClick={() => setShowAddModal(true)} className="mt-4 bg-primary text-white">
                  Add First Item
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-muted text-xs text-muted-foreground uppercase border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Current Stock</th>
                      <th className="px-4 py-3 text-right">Threshold</th>
                      {canViewCosts && <th className="px-4 py-3 text-right">Cost / Unit</th>}
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{item.name}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.category || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {item.currentStock} <span className="text-xs text-muted-foreground font-normal">{UNIT_LABELS[item.unit as keyof typeof UNIT_LABELS] || item.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {item.lowStockThreshold} {UNIT_LABELS[item.unit as keyof typeof UNIT_LABELS] || item.unit}
                        </td>
                        {canViewCosts && (
                          <td className="px-4 py-3 text-right">
                            {item.costPerUnit ? `$${item.costPerUnit.toFixed(2)}` : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          {item.stockStatus === "OUT_OF_STOCK" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Out of Stock
                            </span>
                          ) : item.stockStatus === "LOW_STOCK" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleViewDetail(item)}
                            className="p-1.5 hover:bg-surface-muted rounded-md text-muted-foreground hover:text-foreground"
                            title="View Detail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canReceive && (
                            <button
                              onClick={() => {
                                setReceiveItemId(item.id);
                                setReceiveUnit(item.unit);
                                setShowReceiveModal(true);
                              }}
                              className="p-1.5 hover:bg-emerald-50 rounded-md text-emerald-600"
                              title="Receive Stock"
                            >
                              <ArrowDownToLine className="w-4 h-4" />
                            </button>
                          )}
                          {canAdjust && (
                            <button
                              onClick={() => {
                                setAdjustItemId(item.id);
                                setAdjustUnit(item.unit);
                                setShowAdjustModal(true);
                              }}
                              className="p-1.5 hover:bg-amber-50 rounded-md text-amber-600"
                              title="Adjust / Waste"
                            >
                              <SlidersHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {items.map((item) => (
                  <div key={item.id} className="bg-surface p-4 rounded-xl border border-border shadow-sm space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-foreground">{item.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {item.sku && <span>SKU: {item.sku}</span>}
                          {item.category && <span>• {item.category}</span>}
                        </div>
                      </div>

                      {item.stockStatus === "OUT_OF_STOCK" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Out of Stock
                        </span>
                      ) : item.stockStatus === "LOW_STOCK" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Low Stock
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          In Stock
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-surface-muted p-2 rounded-lg">
                      <div>
                        <span className="text-muted-foreground">Current Stock:</span>
                        <div className="font-semibold text-sm">
                          {item.currentStock} {UNIT_LABELS[item.unit as keyof typeof UNIT_LABELS] || item.unit}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Threshold:</span>
                        <div className="font-semibold text-sm">
                          {item.lowStockThreshold} {UNIT_LABELS[item.unit as keyof typeof UNIT_LABELS] || item.unit}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetail(item)}
                        className="text-xs h-8"
                      >
                        Details
                      </Button>
                      {canReceive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReceiveItemId(item.id);
                            setReceiveUnit(item.unit);
                            setShowReceiveModal(true);
                          }}
                          className="text-xs h-8 text-emerald-600 border-emerald-200"
                        >
                          Receive
                        </Button>
                      )}
                      {canAdjust && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAdjustItemId(item.id);
                            setAdjustUnit(item.unit);
                            setShowAdjustModal(true);
                          }}
                          className="text-xs h-8 text-amber-600 border-amber-200"
                        >
                          Adjust
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: MOVEMENT LEDGER */}
      {activeTab === "movements" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface p-3 rounded-xl border border-border">
            <div className="text-sm font-medium">Audit Ledger ({movements.length} logged)</div>
            <select
              value={movementTypeFilter}
              onChange={(e) => {
                setMovementTypeFilter(e.target.value);
                setMovementsPage(1);
              }}
              className="text-sm bg-surface-muted border border-border rounded-lg px-3 py-2"
            >
              <option value="ALL">All Movement Types</option>
              <option value="STOCK_RECEIVED">Stock Received</option>
              <option value="ORDER_DEDUCTION">Order Deduction</option>
              <option value="WASTE">Waste</option>
              <option value="ADJUSTMENT_INCREASE">Adjustment (+)</option>
              <option value="ADJUSTMENT_DECREASE">Adjustment (-)</option>
              <option value="OPENING_STOCK">Opening Stock</option>
              <option value="REVERSAL">Reversal</option>
            </select>
          </div>

          {isLoadingMovements ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span>Loading movement ledger...</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="p-12 text-center bg-surface rounded-xl border border-border text-muted-foreground">
              No stock movements recorded yet.
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-muted text-xs text-muted-foreground uppercase border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Movement Type</th>
                      <th className="px-4 py-3 text-right">Change</th>
                      <th className="px-4 py-3 text-right">Resulting Stock</th>
                      <th className="px-4 py-3">Reason / Note</th>
                      <th className="px-4 py-3">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {m.itemName}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            m.type === "STOCK_RECEIVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : m.type === "ORDER_DEDUCTION"
                              ? "bg-blue-100 text-blue-800"
                              : m.type === "WASTE"
                              ? "bg-red-100 text-red-800"
                              : m.type === "REVERSAL"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-stone-100 text-stone-800"
                          }`}>
                            {m.type.replace("_", " ")}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          m.quantityChange > 0 ? "text-emerald-600" : "text-stone-700"
                        }`}>
                          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange} {UNIT_LABELS[m.unit as keyof typeof UNIT_LABELS] || m.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {m.resultingBalance} {UNIT_LABELS[m.unit as keyof typeof UNIT_LABELS] || m.unit}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {m.reason || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {m.actorName || "System"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RECIPES */}
      {activeTab === "recipes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface p-3 rounded-xl border border-border">
            <div>
              <div className="text-sm font-medium">Menu Recipes ({recipes.length} mapped)</div>
              <p className="text-xs text-muted-foreground">
                Ingredient quantities automatically deducted when an order is accepted by kitchen.
              </p>
            </div>
            {canManageRecipes && (
              <Button
                onClick={() => {
                  fetchMenuItems();
                  if (items.length > 0) setRecipeInventoryItemId(items[0].id);
                  setShowRecipeModal(true);
                }}
                size="sm"
                className="bg-primary text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                Map Recipe
              </Button>
            )}
          </div>

          {isLoadingRecipes ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span>Loading recipe mappings...</span>
            </div>
          ) : recipes.length === 0 ? (
            <div className="p-12 text-center bg-surface rounded-xl border border-border text-muted-foreground">
              No menu recipes defined yet. Link menu items to inventory ingredients for automatic deduction.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recipes.map((r) => (
                <div key={r.id} className="bg-surface p-4 rounded-xl border border-border shadow-sm flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">{r.menuItemName}</h4>
                    <p className="text-xs text-muted-foreground mt-1">Consumes ingredient:</p>
                    <div className="text-sm font-medium text-primary mt-0.5">
                      {r.quantity} {UNIT_LABELS[r.unit as keyof typeof UNIT_LABELS] || r.unit} of {r.inventoryItemName}
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      In Stock: {r.currentStock} {UNIT_LABELS[r.unit as keyof typeof UNIT_LABELS] || r.unit}
                    </div>
                  </div>

                  {canManageRecipes && (
                    <button
                      onClick={() => handleDeleteRecipe(r.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="Remove mapping"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DETAIL SLIDE-OVER DRAWER */}
      {selectedItemDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-surface h-full shadow-2xl flex flex-col p-6 overflow-y-auto animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-xl font-bold">{selectedItemDetail.item.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedItemDetail.item.category || "Uncategorized"} • SKU: {selectedItemDetail.item.sku || "N/A"}
                </p>
              </div>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="p-1.5 hover:bg-surface-muted rounded-full"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-surface-muted p-3 rounded-xl">
                <div>
                  <span className="text-xs text-muted-foreground">Current Stock</span>
                  <div className="text-lg font-bold">
                    {selectedItemDetail.item.currentStock} {selectedItemDetail.item.unit}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Low Stock Threshold</span>
                  <div className="text-lg font-bold">
                    {selectedItemDetail.item.lowStockThreshold} {selectedItemDetail.item.unit}
                  </div>
                </div>
                {canViewCosts && (
                  <>
                    <div>
                      <span className="text-xs text-muted-foreground">Cost Per Unit</span>
                      <div className="text-lg font-bold">
                        ${selectedItemDetail.item.costPerUnit || 0}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Total Valuation</span>
                      <div className="text-lg font-bold text-emerald-600">
                        ${selectedItemDetail.item.totalValuation || 0}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Linked Recipes */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Used in Menu Recipes ({selectedItemDetail.linkedRecipes.length})</h4>
                {selectedItemDetail.linkedRecipes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not currently linked to any menu items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedItemDetail.linkedRecipes.map((r: any) => (
                      <div key={r.id} className="text-xs bg-surface-muted p-2 rounded flex justify-between">
                        <span>{r.menuItemName}</span>
                        <span className="font-semibold">{r.quantity} {r.unit} / order</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Movements */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Recent Movements Log</h4>
                {selectedItemDetail.recentMovements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No movements recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedItemDetail.recentMovements.map((m: any) => (
                      <div key={m.id} className="text-xs border border-border p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="font-medium">{m.type.replace("_", " ")}</span>
                          <span className="text-muted-foreground ml-2">{new Date(m.createdAt).toLocaleDateString()}</span>
                          {m.reason && <p className="text-stone-500">{m.reason}</p>}
                        </div>
                        <div className="text-right">
                          <div className={m.quantityChange > 0 ? "text-emerald-600 font-semibold" : "font-semibold"}>
                            {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                          </div>
                          <span className="text-stone-400">Bal: {m.resultingBalance}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-border flex justify-between">
              {canUpdate && (
                <Button
                  variant="outline"
                  onClick={() => handleDeleteItem(selectedItemDetail.item.id)}
                  className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                >
                  Deactivate Item
                </Button>
              )}
              <Button onClick={() => setSelectedItemDetail(null)} className="ml-auto text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD ITEM */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-lg">Add Inventory Item</h3>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg mt-3">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddItem} className="space-y-3 mt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whole Milk, Mozzarella, Burger Buns"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                  <input
                    type="text"
                    placeholder="Dairy, Meat, Bakery"
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">SKU / Code</label>
                  <input
                    type="text"
                    placeholder="Optional SKU"
                    value={newItemSku}
                    onChange={(e) => setNewItemSku(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Unit of Measure *</label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u} value={u}>{u} ({UNIT_LABELS[u]})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Low Stock Alert Level</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemThreshold}
                    onChange={(e) => setNewItemThreshold(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Initial Opening Stock</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemOpeningStock}
                    onChange={(e) => setNewItemOpeningStock(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
                {canViewCosts && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Cost Per Unit ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newItemCost}
                      onChange={(e) => setNewItemCost(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border mt-4">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-primary text-white">
                  {isSubmitting ? "Saving..." : "Create Item"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECEIVE STOCK */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
                Receive Stock
              </h3>
              <button onClick={() => setShowReceiveModal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg mt-3">
                {formError}
              </div>
            )}

            <form onSubmit={handleReceiveStock} className="space-y-3 mt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Select Item *</label>
                <select
                  required
                  value={receiveItemId}
                  onChange={(e) => {
                    setReceiveItemId(e.target.value);
                    const itm = items.find((i) => i.id === e.target.value);
                    if (itm) setReceiveUnit(itm.unit);
                  }}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} (Current: {i.currentStock} {i.unit})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity Received *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 25"
                    value={receiveQuantity}
                    onChange={(e) => setReceiveQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Unit *</label>
                  <select
                    value={receiveUnit}
                    onChange={(e) => setReceiveUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {canViewCosts && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cost Per Unit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional purchase cost"
                    value={receiveCost}
                    onChange={(e) => setReceiveCost(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Delivery / Supplier Note</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly dairy delivery from Metro"
                  value={receiveReason}
                  onChange={(e) => setReceiveReason(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border mt-4">
                <Button type="button" variant="outline" onClick={() => setShowReceiveModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {isSubmitting ? "Saving..." : "Confirm Stock Receipt"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADJUST / WASTE */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-amber-600" />
                Record Adjustment or Waste
              </h3>
              <button onClick={() => setShowAdjustModal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg mt-3">
                {formError}
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-3 mt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Select Item *</label>
                <select
                  required
                  value={adjustItemId}
                  onChange={(e) => {
                    setAdjustItemId(e.target.value);
                    const itm = items.find((i) => i.id === e.target.value);
                    if (itm) setAdjustUnit(itm.unit);
                  }}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} (Current: {i.currentStock} {i.unit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Action Type *</label>
                <select
                  value={adjustType}
                  onChange={(e: any) => setAdjustType(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                >
                  <option value="ADJUSTMENT_INCREASE">Stock Increase (Count Correction +)</option>
                  <option value="ADJUSTMENT_DECREASE">Stock Decrease (Count Correction -)</option>
                  <option value="WASTE">Spoilage / Waste / Damage (-)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 2.5"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Unit *</label>
                  <select
                    value={adjustUnit}
                    onChange={(e) => setAdjustUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reason / Note *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dropped jar, monthly audit recount"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border mt-4">
                <Button type="button" variant="outline" onClick={() => setShowAdjustModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-amber-600 text-white hover:bg-amber-700">
                  {isSubmitting ? "Saving..." : "Confirm Movement"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RECIPE MAPPING */}
      {showRecipeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Map Menu Item to Ingredient
              </h3>
              <button onClick={() => setShowRecipeModal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg mt-3">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveRecipe} className="space-y-3 mt-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Menu Item *</label>
                <select
                  required
                  value={recipeMenuItemId}
                  onChange={(e) => setRecipeMenuItemId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                >
                  <option value="">Select Menu Item...</option>
                  {menuItemsList.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Inventory Ingredient *</label>
                <select
                  required
                  value={recipeInventoryItemId}
                  onChange={(e) => {
                    setRecipeInventoryItemId(e.target.value);
                    const itm = items.find((i) => i.id === e.target.value);
                    if (itm) setRecipeUnit(itm.unit);
                  }}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity per Order *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 150"
                    value={recipeQuantity}
                    onChange={(e) => setRecipeQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Unit *</label>
                  <select
                    value={recipeUnit}
                    onChange={(e) => setRecipeUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg"
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border mt-4">
                <Button type="button" variant="outline" onClick={() => setShowRecipeModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-primary text-white">
                  {isSubmitting ? "Saving..." : "Save Recipe"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
