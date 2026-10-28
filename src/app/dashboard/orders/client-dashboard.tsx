"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format } from "date-fns";
import { 
  Search, RefreshCw, CheckCircle2, Clock, ChefHat, 
  Check, X, AlertCircle, ShoppingCart, Banknote,
  Printer, Volume2, VolumeX, Tag, BellRing
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { soundNotifier } from "@/lib/sound";
import { OrderReceiptModal } from "@/components/dashboard/order-receipt-modal";

interface OrderItemVariant { name: string; price: number; }
interface OrderItemAddon { name: string; price: number; }
interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions: string | null;
  selectedVariant: OrderItemVariant | null;
  selectedAddons: OrderItemAddon[];
}
interface Table { name: string; }
interface Payment {
  id: string;
  status: string;
  amount: number;
  provider: string;
  paymentMethod: string | null;
  paidAt: string | null;
}
interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  couponCode?: string | null;
  promotionNameSnapshot?: string | null;
  discountAmount?: number;
  tax: number;
  total: number;
  specialInstructions: string | null;
  createdAt: string;
  table: Table;
  items: OrderItem[];
  payments?: Payment[];
}

interface ServiceRequest {
  id: string;
  tableName: string;
  requestType: string;
  message: string;
  priority: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ACCEPTED: "bg-blue-100 text-blue-800 border-blue-200",
  PREPARING: "bg-purple-100 text-purple-800 border-purple-200",
  READY: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-neutral-100 text-neutral-800 border-neutral-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
};

export function ClientOrderDashboard({ currency }: { currency: string }) {
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [activeSubFilter, setActiveSubFilter] = useState<"ALL" | "PENDING" | "ACCEPTED" | "PREPARING" | "READY">("ALL");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);

  const hasMountedRef = useRef(false);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const seenRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIsSoundOn(soundNotifier.isEnabled());
  }, []);

  const fetchServiceRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/tables/call-waiter", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const requests = data.requests || [];
        setServiceRequests(requests);

        // Audible service call alert when new table calls arrive
        if (hasMountedRef.current && requests.length > 0) {
          const hasNewCall = requests.some((r: ServiceRequest) => !seenRequestIdsRef.current.has(r.id));
          if (hasNewCall) {
            soundNotifier.playServiceCallChime();
          }
        }
        seenRequestIdsRef.current = new Set(requests.map((r: ServiceRequest) => r.id));
      }
    } catch {
      // ignore
    }
  }, []);

  const handleResolveRequest = async (requestId: string) => {
    setServiceRequests((prev) => prev.filter((r) => r.id !== requestId));
    try {
      await fetch("/api/v1/tables/call-waiter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
    } catch {
      fetchServiceRequests();
    }
  };

  const handleResolveAllRequests = async () => {
    setServiceRequests([]);
    try {
      await fetch("/api/v1/tables/call-waiter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolveAll: true }),
      });
    } catch {
      fetchServiceRequests();
    }
  };

  const fetchOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch(
        `/api/v1/orders/admin?status=${activeTab}&search=${encodeURIComponent(search)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
        
        if (hasMountedRef.current && activeTab === "ACTIVE") {
          const hasIncoming = (data.orders as Order[]).some(
            (o) => !seenOrderIdsRef.current.has(o.id) && (o.status === "PENDING" || o.status === "ACCEPTED")
          );
          if (hasIncoming) {
            soundNotifier.playNewOrderChime();
          }
        }
        hasMountedRef.current = true;
        seenOrderIdsRef.current = new Set((data.orders as Order[]).map((o) => o.id));
        
        // Update selected order reference if it exists
        setSelectedOrder(current => {
          if (!current) return null;
          const updated = data.orders.find((o: Order) => o.id === current.id);
          return updated ? updated : current;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [activeTab, search]);

  // Initial fetch and manual search
  useEffect(() => {
    fetchOrders();
    fetchServiceRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Only fetch on mount and tab change, not on every search keystroke

  // Realtime Polling + BroadcastChannel + Notification Event Bridge + Visibility Catch-up
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("restaurant-live-orders");
        channel.onmessage = () => {
          fetchOrders(true);
          fetchServiceRequests();
        };
      }
    } catch {
      // Ignore BroadcastChannel unsupported errors
    }

    // Only poll active orders
    if (activeTab !== "ACTIVE") {
      return () => {
        if (channel) channel.close();
      };
    }
    
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOrders(true);
        fetchServiceRequests();
      }
    }, 5000); // 5 seconds interval; complemented by instant BroadcastChannel triggers

    const handleLiveSignal = () => {
      if (document.visibilityState === "visible") {
        fetchOrders(true);
        fetchServiceRequests();
      }
    };

    document.addEventListener("visibilitychange", handleLiveSignal);
    window.addEventListener("focus", handleLiveSignal);
    window.addEventListener("online", handleLiveSignal);
    window.addEventListener("restaurant:notifications-updated", handleLiveSignal);

    return () => {
      clearInterval(interval);
      if (channel) channel.close();
      document.removeEventListener("visibilitychange", handleLiveSignal);
      window.removeEventListener("focus", handleLiveSignal);
      window.removeEventListener("online", handleLiveSignal);
      window.removeEventListener("restaurant:notifications-updated", handleLiveSignal);
    };
  }, [activeTab, fetchOrders]);

  const broadcastLiveOrderChange = (orderId: string, status?: string, paymentStatus?: string) => {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("restaurant-live-orders");
        bc.postMessage({ type: "ORDER_UPDATED", orderId, status, paymentStatus, ts: Date.now() });
        bc.close();
      }
    } catch {
      // Ignore
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setIsUpdating(true);
    const previousOrders = [...orders];
    const previousSelected = selectedOrder;
    const movesOutOfActive = activeTab === "ACTIVE" && ["COMPLETED", "REJECTED"].includes(newStatus);

    // Optimistic UI update immediately (0ms perceived latency)
    if (movesOutOfActive) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      setSelectedOrder(curr => (curr && curr.id === orderId ? null : curr));
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      setSelectedOrder(curr => curr && curr.id === orderId ? { ...curr, status: newStatus } : curr);
    }

    try {
      const res = await fetch(`/api/v1/orders/admin/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const data = await res.json();
        if (!movesOutOfActive && data.order) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...data.order } : o));
          setSelectedOrder(curr => curr && curr.id === orderId ? { ...curr, ...data.order } : curr);
        }
        broadcastLiveOrderChange(orderId, newStatus);
        window.dispatchEvent(new Event("restaurant:notifications-local-sync"));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update status");
        setOrders(previousOrders);
        setSelectedOrder(previousSelected);
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
      setOrders(previousOrders);
      setSelectedOrder(previousSelected);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePaymentSettle = async (orderId: string) => {
    setIsUpdating(true);
    const previousOrders = [...orders];
    const previousSelected = selectedOrder;
    // Optimistic update for instant feedback
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentStatus: "PAID" } : o));
    setSelectedOrder(curr => curr && curr.id === orderId ? { ...curr, paymentStatus: "PAID" } : curr);

    try {
      const res = await fetch(`/api/v1/orders/admin/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "PAID" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...data.order } : o));
          setSelectedOrder(curr => curr && curr.id === orderId ? { ...curr, ...data.order } : curr);
        }
        broadcastLiveOrderChange(orderId, undefined, "PAID");
        window.dispatchEvent(new Event("restaurant:notifications-local-sync"));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update payment status");
        setOrders(previousOrders);
        setSelectedOrder(previousSelected);
      }
    } catch (e) {
      console.error(e);
      setOrders(previousOrders);
      setSelectedOrder(previousSelected);
      alert("Network error updating payment status");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const pendingCount = useMemo(() => orders.filter((o) => o.status === "PENDING").length, [orders]);
  const acceptedCount = useMemo(() => orders.filter((o) => o.status === "ACCEPTED").length, [orders]);
  const preparingCount = useMemo(() => orders.filter((o) => o.status === "PREPARING").length, [orders]);
  const readyCount = useMemo(() => orders.filter((o) => o.status === "READY").length, [orders]);

  const displayedOrders = useMemo(() => {
    if (activeTab === "HISTORY") return orders;
    if (activeSubFilter === "ALL") return orders;
    return orders.filter((o) => o.status === activeSubFilter);
  }, [orders, activeTab, activeSubFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[calc(100dvh-11rem)] h-[calc(100dvh-11rem)] lg:h-[calc(100vh-8rem)]">
      {/* Left Pane: List */}
      <div className={`w-full lg:w-1/2 flex flex-col bg-surface border border-border rounded-xl overflow-hidden shadow-sm ${
        selectedOrder ? "hidden lg:flex" : "flex"
      }`}>
        {/* Active Table Service Calls Dock (from Table QR) */}
        {serviceRequests.length > 0 && (
          <div className="bg-amber-500/10 border-b border-amber-200 p-3 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase tracking-wider">
                <BellRing className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                <span>Active Table Service Calls ({serviceRequests.length})</span>
              </div>
              <button
                onClick={handleResolveAllRequests}
                className="text-[11px] font-bold text-amber-700 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
              {serviceRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-amber-200/80 rounded-xl px-3 py-2 flex items-center justify-between shadow-2xs text-xs"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-extrabold text-neutral-900 shrink-0">
                      Table {req.tableName}
                    </span>
                    <span className="text-neutral-500 truncate text-[11px]">
                      {req.message}
                    </span>
                  </div>
                  <button
                    onClick={() => handleResolveRequest(req.id)}
                    className="ml-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer shrink-0"
                  >
                    ✓ Attend
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters & Search */}
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab("ACTIVE")}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "ACTIVE" ? "bg-primary text-primary-foreground" : "bg-surface-muted hover:bg-border"}`}
            >
              Active Orders
            </button>
            <button 
              onClick={() => setActiveTab("HISTORY")}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "HISTORY" ? "bg-primary text-primary-foreground" : "bg-surface-muted hover:bg-border"}`}
            >
              History
            </button>
          </div>
          
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search order # or table..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className={`w-10 h-10 p-0 flex items-center justify-center shrink-0 cursor-pointer ${isSoundOn ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => {
                const next = !isSoundOn;
                soundNotifier.setEnabled(next);
                setIsSoundOn(next);
                if (next) soundNotifier.playNewOrderChime();
              }}
              title={isSoundOn ? "Sound Alerts: On" : "Sound Alerts: Muted"}
            >
              {isSoundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button type="button" variant="outline" className="w-10 h-10 p-0 flex items-center justify-center shrink-0 cursor-pointer" onClick={() => fetchOrders(true)}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>

          {/* Quick Sub-Filter Pills for Active Orders */}
          {activeTab === "ACTIVE" && orders.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveSubFilter("ALL")}
                className={`px-3 py-1 rounded-full font-bold transition cursor-pointer shrink-0 ${
                  activeSubFilter === "ALL"
                    ? "bg-neutral-900 text-white"
                    : "bg-surface-muted text-muted-foreground hover:bg-neutral-200"
                }`}
              >
                All Active ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubFilter("PENDING")}
                className={`px-2.5 py-1 rounded-full font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeSubFilter === "PENDING"
                    ? "bg-yellow-600 text-white"
                    : "bg-yellow-50 text-yellow-800 border border-yellow-200 hover:bg-yellow-100"
                }`}
              >
                {pendingCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />}
                <span>New ({pendingCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubFilter("ACCEPTED")}
                className={`px-2.5 py-1 rounded-full font-bold transition cursor-pointer shrink-0 ${
                  activeSubFilter === "ACCEPTED"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                }`}
              >
                Accepted ({acceptedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubFilter("PREPARING")}
                className={`px-2.5 py-1 rounded-full font-bold transition cursor-pointer shrink-0 ${
                  activeSubFilter === "PREPARING"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100"
                }`}
              >
                In Kitchen ({preparingCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubFilter("READY")}
                className={`px-2.5 py-1 rounded-full font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeSubFilter === "READY"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {readyCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                <span>Ready ({readyCount})</span>
              </button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-muted/30">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground/50">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="font-semibold text-foreground">No orders found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === "ACTIVE" 
                  ? activeSubFilter !== "ALL"
                    ? `No active orders currently in ${activeSubFilter} status.`
                    : "Waiting for new orders to arrive." 
                  : "No historical orders found."}
              </p>
            </div>
          ) : (
            displayedOrders.map(order => (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrder(order)}
                className={`bg-surface border p-4 rounded-xl cursor-pointer transition-all hover:shadow-md ${
                  selectedOrder?.id === order.id ? "border-primary ring-1 ring-primary" : "border-border"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-bold text-lg">{order.orderNumber}</span>
                    <span className="text-muted-foreground text-sm ml-2">• Table {order.table.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-800"}`}>
                      {order.status}
                    </span>
                    {order.paymentStatus === "PAID" ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        PAID
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        UNPAID
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-between items-end mt-4">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {format(new Date(order.createdAt), "h:mm a")}
                    <span className="ml-2 font-medium text-foreground">{order.items.reduce((acc, i) => acc + i.quantity, 0)} items</span>
                  </div>
                  <div className="font-bold">
                    {formatMoney(Number(order.total))}
                  </div>
                </div>

                {order.specialInstructions && (
                  <div className="mt-3 bg-warning/10 text-warning-foreground p-2 rounded text-xs font-medium flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">{order.specialInstructions}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Pane: Details */}
      <div className={`w-full lg:w-1/2 bg-surface border border-border rounded-xl flex flex-col shadow-sm ${
        selectedOrder ? "flex" : "hidden lg:flex"
      }`}>
        {selectedOrder ? (
          <div className="flex flex-col h-full">
            {/* Detail Header */}
            <div className="p-4 sm:p-6 border-b border-border flex justify-between items-start bg-surface-muted/50 rounded-t-xl gap-2">
              <div className="flex items-start gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden shrink-0 mt-0.5 h-8 px-2.5 font-bold"
                  onClick={() => setSelectedOrder(null)}
                >
                  ← Back
                </Button>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{selectedOrder.orderNumber}</h2>
                  <p className="text-muted-foreground font-medium mt-0.5 text-xs sm:text-sm">Table {selectedOrder.table.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Placed at {format(new Date(selectedOrder.createdAt), "MMM d, h:mm a")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-bold gap-1 cursor-pointer"
                  onClick={() => setPrintingOrder(selectedOrder)}
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </Button>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${STATUS_COLORS[selectedOrder.status] || "bg-gray-100 text-gray-800"}`}>
                  {selectedOrder.status}
                </span>
              </div>
            </div>

            {/* Visual Order Lifecycle Stepper */}
            {!["REJECTED", "CANCELLED"].includes(selectedOrder.status) ? (
              <div className="px-4 py-3 bg-surface-muted/30 border-b border-border/80">
                <div className="flex items-center justify-between max-w-sm sm:max-w-md mx-auto text-xs">
                  {/* Step 1: Received */}
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-emerald-600 text-white shadow-2xs">
                      ✓
                    </div>
                    <span className="text-[10px] font-bold text-neutral-700">Received</span>
                  </div>
                  <div className={`h-0.5 flex-1 mx-1.5 -mt-3.5 transition-colors ${
                    ["ACCEPTED", "PREPARING", "READY", "COMPLETED"].includes(selectedOrder.status)
                      ? "bg-emerald-600"
                      : "bg-neutral-200"
                  }`} />

                  {/* Step 2: Accepted */}
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                      ["PREPARING", "READY", "COMPLETED"].includes(selectedOrder.status)
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : selectedOrder.status === "ACCEPTED"
                          ? "bg-blue-600 text-white ring-2 ring-blue-300"
                          : "bg-neutral-200 text-neutral-500"
                    }`}>
                      {["PREPARING", "READY", "COMPLETED"].includes(selectedOrder.status) ? "✓" : "2"}
                    </div>
                    <span className="text-[10px] font-bold text-neutral-700">Accepted</span>
                  </div>
                  <div className={`h-0.5 flex-1 mx-1.5 -mt-3.5 transition-colors ${
                    ["PREPARING", "READY", "COMPLETED"].includes(selectedOrder.status)
                      ? "bg-emerald-600"
                      : "bg-neutral-200"
                  }`} />

                  {/* Step 3: Kitchen */}
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                      ["READY", "COMPLETED"].includes(selectedOrder.status)
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : selectedOrder.status === "PREPARING"
                          ? "bg-purple-600 text-white ring-2 ring-purple-300"
                          : "bg-neutral-200 text-neutral-500"
                    }`}>
                      {["READY", "COMPLETED"].includes(selectedOrder.status) ? "✓" : "3"}
                    </div>
                    <span className="text-[10px] font-bold text-neutral-700">Kitchen</span>
                  </div>
                  <div className={`h-0.5 flex-1 mx-1.5 -mt-3.5 transition-colors ${
                    ["READY", "COMPLETED"].includes(selectedOrder.status)
                      ? "bg-emerald-600"
                      : "bg-neutral-200"
                  }`} />

                  {/* Step 4: Ready */}
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                      selectedOrder.status === "COMPLETED"
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : selectedOrder.status === "READY"
                          ? "bg-emerald-600 text-white ring-2 ring-emerald-300 animate-pulse"
                          : "bg-neutral-200 text-neutral-500"
                    }`}>
                      {selectedOrder.status === "COMPLETED" ? "✓" : "4"}
                    </div>
                    <span className="text-[10px] font-bold text-neutral-700">Ready</span>
                  </div>
                  <div className={`h-0.5 flex-1 mx-1.5 -mt-3.5 transition-colors ${
                    selectedOrder.status === "COMPLETED"
                      ? "bg-emerald-600"
                      : "bg-neutral-200"
                  }`} />

                  {/* Step 5: Served */}
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                      selectedOrder.status === "COMPLETED"
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-200 text-neutral-500"
                    }`}>
                      {selectedOrder.status === "COMPLETED" ? "✓" : "5"}
                    </div>
                    <span className="text-[10px] font-bold text-neutral-700">Served</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-center text-xs font-bold text-red-700">
                ⚠️ Order marked as {selectedOrder.status}
              </div>
            )}

            {/* Action Bar */}
            <div className="p-4 border-b border-border bg-surface flex flex-wrap gap-2">
              {selectedOrder.status === "PENDING" && (
                <>
                  <Button 
                    className="flex-1 bg-blue-600 hover:bg-blue-700" 
                    disabled={isUpdating}
                    onClick={() => handleStatusUpdate(selectedOrder.id, "ACCEPTED")}
                  >
                    <Check className="w-4 h-4 mr-2" /> Accept Order
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isUpdating}
                    onClick={() => handleStatusUpdate(selectedOrder.id, "REJECTED")}
                  >
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </>
              )}
              {selectedOrder.status === "ACCEPTED" && (
                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700" 
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(selectedOrder.id, "PREPARING")}
                >
                  <ChefHat className="w-4 h-4 mr-2" /> Start Preparing
                </Button>
              )}
              {selectedOrder.status === "PREPARING" && (
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700" 
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(selectedOrder.id, "READY")}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Ready
                </Button>
              )}
              {selectedOrder.status === "READY" && (
                <Button 
                  className="w-full" 
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(selectedOrder.id, "COMPLETED")}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Order
                </Button>
              )}
              {["COMPLETED", "REJECTED", "CANCELLED"].includes(selectedOrder.status) && (
                <div className="w-full text-center py-2 text-sm font-medium text-muted-foreground bg-surface-muted rounded-lg">
                  Order Closed
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedOrder.specialInstructions && (
                <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
                  <h4 className="font-semibold text-warning-foreground mb-1 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Order Note
                  </h4>
                  <p className="text-sm text-warning-foreground/90">{selectedOrder.specialInstructions}</p>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-lg border-b border-border pb-2 mb-4">Items ({selectedOrder.items.reduce((acc, i) => acc + i.quantity, 0)})</h3>
                <div className="space-y-4">
                  {selectedOrder.items.map(item => (
                    <div key={item.id} className="flex gap-4 p-3 rounded-lg hover:bg-surface-muted/50 transition-colors">
                      <div className="w-8 h-8 shrink-0 bg-primary/10 text-primary font-bold rounded flex items-center justify-center">
                        {item.quantity}x
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold">{item.name}</span>
                          <span className="font-medium text-sm">
                            {formatMoney(Number(item.price) * item.quantity)}
                          </span>
                        </div>
                        
                        {(item.selectedVariant || item.selectedAddons.length > 0) && (
                          <div className="mt-1 text-sm text-muted-foreground">
                            {item.selectedVariant && <p>Variant: {item.selectedVariant.name}</p>}
                            {item.selectedAddons.length > 0 && (
                              <p>Add-ons: {item.selectedAddons.map(a => a.name).join(", ")}</p>
                            )}
                          </div>
                        )}
                        {item.specialInstructions && (
                          <p className="mt-2 text-sm italic bg-surface-muted px-2 py-1 rounded border-l-2 border-warning inline-block">
                            &quot;{item.specialInstructions}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Totals & Payment Settlement */}
            <div className="p-4 sm:p-6 border-t border-border bg-surface-muted/30 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2.5 py-2.5 px-3.5 bg-surface rounded-xl border border-border">
                <div>
                  <span className="text-[11px] text-muted-foreground block font-bold uppercase tracking-wider">Payment Status</span>
                  {selectedOrder.paymentStatus === "PAID" ? (
                    <span className="text-xs font-extrabold text-emerald-600 flex items-center gap-1 mt-0.5">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      PAID ({selectedOrder.payments?.[0]?.paymentMethod || "ONLINE"})
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 block mt-0.5">
                      UNPAID (Pending Settlement)
                    </span>
                  )}
                </div>

                {selectedOrder.paymentStatus !== "PAID" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 font-bold cursor-pointer w-full sm:w-auto"
                    disabled={isUpdating}
                    onClick={() => handlePaymentSettle(selectedOrder.id)}
                  >
                    <Banknote className="w-3.5 h-3.5 mr-1" />
                    Mark as Paid (Cash)
                  </Button>
                )}
              </div>

              <div className="flex justify-between text-sm mb-1 text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(Number(selectedOrder.subtotal))}</span>
              </div>
              {selectedOrder.couponCode && Number(selectedOrder.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-sm mb-1 text-emerald-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Coupon ({selectedOrder.couponCode})
                  </span>
                  <span className="font-bold">-{formatMoney(Number(selectedOrder.discountAmount))}</span>
                </div>
              )}
              <div className="flex justify-between text-sm mb-2 text-muted-foreground">
                <span>Tax</span>
                <span>{formatMoney(Number(selectedOrder.tax))}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span>{formatMoney(Number(selectedOrder.total))}</span>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-20 h-20 bg-surface-muted rounded-full flex items-center justify-center mb-4">
              <ShoppingCart className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">Select an order</h3>
            <p className="text-sm mt-2 max-w-xs">
              Click on an order from the list to view its details and update status.
            </p>
          </div>
        )}
      </div>

      {printingOrder && (
        <OrderReceiptModal
          order={printingOrder}
          restaurantName="Restaurant"
          currency={currency}
          onClose={() => setPrintingOrder(null)}
        />
      )}
    </div>
  );
}
