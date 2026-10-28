"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Droplets,
  Utensils,
  Receipt,
  X,
  CheckCircle2,
  Loader2,
  Clock,
  AlertCircle,
} from "lucide-react";

interface CallWaiterDockProps {
  token: string;
  tableName: string;
  restaurantName: string;
  accentColor?: string;
}

type ServiceType = "WAITER" | "WATER" | "CUTLERY" | "BILL";

interface ServiceOption {
  type: ServiceType;
  label: string;
  desc: string;
  icon: typeof Bell;
  color: string;
  bgColor: string;
}

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    type: "WAITER",
    label: "Call Waiter",
    desc: "Assistance at table",
    icon: Bell,
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
  },
  {
    type: "WATER",
    label: "Need Water",
    desc: "Refill water glasses",
    icon: Droplets,
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
  },
  {
    type: "CUTLERY",
    label: "Extra Cutlery",
    desc: "Plates, forks, napkins",
    icon: Utensils,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
  },
  {
    type: "BILL",
    label: "Request Bill",
    desc: "Bring paper check",
    icon: Receipt,
    color: "text-purple-600",
    bgColor: "bg-purple-50 border-purple-200",
  },
];

export function CallWaiterDock({
  token,
  tableName,
  restaurantName,
  accentColor = "#E85D2A",
}: CallWaiterDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ServiceType>("WAITER");
  const [customNote, setCustomNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Cooldown timer interval
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleSendRequest = async () => {
    if (isLoading || cooldownSeconds > 0) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/v1/tables/call-waiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          type: selectedType,
          note: customNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to notify staff. Please try again.");
      }

      setSuccessMessage(
        `Staff alerted! A server will assist you at Table ${tableName} shortly.`
      );
      setCustomNote("");
      setCooldownSeconds(30); // 30-second cooldown
      setTimeout(() => {
        setIsOpen(false);
      }, 2500);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Network error. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-20 right-4 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-neutral-900/95 hover:bg-neutral-900 text-white shadow-xl shadow-black/25 backdrop-blur-md border border-white/10 active:scale-95 transition cursor-pointer"
          aria-label="Call Waiter Service"
        >
          <div
            className="w-2.5 h-2.5 rounded-full animate-ping"
            style={{ backgroundColor: accentColor }}
          />
          <Bell className="w-4 h-4 text-white group-hover:rotate-12 transition-transform" />
          <span className="text-xs font-bold tracking-wide">
            {cooldownSeconds > 0 ? `Alert Sent (${cooldownSeconds}s)` : "Call Staff"}
          </span>
        </button>
      </div>

      {/* Slide-over / Bottom Sheet Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-neutral-100 shadow-2xl p-5 pb-8 sm:pb-6 space-y-4 animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: accentColor }}
                >
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Table Service Dock
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {restaurantName} • Table {tableName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Alert / Feedback Messages */}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3 flex items-center gap-2.5 text-xs font-semibold animate-in zoom-in-95">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 flex items-center gap-2.5 text-xs font-semibold animate-in zoom-in-95">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Service Type Options Grid */}
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                What can we bring you?
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {SERVICE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selectedType === opt.type;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      disabled={cooldownSeconds > 0}
                      onClick={() => setSelectedType(opt.type)}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer disabled:opacity-50 ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white shadow-md"
                          : `${opt.bgColor} hover:bg-opacity-80`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                            isSelected ? "bg-white/20 text-white" : opt.color
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        {isSelected && (
                          <span className="text-[10px] bg-white text-neutral-900 font-black px-1.5 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <div>
                        <p
                          className={`text-xs font-bold ${
                            isSelected ? "text-white" : "text-neutral-900"
                          }`}
                        >
                          {opt.label}
                        </p>
                        <p
                          className={`text-[10px] ${
                            isSelected ? "text-white/70" : "text-neutral-500"
                          }`}
                        >
                          {opt.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-1.5">
                Specific Request / Note (Optional)
              </label>
              <input
                type="text"
                disabled={cooldownSeconds > 0}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                maxLength={200}
                placeholder="e.g. Warm water with lemon, extra napkins..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:bg-white transition"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="button"
                disabled={isLoading || cooldownSeconds > 0}
                onClick={handleSendRequest}
                className="w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition"
                style={{ backgroundColor: accentColor }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Notifying Staff...</span>
                  </>
                ) : cooldownSeconds > 0 ? (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>Please wait {cooldownSeconds}s before next call</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    <span>Send Request to Server</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
