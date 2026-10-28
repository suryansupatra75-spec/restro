"use client";

import { useMemo } from "react";
import {
  Package,
  CircleCheck,
  ChefHat,
  Bell,
  Check,
  Clock,
} from "lucide-react";

interface TrackedOrderItem {
  name: string;
  quantity: number;
  variant: { name: string } | null;
  addons: { name: string }[];
}

interface LiveCookingTrackerProps {
  status: string;
  orderNumber: string;
  tableName: string;
  restaurantName: string;
  createdAt?: string;
  items: TrackedOrderItem[];
  total?: number;
  formattedTotal: string;
  accentColor?: string;
}

const STAGES = [
  {
    key: "PENDING",
    label: "Order Placed",
    subtitle: "Sent to kitchen",
    icon: Package,
  },
  {
    key: "PREPARING",
    label: "Cooking in Kitchen",
    subtitle: "Freshly preparing",
    icon: ChefHat,
  },
  {
    key: "READY",
    label: "Plating & Ready",
    subtitle: "Heading to your table",
    icon: Bell,
  },
  {
    key: "COMPLETED",
    label: "Served & Enjoy",
    subtitle: "Bon appétit!",
    icon: Check,
  },
];

export function LiveCookingTracker({
  status,
  orderNumber,
  tableName,
  restaurantName,
  items,
  formattedTotal,
  accentColor = "#E85D2A",
}: LiveCookingTrackerProps) {
  // Map backend status to 4-step progress index
  const activeStep = useMemo(() => {
    switch (status) {
      case "PENDING":
        return 0;
      case "ACCEPTED":
      case "PREPARING":
        return 1;
      case "READY":
        return 2;
      case "COMPLETED":
        return 3;
      default:
        return 0;
    }
  }, [status]);

  // Estimated countdown label
  const estimatedTime = useMemo(() => {
    switch (activeStep) {
      case 0:
        return "~12–15 mins";
      case 1:
        return "~6–10 mins";
      case 2:
        return "1–2 mins (Plating)";
      case 3:
        return "Served";
      default:
        return "~10 mins";
    }
  }, [activeStep]);

  return (
    <div className="w-full space-y-4">
      {/* Live Status Hero Card */}
      <div className="bg-white rounded-3xl border border-neutral-200/90 p-5 shadow-xs relative overflow-hidden">
        {/* Subtle accent glow top border */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: accentColor }}
        />

        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Live Cooking Tracker
            </span>
            <h2 className="text-xl font-black text-neutral-900 tracking-tight">
              Order #{orderNumber}
            </h2>
            <p className="text-xs text-neutral-500 font-medium">
              Table {tableName} • {restaurantName}
            </p>
          </div>

          {activeStep < 3 ? (
            <div className="px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-right">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600">
                Estimated Time
              </span>
              <span className="text-xs font-black flex items-center justify-end gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                {estimatedTime}
              </span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-right">
              <span className="text-xs font-black flex items-center gap-1">
                <CircleCheck className="w-3.5 h-3.5 text-emerald-600" />
                Completed
              </span>
            </div>
          )}
        </div>

        {/* 4-Step Animated Timeline */}
        <div className="py-2">
          {/* Progress bar line */}
          <div className="relative flex items-center justify-between">
            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-neutral-100 -z-0">
              <div
                className="h-full transition-all duration-700 rounded-full"
                style={{
                  width: `${(activeStep / (STAGES.length - 1)) * 100}%`,
                  backgroundColor: accentColor,
                }}
              />
            </div>

            {STAGES.map((stg, idx) => {
              const isPast = idx < activeStep;
              const isCurrent = idx === activeStep;
              const Icon = stg.icon;

              return (
                <div
                  key={stg.key}
                  className="flex flex-col items-center relative z-10"
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isCurrent
                        ? "text-white ring-4 ring-orange-100 shadow-md scale-110"
                        : isPast
                        ? "text-white shadow-xs"
                        : "bg-neutral-100 text-neutral-400 border border-neutral-200"
                    }`}
                    style={
                      isCurrent || isPast
                        ? { backgroundColor: accentColor }
                        : undefined
                    }
                  >
                    <Icon className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step Labels */}
          <div className="grid grid-cols-4 gap-1 pt-3 text-center">
            {STAGES.map((stg, idx) => {
              const isCurrent = idx === activeStep;
              const isPast = idx < activeStep;

              return (
                <div key={stg.key} className="px-0.5">
                  <p
                    className={`text-[11px] font-bold leading-tight ${
                      isCurrent
                        ? "text-neutral-900 font-black"
                        : isPast
                        ? "text-neutral-700"
                        : "text-neutral-400"
                    }`}
                  >
                    {stg.label}
                  </p>
                  <p className="text-[9px] text-neutral-400 mt-0.5 hidden sm:block">
                    {stg.subtitle}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live pulsing hint */}
        {activeStep === 1 && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-200 flex items-center gap-2.5 text-xs text-amber-900 font-semibold animate-pulse">
            <ChefHat className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Chef is currently cooking your dishes with fresh ingredients!</span>
          </div>
        )}

        {activeStep === 2 && (
          <div className="mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-900 font-semibold animate-pulse">
            <Bell className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Dishes are ready and being brought to Table {tableName}!</span>
          </div>
        )}
      </div>

      {/* Ordered Items Summary */}
      <div className="bg-white rounded-3xl border border-neutral-200/90 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
          <h4 className="text-xs font-black uppercase tracking-wider text-neutral-500">
            Dishes in this Order
          </h4>
          <span className="text-xs font-bold text-neutral-400">
            {items.reduce((acc, i) => acc + i.quantity, 0)} items
          </span>
        </div>

        <div className="space-y-2.5">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between items-start text-xs">
              <div className="min-w-0 pr-2">
                <span className="font-extrabold text-neutral-900">
                  {item.quantity}×{" "}
                </span>
                <span className="font-medium text-neutral-800">
                  {item.name}
                </span>
                {item.variant && (
                  <span className="text-[11px] text-neutral-400 block ml-4">
                    Variant: {item.variant.name}
                  </span>
                )}
                {item.addons && item.addons.length > 0 && (
                  <span className="text-[11px] text-neutral-400 block ml-4">
                    + {item.addons.map((a) => a.name).join(", ")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-neutral-100 flex justify-between items-center text-sm font-black text-neutral-900">
          <span>Total Bill</span>
          <span style={{ color: accentColor }}>{formattedTotal}</span>
        </div>
      </div>
    </div>
  );
}
