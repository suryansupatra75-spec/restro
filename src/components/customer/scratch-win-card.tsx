"use client";

import { useState, useEffect } from "react";
import { Sparkles, Gift, Check, Copy, PartyPopper } from "lucide-react";

interface ScratchWinCardProps {
  restaurantId: string;
  orderNumber?: string;
  accentColor?: string;
}

export function ScratchWinCard({
  restaurantId,
}: ScratchWinCardProps) {
  const [isScratched, setIsScratched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [couponCode] = useState("LUCKY15");

  // Load persistence from localStorage
  useEffect(() => {
    try {
      const savedKey = `scratch_win_${restaurantId}`;
      const saved = localStorage.getItem(savedKey);
      if (saved === "scratched") {
        setIsScratched(true);
      }
    } catch {
      // safe fallback
    }
  }, [restaurantId]);

  const handleReveal = () => {
    if (isScratched) return;
    setIsScratched(true);
    try {
      localStorage.setItem(`scratch_win_${restaurantId}`, "scratched");
    } catch {
      // safe fallback
    }
  };

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(couponCode);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(true);
    }
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200/90 p-5 shadow-sm space-y-3.5 relative overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <Gift className="w-4 h-4" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-purple-900">
            Scratch &amp; Win Reward
          </span>
        </div>
        <span className="text-[10px] font-bold text-neutral-400">
          Table Reward
        </span>
      </div>

      <div>
        <h4 className="text-sm font-extrabold text-neutral-900">
          {isScratched
            ? "Congratulations! You Won a Surprise!"
            : "Scratch to Reveal Your Next Visit Reward"}
        </h4>
        <p className="text-xs text-neutral-500">
          {isScratched
            ? "Apply this coupon code on your next visit or online order!"
            : "Swipe or tap the golden card to reveal your mystery prize."}
        </p>
      </div>

      {/* Interactive Scratch Area */}
      <div className="relative min-h-[140px] rounded-2xl overflow-hidden border border-amber-300 flex items-center justify-center p-4">
        {/* Underlying Revealed Reward */}
        <div className="text-center space-y-2 z-10 w-full">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-100 text-amber-600 mb-1">
            <PartyPopper className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <p className="text-base font-black text-neutral-900 tracking-tight">
              🎉 15% OFF Next Meal!
            </p>
            <p className="text-[11px] text-neutral-500">
              Valid on dine-in or takeaway
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="font-mono text-sm font-black px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg tracking-widest">
              {couponCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-2.5 py-1 rounded-lg bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition flex items-center gap-1 cursor-pointer active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Shimmering Foil Overlay if not scratched */}
        {!isScratched && (
          <div
            onClick={handleReveal}
            className="absolute inset-0 z-20 cursor-pointer bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:from-amber-300 hover:to-yellow-400 transition flex flex-col items-center justify-center gap-2 p-4 text-center select-none active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-amber-950 shadow-inner animate-pulse">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-amber-950 uppercase tracking-widest">
                ✨ Tap or Scratch to Reveal ✨
              </p>
              <p className="text-[10px] text-amber-900 font-semibold mt-0.5">
                Exclusive mystery gift for Table guests
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
