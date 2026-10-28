"use client";

import { useRef, useState, useEffect } from "react";
import { Printer, X, Receipt, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

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
  tax: number;
  total: number;
  specialInstructions: string | null;
  createdAt: string;
  table: Table;
  items: OrderItem[];
  payments?: Payment[];
}

interface OrderReceiptModalProps {
  order: Order | null;
  restaurantName: string;
  currency: string;
  onClose: () => void;
}

export function OrderReceiptModal({ order, restaurantName, currency, onClose }: OrderReceiptModalProps) {
  const [printType, setPrintType] = useState<"BILL" | "KOT">("BILL");
  const [customHeader, setCustomHeader] = useState<string | null>(null);
  const [customFooter, setCustomFooter] = useState<string>("Thank you for dining with us!");
  const [taxIdText, setTaxIdText] = useState<string | null>(null);
  const [paperWidth, setPaperWidth] = useState<string>("80mm");
  const [isReprint, setIsReprint] = useState(false);
  const [reprintCount, setReprintCount] = useState(0);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load tenant printer settings if available
    fetch("/api/v1/integrations/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.integrations?.PRINTER?.config) {
          const cfg = data.integrations.PRINTER.config;
          if (cfg.headerText) setCustomHeader(cfg.headerText);
          if (cfg.footerText) setCustomFooter(cfg.footerText);
          if (cfg.taxIdText) setTaxIdText(cfg.taxIdText);
          if (cfg.paperWidth) setPaperWidth(cfg.paperWidth);
        }
      })
      .catch(() => {});
  }, []);

  if (!order) return null;

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
  };

  const handlePrint = async (type: "BILL" | "KOT") => {
    setPrintType(type);
    try {
      const res = await fetch("/api/v1/integrations/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, printType: type }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.printJob?.isReprint) {
          setIsReprint(true);
          setReprintCount(data.printJob.reprintCount);
        }
      }
    } catch {
      // Fallback silently to window.print even if offline
    }

    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      {/* Modal Dialog */}
      <div className="relative bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface-muted/30">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground text-base">Print Bill / KOT</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Toggle */}
        <div className="p-3 bg-surface-muted/50 border-b border-border flex gap-2">
          <button
            type="button"
            onClick={() => setPrintType("BILL")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              printType === "BILL"
                ? "bg-primary text-white shadow-xs"
                : "bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Customer Bill</span>
          </button>
          <button
            type="button"
            onClick={() => setPrintType("KOT")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              printType === "KOT"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            <span>Kitchen Ticket (KOT)</span>
          </button>
        </div>

        {/* Receipt Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-muted/20">
          <div
            ref={receiptRef}
            id="printable-receipt"
            className="bg-white p-5 rounded-xl border border-border/80 shadow-xs text-neutral-900 font-mono text-xs max-w-[320px] mx-auto"
          >
            {/* Header info */}
            <div className="text-center pb-3 border-b border-dashed border-neutral-300">
              <h2 className="font-black text-sm uppercase tracking-wide">{restaurantName}</h2>
              {customHeader && (
                <p className="text-[10px] text-neutral-600 font-medium mt-0.5">{customHeader}</p>
              )}
              {taxIdText && (
                <p className="text-[9px] text-neutral-500 font-mono mt-0.5">GST/TAX ID: {taxIdText}</p>
              )}
              <div className="inline-block mt-1 px-2 py-0.5 rounded font-black text-[11px] bg-neutral-100 text-neutral-800 uppercase">
                {printType === "KOT"
                  ? "KITCHEN ORDER TICKET (KOT)"
                  : taxIdText
                  ? "TAX INVOICE"
                  : "CUSTOMER RECEIPT / BILL"}
              </div>
              {isReprint && (
                <div className="mt-1 px-2 py-0.5 rounded font-black text-[10px] bg-amber-100 text-amber-900 border border-amber-300 uppercase">
                  *** REPRINT #{reprintCount} ***
                </div>
              )}
              <p className="text-[10px] text-neutral-500 mt-1">
                {format(new Date(order.createdAt), "dd MMM yyyy, hh:mm a")}
              </p>
            </div>

            {/* Order & Table Meta */}
            <div className="py-2.5 border-b border-dashed border-neutral-300 flex justify-between text-[11px]">
              <div>
                <span className="font-bold">Order: </span>
                <span>{order.orderNumber}</span>
              </div>
              <div>
                <span className="font-bold">Table: </span>
                <span className="font-black">{order.table.name}</span>
              </div>
            </div>

            {/* Items */}
            <div className="py-3 border-b border-dashed border-neutral-300 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="text-[11px]">
                  <div className="flex justify-between items-start">
                    <span className="font-bold">
                      {item.quantity}x {item.name}
                    </span>
                    {printType === "BILL" && (
                      <span className="shrink-0 ml-2 font-bold">
                        {formatMoney(Number(item.price) * item.quantity)}
                      </span>
                    )}
                  </div>
                  {(item.selectedVariant || item.selectedAddons.length > 0) && (
                    <div className="pl-4 text-[10px] text-neutral-500">
                      {item.selectedVariant && <div>• {item.selectedVariant.name}</div>}
                      {item.selectedAddons.map((a) => (
                        <div key={a.name}>+ {a.name}</div>
                      ))}
                    </div>
                  )}
                  {item.specialInstructions && (
                    <div className="pl-4 text-[10px] text-amber-800 font-semibold italic">
                      Note: &quot;{item.specialInstructions}&quot;
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Note if order-level instructions */}
            {order.specialInstructions && (
              <div className="py-2 border-b border-dashed border-neutral-300 text-[10px] text-amber-800 font-bold">
                Order Note: {order.specialInstructions}
              </div>
            )}

            {/* Totals (Only in Bill) */}
            {printType === "BILL" && (
              <div className="pt-3 space-y-1 text-[11px]">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(Number(order.subtotal))}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Tax</span>
                  <span>{formatMoney(Number(order.tax))}</span>
                </div>
                <div className="flex justify-between font-black text-xs pt-1.5 border-t border-neutral-300 text-neutral-900">
                  <span>TOTAL</span>
                  <span>{formatMoney(Number(order.total))}</span>
                </div>
                <div className="flex justify-between text-[10px] pt-1 text-neutral-500">
                  <span>Payment:</span>
                  <span className="font-bold text-neutral-800">
                    {order.paymentStatus === "PAID"
                      ? `PAID (${order.payments?.[0]?.paymentMethod || "ONLINE"})`
                      : "UNPAID"}
                  </span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 text-center text-[10px] text-neutral-400">
              {printType === "KOT" ? "Fast & Fresh Service" : customFooter}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-border bg-surface flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={`flex-1 text-white gap-2 font-bold ${
              printType === "KOT" ? "bg-purple-600 hover:bg-purple-700" : "bg-primary hover:bg-primary/90"
            }`}
            onClick={() => handlePrint(printType)}
          >
            <Printer className="w-4 h-4" />
            Print {printType === "KOT" ? "KOT" : "Bill"}
          </Button>
        </div>
      </div>
    </div>
  );
}
