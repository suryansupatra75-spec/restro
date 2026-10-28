"use client";

import { useState, useMemo } from "react";
import {
  Users,
  X,
  Plus,
  Minus,
  Sparkles,
  Copy,
  Check,
  Share2,
  Heart,
  CreditCard,
  DollarSign,
  ArrowRight,
} from "lucide-react";

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  tableName: string;
  restaurantName: string;
  orderNumber?: string | null;
  accentColor?: string;
}

export function SplitBillModal({
  isOpen,
  onClose,
  subtotal,
  tax,
  total,
  currency,
  tableName,
  restaurantName,
  orderNumber,
  accentColor = "#E85D2A",
}: SplitBillModalProps) {
  const [splitCount, setSplitCount] = useState(2);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(15);
  const [customTip, setCustomTip] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [paidShares, setPaidShares] = useState<Set<number>>(new Set([0])); // Person 0 ("You")

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(val);
  };

  const baseTotal = useMemo(() => {
    return total > 0 ? total : subtotal + tax;
  }, [total, subtotal, tax]);

  const tipAmount = useMemo(() => {
    if (selectedTipPercent !== null) {
      return (baseTotal * selectedTipPercent) / 100;
    }
    const parsed = parseFloat(customTip);
    return !isNaN(parsed) && parsed > 0 ? parsed : 0;
  }, [baseTotal, selectedTipPercent, customTip]);

  const grandTotal = useMemo(() => {
    return baseTotal + tipAmount;
  }, [baseTotal, tipAmount]);

  const perPersonShare = useMemo(() => {
    if (splitCount <= 0) return 0;
    return grandTotal / splitCount;
  }, [grandTotal, splitCount]);

  const shareText = useMemo(() => {
    const orderText = orderNumber ? ` (Order #${orderNumber})` : "";
    return `🍽️ Table ${tableName} Bill Split at ${restaurantName}${orderText}
━━━━━━━━━━━━━━━━━━━
💰 Total Bill: ${formatMoney(grandTotal)}${tipAmount > 0 ? ` (includes ${formatMoney(tipAmount)} tip)` : ""}
👥 Split between ${splitCount} diners:
👉 ${formatMoney(perPersonShare)} per person!

Let's settle up! 💳✨`;
  }, [tableName, restaurantName, orderNumber, grandTotal, tipAmount, splitCount, perPersonShare, formatMoney]);

  const handleCopyBreakdown = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  const togglePersonPaid = (idx: number) => {
    setPaidShares((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-neutral-100 flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom-8 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: accentColor }}
            >
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-neutral-900 leading-tight">
                Split the Bill &amp; Tip
              </h2>
              <p className="text-[11px] font-medium text-neutral-500">
                Table {tableName} • {restaurantName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-200/80 hover:bg-neutral-300 flex items-center justify-center text-neutral-600 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Main Calculation Highlight Card */}
          <div
            className="rounded-3xl p-5 text-white shadow-lg relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, #1c1917 120%)`,
            }}
          >
            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="text-[11px] font-black uppercase tracking-widest opacity-80 mb-1">
                Share Per Person
              </span>
              <div className="text-4xl font-black tracking-tight mb-2 font-mono">
                {formatMoney(perPersonShare)}
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-white">
                <Users className="w-3.5 h-3.5" />
                <span>
                  Split among {splitCount} {splitCount === 1 ? "person" : "friends"}
                </span>
              </div>
            </div>

            {/* Subtle background decoration */}
            <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* Diners Count Counter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-neutral-700">
                Number of Diners
              </label>
              <span className="text-xs font-bold text-neutral-500">
                {splitCount} people
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSplitCount((c) => Math.max(1, c - 1))}
                disabled={splitCount <= 1}
                className="w-12 h-12 rounded-2xl border border-neutral-200 bg-white hover:bg-neutral-50 active:scale-95 disabled:opacity-40 flex items-center justify-center text-neutral-800 transition cursor-pointer shadow-xs"
              >
                <Minus className="w-5 h-5" />
              </button>

              <div className="flex-1 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center font-black text-xl font-mono text-neutral-900 border border-neutral-200/60">
                {splitCount}
              </div>

              <button
                type="button"
                onClick={() => setSplitCount((c) => Math.min(12, c + 1))}
                disabled={splitCount >= 12}
                className="w-12 h-12 rounded-2xl border border-neutral-200 bg-white hover:bg-neutral-50 active:scale-95 disabled:opacity-40 flex items-center justify-center text-neutral-800 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Count Pills */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSplitCount(num)}
                  className={`py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    splitCount === num
                      ? "bg-neutral-900 text-white shadow-xs"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {num} Diners
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Diner Avatar Bubbles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-neutral-700">
                Diners at Table {tableName}
              </span>
              <span className="text-[11px] text-neutral-400">
                Tap to toggle paid
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {Array.from({ length: splitCount }, (_, i) => {
                const isYou = i === 0;
                const isPaid = paidShares.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => togglePersonPaid(i)}
                    className={`p-2.5 rounded-2xl border flex items-center gap-2.5 transition text-left cursor-pointer ${
                      isPaid
                        ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                        : "bg-neutral-50 border-neutral-200/80 text-neutral-700 hover:bg-neutral-100/70"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                        isPaid
                          ? "bg-emerald-500 text-white"
                          : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {isPaid ? <Check className="w-4 h-4 stroke-[3]" /> : i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">
                        {isYou ? "You (Host)" : `Diner ${i + 1}`}
                      </p>
                      <p className="text-[10px] font-mono text-neutral-500 font-semibold">
                        {formatMoney(perPersonShare)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Tip Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                <span>Leave a Tip for Staff</span>
              </span>
              <span className="text-xs font-bold text-neutral-500">
                {formatMoney(tipAmount)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "No Tip", pct: 0 },
                { label: "10%", pct: 10 },
                { label: "15% ⭐", pct: 15 },
                { label: "20%", pct: 20 },
              ].map((tip) => (
                <button
                  key={tip.pct}
                  type="button"
                  onClick={() => {
                    setSelectedTipPercent(tip.pct);
                    setCustomTip("");
                  }}
                  className={`py-2 rounded-2xl text-xs font-bold transition border cursor-pointer ${
                    selectedTipPercent === tip.pct
                      ? "bg-neutral-900 border-neutral-900 text-white shadow-xs"
                      : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {tip.label}
                </button>
              ))}
            </div>

            {/* Custom Tip Input */}
            <div className="relative pt-1">
              <span className="absolute left-3.5 top-3.5 text-neutral-400 font-bold text-xs">
                Custom Tip $
              </span>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="0.00"
                value={customTip}
                onChange={(e) => {
                  setCustomTip(e.target.value);
                  setSelectedTipPercent(null);
                }}
                className="w-full pl-26 pr-4 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-right font-mono font-bold text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Breakdown summary */}
          <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-neutral-500">
              <span>Food &amp; Drinks Subtotal</span>
              <span className="font-mono">{formatMoney(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between text-neutral-500">
                <span>Taxes &amp; Surcharges</span>
                <span className="font-mono">{formatMoney(tax)}</span>
              </div>
            )}
            {tipAmount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Staff Tip</span>
                <span className="font-mono">+{formatMoney(tipAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-neutral-900 font-black pt-1.5 border-t border-neutral-200 text-sm">
              <span>Total Bill</span>
              <span className="font-mono">{formatMoney(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-neutral-100 bg-white space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyBreakdown}
              className="py-3 px-3 rounded-2xl border border-neutral-200 hover:bg-neutral-50 active:scale-95 text-neutral-800 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-neutral-500" />
                  <span>Copy Bill</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share to WhatsApp</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition hover:brightness-105"
            style={{ backgroundColor: accentColor }}
          >
            <span>Done • Settle {formatMoney(perPersonShare)}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
