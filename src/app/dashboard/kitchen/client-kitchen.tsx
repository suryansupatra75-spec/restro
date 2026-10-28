"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { 
  RefreshCw, ChefHat, CheckCircle2, 
  AlertCircle, Clock, Play,
  LucideIcon, Volume2, VolumeX, Printer
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
interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  tax: number;
  total: number;
  specialInstructions: string | null;
  createdAt: string;
  table: Table;
  items: OrderItem[];
}

function ElapsedTime({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => setElapsed(formatDistanceToNow(new Date(createdAt), { addSuffix: true }));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return <span className="font-medium">{elapsed}</span>;
}

export function ClientKitchenDisplay({ currency = "USD" }: { currency?: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null); // Track which order is updating
  const [mobileTab, setMobileTab] = useState<"INCOMING" | "PREPARING" | "READY">("INCOMING");
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  const hasMountedRef = useRef(false);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIsSoundOn(soundNotifier.isEnabled());
  }, []);

  const fetchOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/orders/admin?status=ACTIVE`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);

        if (hasMountedRef.current) {
          const hasNewIncoming = (data.orders as Order[]).some(
            (o) => !seenOrderIdsRef.current.has(o.id) && (o.status === "PENDING" || o.status === "ACCEPTED")
          );
          if (hasNewIncoming) {
            soundNotifier.playNewOrderChime();
          }
        }
        hasMountedRef.current = true;
        seenOrderIdsRef.current = new Set((data.orders as Order[]).map((o) => o.id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("restaurant-live-orders");
        channel.onmessage = () => {
          fetchOrders(true);
        };
      }
    } catch {
      // Ignore BroadcastChannel errors
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOrders(true);
      }
    }, 5000); // Poll every 5 seconds when visible; complemented by instant BroadcastChannel triggers

    const handleLiveSignal = () => {
      if (document.visibilityState === "visible") {
        fetchOrders(true);
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
  }, [fetchOrders]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setIsUpdating(orderId);
    // Instant optimistic update — prevents any flickering or flapping between columns
    const previousOrders = [...orders];
    const isTerminal = ["COMPLETED", "REJECTED", "CANCELLED"].includes(newStatus);
    if (isTerminal) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    }

    try {
      const res = await fetch(`/api/v1/orders/admin/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update status");
        setOrders(previousOrders); // rollback
      } else {
        const data = await res.json();
        if (!isTerminal && data.order) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...data.order } : o));
        }
        try {
          if (typeof BroadcastChannel !== "undefined") {
            const bc = new BroadcastChannel("restaurant-live-orders");
            bc.postMessage({ type: "ORDER_UPDATED", orderId, status: newStatus, ts: Date.now() });
            bc.close();
          }
        } catch {
          // Ignore
        }
        window.dispatchEvent(new Event("restaurant:notifications-local-sync"));
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
      setOrders(previousOrders); // rollback
    } finally {
      setIsUpdating(null);
    }
  };

  const incomingOrders = orders.filter(o => o.status === "PENDING" || o.status === "ACCEPTED");
  const preparingOrders = orders.filter(o => o.status === "PREPARING");
  const readyOrders = orders.filter(o => o.status === "READY");

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const renderOrderCard = (order: Order, primaryAction: { label: string, status: string, icon: LucideIcon, color: string } | null) => (
    <div key={order.id} className="bg-surface border border-border rounded-xl flex flex-col shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className={`p-3 border-b border-border flex justify-between items-center text-primary-foreground ${
        order.status === "PENDING" ? "bg-yellow-600" :
        order.status === "ACCEPTED" ? "bg-blue-600" :
        order.status === "PREPARING" ? "bg-purple-600" :
        "bg-green-600"
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg leading-none">{order.orderNumber}</h3>
            {order.paymentStatus === "PAID" ? (
              <span className="text-[10px] font-extrabold bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-xs">
                PAID
              </span>
            ) : (
              <span className="text-[10px] font-bold bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded shadow-xs">
                PAY AT COUNTER
              </span>
            )}
          </div>
          <p className="text-xs opacity-90 mt-1">Table {order.table.name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPrintingOrder(order)}
            className="w-7 h-7 rounded bg-black/20 hover:bg-black/35 flex items-center justify-center text-white cursor-pointer transition"
            title="Print KOT"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 text-xs font-semibold bg-black/20 px-2 py-1 rounded">
            <Clock className="w-3 h-3" />
            <ElapsedTime createdAt={order.createdAt} />
          </div>
        </div>
      </div>

      {/* Body - Items */}
      <div className="p-4 flex-1 overflow-y-auto bg-background/50 space-y-3">
        {order.specialInstructions && (
          <div className="bg-warning/10 text-warning-foreground p-2 rounded-lg text-sm font-medium flex gap-2 mb-2 border border-warning/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{order.specialInstructions}</span>
          </div>
        )}

        <ul className="space-y-3">
          {order.items.map(item => (
            <li key={item.id} className="text-sm">
              <div className="flex items-start gap-2 font-bold text-foreground">
                <span className="bg-surface-muted px-1.5 rounded text-muted-foreground border border-border">{item.quantity}x</span>
                <span>{item.name}</span>
              </div>
              
              {(item.selectedVariant || item.selectedAddons.length > 0) && (
                <div className="pl-8 text-xs text-muted-foreground mt-1 space-y-0.5">
                  {item.selectedVariant && <div>• {item.selectedVariant.name}</div>}
                  {item.selectedAddons.map(a => <div key={a.name}>+ {a.name}</div>)}
                </div>
              )}
              {item.specialInstructions && (
                <div className="pl-8 mt-1">
                  <span className="text-xs italic bg-warning/10 text-warning-foreground px-2 py-0.5 rounded border-l-2 border-warning inline-block">
                    &quot;{item.specialInstructions}&quot;
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Footer / Action */}
      {primaryAction && (
        <div className="p-3 bg-surface border-t border-border">
          <Button 
            className={`w-full text-white font-bold ${primaryAction.color}`}
            disabled={isUpdating === order.id}
            onClick={() => handleStatusUpdate(order.id, primaryAction.status)}
          >
            {isUpdating === order.id ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <primaryAction.icon className="w-4 h-4 mr-2" />
            )}
            {primaryAction.label}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top Controls: Sound Alert & Refresh */}
      <div className="flex items-center justify-between pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 px-2.5 text-xs font-bold gap-1.5 cursor-pointer ${
              isSoundOn ? "text-primary border-primary/30" : "text-muted-foreground"
            }`}
            onClick={() => {
              const next = !isSoundOn;
              soundNotifier.setEnabled(next);
              setIsSoundOn(next);
              if (next) soundNotifier.playNewOrderChime();
            }}
            title={isSoundOn ? "Order sound alerts enabled" : "Order sound alerts muted"}
          >
            {isSoundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{isSoundOn ? "Audio On" : "Muted"}</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs font-bold gap-1.5 cursor-pointer"
            onClick={() => fetchOrders(false)}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Mobile Column Switcher (Visible on < md) */}
      <div className="md:hidden flex gap-1 p-1 bg-surface-muted rounded-xl border border-border mb-3 shrink-0">
        <button
          onClick={() => setMobileTab("INCOMING")}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === "INCOMING"
              ? "bg-surface text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Incoming</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            mobileTab === "INCOMING" ? "bg-yellow-100 text-yellow-800" : "bg-surface text-muted-foreground"
          }`}>
            {incomingOrders.length}
          </span>
        </button>

        <button
          onClick={() => setMobileTab("PREPARING")}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === "PREPARING"
              ? "bg-surface text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Prep</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            mobileTab === "PREPARING" ? "bg-purple-100 text-purple-800" : "bg-surface text-muted-foreground"
          }`}>
            {preparingOrders.length}
          </span>
        </button>

        <button
          onClick={() => setMobileTab("READY")}
          className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            mobileTab === "READY"
              ? "bg-surface text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Ready</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            mobileTab === "READY" ? "bg-green-100 text-green-800" : "bg-surface text-muted-foreground"
          }`}>
            {readyOrders.length}
          </span>
        </button>
      </div>

      {/* Main KDS Columns Container */}
      <div className="flex-1 overflow-y-auto md:overflow-x-auto pb-4">
        {/* Desktop Kanban: 3 Columns side-by-side (>= md) */}
        {/* Mobile: Active Column takes 100% width (< md) */}
        <div className="flex flex-col md:flex-row gap-4 h-full md:min-w-[900px]">
          {/* Column 1: Incoming */}
          <div className={`flex-1 flex-col bg-surface-muted/50 rounded-2xl p-3.5 sm:p-4 border border-border/50 ${
            mobileTab === "INCOMING" ? "flex" : "hidden md:flex"
          }`}>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                Incoming <span className="bg-surface border border-border text-xs sm:text-sm px-2 py-0.5 rounded-full">{incomingOrders.length}</span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {incomingOrders.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-12">No incoming orders</p>
              )}
              {incomingOrders.map(order => 
                renderOrderCard(order, { 
                  label: "Start Preparing", 
                  status: "PREPARING", 
                  icon: Play, 
                  color: "bg-purple-600 hover:bg-purple-700" 
                })
              )}
            </div>
          </div>

          {/* Column 2: Preparing */}
          <div className={`flex-1 flex-col bg-surface-muted/50 rounded-2xl p-3.5 sm:p-4 border border-border/50 ${
            mobileTab === "PREPARING" ? "flex" : "hidden md:flex"
          }`}>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                Preparing <span className="bg-surface border border-border text-xs sm:text-sm px-2 py-0.5 rounded-full">{preparingOrders.length}</span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {preparingOrders.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-12">No orders preparing</p>
              )}
              {preparingOrders.map(order => 
                renderOrderCard(order, { 
                  label: "Mark Ready", 
                  status: "READY", 
                  icon: ChefHat, 
                  color: "bg-green-600 hover:bg-green-700" 
                })
              )}
            </div>
          </div>

          {/* Column 3: Ready */}
          <div className={`flex-1 flex-col bg-surface-muted/50 rounded-2xl p-3.5 sm:p-4 border border-border/50 ${
            mobileTab === "READY" ? "flex" : "hidden md:flex"
          }`}>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                Ready <span className="bg-surface border border-border text-xs sm:text-sm px-2 py-0.5 rounded-full">{readyOrders.length}</span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {readyOrders.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-12">No orders waiting</p>
              )}
              {readyOrders.map(order => 
                renderOrderCard(order, { 
                  label: "Complete Order", 
                  status: "COMPLETED", 
                  icon: CheckCircle2, 
                  color: "bg-neutral-800 hover:bg-neutral-900" 
                })
              )}
            </div>
          </div>
        </div>
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
