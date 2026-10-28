/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Palette,
  Clock,
  Globe,
  ShoppingBag,
  Percent,
  Bell,
  Save,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
  ShieldAlert,
  Info,
  ExternalLink,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { StaffRole } from "@/lib/permissions";

interface RestaurantSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  currency: string;
  timezone: string;
  gstNumber: string | null;
  taxPercentage: number;
  openingTime: string | null;
  closingTime: string | null;
  closedDays: string[];
  accentColor: string;
  isOrderingEnabled: boolean;
  customerNotice: string | null;
  allowSpecialInstructions: boolean;
  googleReviewUrl?: string | null;
  status: string;
  updatedAt: string;
}

interface SettingsMeta {
  hasFinancialHistory: boolean;
  ordersCount: number;
  paymentsCount: number;
  supportedCurrencies: string[];
  supportedTimezones: string[];
  validWeekdays: string[];
}

interface UserNotificationPreferences {
  orderCreated: boolean;
  orderStatusChanged: boolean;
  paymentStatusChanged: boolean;
  inventoryLow: boolean;
  staffAccessChanged: boolean;
  inAppEnabled: boolean;
  soundEnabled: boolean;
}

const DEFAULT_NOTIF_PREFS: UserNotificationPreferences = {
  orderCreated: true,
  orderStatusChanged: true,
  paymentStatusChanged: true,
  inventoryLow: true,
  staffAccessChanged: true,
  inAppEnabled: true,
  soundEnabled: true,
};

interface ClientSettingsProps {
  restaurantId: string;
  role: StaffRole;
  canManageSettings: boolean;
}

type SettingsTab =
  | "profile"
  | "branding"
  | "hours"
  | "regional"
  | "ordering"
  | "tax"
  | "notifications";

const TABS: { id: SettingsTab; label: string; icon: any }[] = [
  { id: "profile", label: "Profile & Contact", icon: Store },
  { id: "branding", label: "Branding & Theme", icon: Palette },
  { id: "hours", label: "Business Hours", icon: Clock },
  { id: "regional", label: "Regional", icon: Globe },
  { id: "ordering", label: "Order Controls", icon: ShoppingBag },
  { id: "tax", label: "Taxes & Pricing", icon: Percent },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const ACCENT_PRESETS = [
  { name: "Terracotta", hex: "#E85D2A" },
  { name: "Forest", hex: "#1B4332" },
  { name: "Crimson", hex: "#DC2626" },
  { name: "Ocean", hex: "#0284C7" },
  { name: "Royal", hex: "#4F46E5" },
  { name: "Plum", hex: "#7E22CE" },
  { name: "Espresso", hex: "#44403C" },
];

const WEEKDAY_LABELS: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};

const NOTIFICATION_EVENT_TOGGLES: {
  key: keyof Pick<
    UserNotificationPreferences,
    | "orderCreated"
    | "orderStatusChanged"
    | "paymentStatusChanged"
    | "inventoryLow"
    | "staffAccessChanged"
  >;
  title: string;
  description: string;
}[] = [
  {
    key: "orderCreated",
    title: "New Customer Orders",
    description: "Receive an alert whenever a guest places a new table QR order",
  },
  {
    key: "orderStatusChanged",
    title: "Order & Kitchen Status Updates",
    description:
      "Alerts when orders move to Accepted, Preparing, Ready to Serve, or Cancelled",
  },
  {
    key: "paymentStatusChanged",
    title: "Payment Confirmations & Failures",
    description: "Alerts when online or cash payments are verified or fail",
  },
  {
    key: "inventoryLow",
    title: "Low-Stock & Out-of-Stock Alerts",
    description: "Warnings when stock items drop below their minimum threshold",
  },
  {
    key: "staffAccessChanged",
    title: "Staff & Role Security Events",
    description: "Notifications when team members are invited, updated, or disabled",
  },
];

export function ClientSettings({
  restaurantId,
  role,
  canManageSettings: initialCanManage,
}: ClientSettingsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<
    "logoUrl" | "coverImageUrl" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [savedSettings, setSavedSettings] = useState<RestaurantSettings | null>(
    null
  );
  const [form, setForm] = useState<RestaurantSettings | null>(null);
  const [taxInputStr, setTaxInputStr] = useState<string>("0");
  const [meta, setMeta] = useState<SettingsMeta | null>(null);
  const [canManage, setCanManage] = useState(initialCanManage);

  // Notification preferences state (per-user object)
  const [notifPrefs, setNotifPrefs] =
    useState<UserNotificationPreferences>(DEFAULT_NOTIF_PREFS);
  const [savingNotif, setSavingNotif] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, notifRes] = await Promise.all([
        fetch(`/api/v1/settings?restaurantId=${restaurantId}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/v1/notifications/preferences?restaurantId=${restaurantId}`,
          { cache: "no-store" }
        ),
      ]);

      const settingsData = await settingsRes.json();
      if (!settingsRes.ok) {
        throw new Error(settingsData.error || "Failed to load settings");
      }

      setSavedSettings(settingsData.settings);
      setForm(settingsData.settings);
      setTaxInputStr(String(settingsData.settings?.taxPercentage ?? 0));
      setMeta(settingsData.meta);
      if (settingsData.permissions) {
        setCanManage(Boolean(settingsData.permissions.canManageSettings));
      }

      if (notifRes.ok) {
        const notifData = await notifRes.json();
        if (
          notifData.preferences &&
          typeof notifData.preferences === "object" &&
          !Array.isArray(notifData.preferences)
        ) {
          setNotifPrefs({
            ...DEFAULT_NOTIF_PREFS,
            ...notifData.preferences,
          });
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load restaurant settings"
      );
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const isDirty = useMemo(() => {
    if (!savedSettings || !form) return false;
    return JSON.stringify(savedSettings) !== JSON.stringify(form);
  }, [savedSettings, form]);

  const updateField = <K extends keyof RestaurantSettings>(
    key: K,
    value: RestaurantSettings[K]
  ) => {
    if (!canManage) return;
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (key === "accentColor" && typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)) {
      document
        .getElementById("dashboard-root")
        ?.style.setProperty("--color-primary", value);
    }
    setFieldErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
    setSuccessMessage(null);
  };

  const toggleClosedDay = (day: string) => {
    if (!canManage || !form) return;
    const current = new Set(form.closedDays || []);
    if (current.has(day)) {
      current.delete(day);
    } else {
      current.add(day);
    }
    updateField("closedDays", Array.from(current));
  };

  const handleReset = () => {
    if (!savedSettings) return;
    setForm({ ...savedSettings });
    setTaxInputStr(String(savedSettings.taxPercentage ?? 0));
    document
      .getElementById("dashboard-root")
      ?.style.setProperty(
        "--color-primary",
        savedSettings.accentColor || "#E85D2A"
      );
    setFieldErrors({});
    setError(null);
    setSuccessMessage(null);
  };

  const handleImageUpload = async (
    field: "logoUrl" | "coverImageUrl",
    file: File
  ) => {
    if (!canManage) return;
    setUploadingField(field);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Image upload failed");
      }
      updateField(field, data.url);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to upload image file"
      );
    } finally {
      setUploadingField(null);
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form || !canManage || saving) return;

    setSaving(true);
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    try {
      const fullCandidate: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        description: form.description ?? "",
        phone: form.phone ?? "",
        email: form.email ?? "",
        address: form.address ?? "",
        city: form.city ?? "",
        state: form.state ?? "",
        country: form.country ?? "",
        pincode: form.pincode ?? "",
        gstNumber: form.gstNumber ?? "",
        logoUrl: form.logoUrl ?? "",
        coverImageUrl: form.coverImageUrl ?? "",
        accentColor: form.accentColor || "#E85D2A",
        openingTime: form.openingTime ?? "",
        closingTime: form.closingTime ?? "",
        closedDays: form.closedDays || [],
        timezone: form.timezone,
        isOrderingEnabled: form.isOrderingEnabled,
        customerNotice: form.customerNotice ?? "",
        allowSpecialInstructions: form.allowSpecialInstructions,
        googleReviewUrl: form.googleReviewUrl ?? "",
        taxPercentage: Number(form.taxPercentage ?? 0),
        currency: form.currency,
      };

      // Build dirty-only payload so untouched fields on other tabs never block saving
      const payload: Record<string, unknown> = {};
      if (savedSettings) {
        const baseline: Record<string, unknown> = {
          name: savedSettings.name,
          slug: savedSettings.slug,
          description: savedSettings.description ?? "",
          phone: savedSettings.phone ?? "",
          email: savedSettings.email ?? "",
          address: savedSettings.address ?? "",
          city: savedSettings.city ?? "",
          state: savedSettings.state ?? "",
          country: savedSettings.country ?? "",
          pincode: savedSettings.pincode ?? "",
          gstNumber: savedSettings.gstNumber ?? "",
          logoUrl: savedSettings.logoUrl ?? "",
          coverImageUrl: savedSettings.coverImageUrl ?? "",
          accentColor: savedSettings.accentColor || "#E85D2A",
          openingTime: savedSettings.openingTime ?? "",
          closingTime: savedSettings.closingTime ?? "",
          closedDays: savedSettings.closedDays || [],
          timezone: savedSettings.timezone,
          isOrderingEnabled: savedSettings.isOrderingEnabled,
          customerNotice: savedSettings.customerNotice ?? "",
          allowSpecialInstructions: savedSettings.allowSpecialInstructions,
          googleReviewUrl: savedSettings.googleReviewUrl ?? "",
          taxPercentage: Number(savedSettings.taxPercentage ?? 0),
          currency: savedSettings.currency,
        };

        for (const key of Object.keys(fullCandidate)) {
          if (
            JSON.stringify(fullCandidate[key]) !== JSON.stringify(baseline[key])
          ) {
            payload[key] = fullCandidate[key];
          }
        }

        // If either openingTime or closingTime was modified, include both so pair validation succeeds
        if (
          payload.openingTime !== undefined ||
          payload.closingTime !== undefined
        ) {
          payload.openingTime = fullCandidate.openingTime;
          payload.closingTime = fullCandidate.closingTime;
        }

        // If currency was explicitly changed by the OWNER in the UI, confirm the currency change
        if (payload.currency !== undefined) {
          payload.confirmCurrencyChange = true;
        }
      }

      // If no specific dirty fields detected (e.g. user clicked Save directly), send safe profile/active fields
      if (Object.keys(payload).length === 0) {
        payload.name = form.name;
        payload.isOrderingEnabled = form.isOrderingEnabled;
        payload.taxPercentage = Number(form.taxPercentage ?? 0);
      }

      const res = await fetch(`/api/v1/settings?restaurantId=${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details?.fieldErrors) {
          setFieldErrors(data.details.fieldErrors);
        }
        throw new Error(data.error || "Failed to save settings");
      }

      setSavedSettings(data.settings);
      setForm(data.settings);
      setTaxInputStr(String(data.settings?.taxPercentage ?? 0));
      if (data.meta) setMeta(data.meta);
      setSuccessMessage("Restaurant configuration saved and published.");

      // Immediately update dashboard theme color & sidebar branding
      if (typeof window !== "undefined" && data.settings) {
        document
          .getElementById("dashboard-root")
          ?.style.setProperty(
            "--color-primary",
            data.settings.accentColor || "#E85D2A"
          );
        window.dispatchEvent(
          new CustomEvent("restaurant-settings-updated", {
            detail: {
              name: data.settings.name,
              logoUrl: data.settings.logoUrl,
              accentColor: data.settings.accentColor,
            },
          })
        );
      }

      // Refresh Next.js Server Components so layout & pages reflect new settings immediately
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save restaurant settings"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(
        `/api/v1/notifications/preferences?restaurantId=${restaurantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantId,
            orderCreated: notifPrefs.orderCreated,
            orderStatusChanged: notifPrefs.orderStatusChanged,
            paymentStatusChanged: notifPrefs.paymentStatusChanged,
            inventoryLow: notifPrefs.inventoryLow,
            staffAccessChanged: notifPrefs.staffAccessChanged,
            inAppEnabled: notifPrefs.inAppEnabled,
            soundEnabled: notifPrefs.soundEnabled,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Failed to update notification preferences"
        );
      }
      if (data.preferences && typeof data.preferences === "object") {
        setNotifPrefs({
          ...DEFAULT_NOTIF_PREFS,
          ...data.preferences,
        });
      }
      setSuccessMessage("Notification preferences saved.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save notification preferences"
      );
    } finally {
      setSavingNotif(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="space-y-6">
        <div className="h-20 bg-surface rounded-2xl border border-border animate-pulse" />
        <div className="h-96 bg-surface rounded-2xl border border-border animate-pulse" />
      </div>
    );
  }

  const sampleSubtotal = 1000;
  const sampleTax =
    Math.round(((sampleSubtotal * Number(form.taxPercentage || 0)) / 100) * 100) /
    100;
  const sampleTotal = Math.round((sampleSubtotal + sampleTax) * 100) / 100;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Restaurant Settings
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-surface-muted border border-border text-muted-foreground">
              {role}
            </span>
            {!form.isOrderingEnabled && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Ordering Paused
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your restaurant profile, branding, operating hours, tax
            rules, and customer QR ordering preferences.
          </p>
        </div>

        {canManage && activeTab !== "notifications" && (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || saving}
              className="px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? "Saving..." : "Save Changes"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Read-Only Banner for MANAGER */}
      {!canManage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-4 flex items-start gap-3 text-sm">
          <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Read-Only Configuration View</p>
            <p className="text-xs text-blue-700 mt-0.5">
              As a <strong>{role}</strong>, you can view restaurant settings and
              manage your own notification preferences. Only the{" "}
              <strong>OWNER</strong> can modify business configuration, tax
              rates, or ordering controls.
            </p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">{error}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1.5 list-disc list-inside text-xs text-red-700 space-y-0.5">
                {Object.entries(fieldErrors).map(([field, msgs]) =>
                  msgs.map((m, idx) => (
                    <li key={`${field}-${idx}`}>
                      <strong className="capitalize">{field}:</strong> {m}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {/* Section Navigation Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer border ${
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-surface text-muted-foreground border-border hover:text-foreground hover:bg-surface-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* 1. PROFILE & CONTACT */}
        {activeTab === "profile" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Restaurant Profile & Contact Information
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Public identity and address details shown to guests and on
                receipts.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Restaurant Name *
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  maxLength={100}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Restaurant Slug (Unique Identifier) *
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.slug}
                  onChange={(e) =>
                    updateField(
                      "slug",
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-+/g, "-")
                    )
                  }
                  maxLength={80}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>
                    Printed table QR codes use secure tokens (
                    <code>/q/[token]</code>) and will not break if you change
                    your slug.
                  </span>
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Short Description / Tagline
                </label>
                <textarea
                  disabled={!canManage}
                  value={form.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="e.g. Authentic wood-fired pizzas and craft beverages"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Public Phone Number
                </label>
                <input
                  type="tel"
                  disabled={!canManage}
                  value={form.phone || ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                  maxLength={25}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Public Contact Email
                </label>
                <input
                  type="email"
                  disabled={!canManage}
                  value={form.email || ""}
                  onChange={(e) => updateField("email", e.target.value)}
                  maxLength={120}
                  placeholder="hello@restaurant.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Street Address
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.address || ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  maxLength={250}
                  placeholder="123 Culinary Avenue, Suite 100"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  City
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.city || ""}
                  onChange={(e) => updateField("city", e.target.value)}
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  State / Province
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.state || ""}
                  onChange={(e) => updateField("state", e.target.value)}
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Country
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.country || ""}
                  onChange={(e) => updateField("country", e.target.value)}
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Postal / PIN Code
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.pincode || ""}
                  onChange={(e) => updateField("pincode", e.target.value)}
                  maxLength={20}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. BRANDING & CUSTOMER MENU */}
        {activeTab === "branding" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Branding & Customer QR Menu Appearance
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize your logo, welcome cover image, and primary brand
                accent color across your dashboard and digital QR menu.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Logo Image
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    disabled={!canManage}
                    value={form.logoUrl || ""}
                    onChange={(e) => updateField("logoUrl", e.target.value)}
                    placeholder="https://... or /uploads/..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                  {canManage && (
                    <label className="px-3.5 py-2.5 rounded-xl border border-border bg-surface-muted hover:bg-surface-muted/80 text-xs font-bold text-foreground flex items-center gap-1.5 cursor-pointer shrink-0 transition">
                      {uploadingField === "logoUrl" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload("logoUrl", f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Upload an image file or paste a <code>https://</code> or{" "}
                  <code>/uploads/</code> URL.
                </p>
                {form.logoUrl && (
                  <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-muted border border-border">
                    <div className="flex items-center gap-3">
                      <img
                        src={form.logoUrl}
                        alt="Logo Preview"
                        className="w-12 h-12 rounded-xl object-cover border border-border bg-white"
                      />
                      <span className="text-xs text-muted-foreground font-medium">
                        Live Logo Preview
                      </span>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => updateField("logoUrl", "")}
                        className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Welcome Cover Image
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    disabled={!canManage}
                    value={form.coverImageUrl || ""}
                    onChange={(e) =>
                      updateField("coverImageUrl", e.target.value)
                    }
                    placeholder="https://... or /uploads/..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                  {canManage && (
                    <label className="px-3.5 py-2.5 rounded-xl border border-border bg-surface-muted hover:bg-surface-muted/80 text-xs font-bold text-foreground flex items-center gap-1.5 cursor-pointer shrink-0 transition">
                      {uploadingField === "coverImageUrl" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload("coverImageUrl", f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {form.coverImageUrl && (
                  <div className="mt-3 rounded-xl overflow-hidden border border-border h-24 bg-surface-muted relative">
                    <img
                      src={form.coverImageUrl}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-border">
                <label className="block text-xs font-bold text-foreground mb-2">
                  Primary Brand Accent Color
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    disabled={!canManage}
                    value={
                      /^#[0-9A-Fa-f]{6}$/.test(form.accentColor)
                        ? form.accentColor
                        : "#E85D2A"
                    }
                    onChange={(e) =>
                      updateField("accentColor", e.target.value.toUpperCase())
                    }
                    className="w-11 h-11 rounded-xl border border-border cursor-pointer bg-background p-1 disabled:opacity-60"
                  />
                  <input
                    type="text"
                    disabled={!canManage}
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value.toUpperCase())
                    }
                    maxLength={7}
                    placeholder="#E85D2A"
                    className="w-32 px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />

                  <div className="flex flex-wrap gap-2">
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        disabled={!canManage}
                        onClick={() => updateField("accentColor", preset.hex)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                          form.accentColor.toUpperCase() === preset.hex
                            ? "border-foreground bg-surface-muted font-bold"
                            : "border-border bg-background hover:bg-surface-muted"
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-black/10"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Near-white colors are automatically blocked to guarantee
                  readable contrast on white menu cards.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3. BUSINESS HOURS */}
        {activeTab === "hours" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Operating Hours & Weekly Schedule
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Displayed on the Customer QR Menu so guests know your service
                hours.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Opening Time (24-hour HH:MM)
                </label>
                <input
                  type="time"
                  disabled={!canManage}
                  value={form.openingTime || ""}
                  onChange={(e) => updateField("openingTime", e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Closing Time (24-hour HH:MM)
                </label>
                <input
                  type="time"
                  disabled={!canManage}
                  value={form.closingTime || ""}
                  onChange={(e) => updateField("closingTime", e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-2">
                Regular Weekly Closed Days
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  meta?.validWeekdays || [
                    "MONDAY",
                    "TUESDAY",
                    "WEDNESDAY",
                    "THURSDAY",
                    "FRIDAY",
                    "SATURDAY",
                    "SUNDAY",
                  ]
                ).map((day) => {
                  const isClosed = (form.closedDays || []).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleClosedDay(day)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-60 ${
                        isClosed
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-800"
                      }`}
                    >
                      <span>{WEEKDAY_LABELS[day] || day}</span>
                      <span className="ml-1.5 text-[10px] opacity-80">
                        {isClosed ? "(Closed)" : "(Open)"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 4. REGIONAL PREFERENCES */}
        {activeTab === "regional" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Regional & Currency Preferences
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure currency formatting and operational timezone.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-foreground">
                    Restaurant Currency
                  </label>
                  {meta?.hasFinancialHistory && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      <ShieldAlert className="w-3 h-3" /> Active Orders History
                    </span>
                  )}
                </div>
                <select
                  disabled={!canManage}
                  value={form.currency}
                  onChange={(e) => updateField("currency", e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  {(
                    meta?.supportedCurrencies || [
                      "USD",
                      "INR",
                      "EUR",
                      "GBP",
                      "AED",
                      "SGD",
                      "CAD",
                      "AUD",
                    ]
                  ).map((curr) => (
                    <option key={curr} value={curr}>
                      {curr}
                    </option>
                  ))}
                </select>
                {meta?.hasFinancialHistory ? (
                  <p className="text-[11px] text-amber-700 mt-1.5 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      This restaurant has <strong>{meta.ordersCount}</strong>{" "}
                      orders and <strong>{meta.paymentsCount}</strong> payments
                      on record. Changing currency updates display symbols across
                      your menu and dashboard without altering historical order
                      amounts.
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Select the currency symbol used across your digital QR menu
                    and dashboard reports.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Operational Timezone
                </label>
                <select
                  disabled={!canManage}
                  value={form.timezone}
                  onChange={(e) => updateField("timezone", e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  {(meta?.supportedTimezones || ["UTC", "Asia/Kolkata"]).map(
                    (tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 5. ORDER & SERVICE PREFERENCES */}
        {activeTab === "ordering" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Order & Service Preferences
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control live QR table ordering availability, customer notice
                banners, and special instructions.
              </p>
            </div>

            <div className="space-y-4">
              {/* Toggle 1: Enable QR Table Ordering */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-border bg-surface-muted/50">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Enable Customer QR Ordering
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When paused, guests can still browse your digital menu and
                    track active orders, but new order submissions are blocked
                    both in the UI and by the Orders API.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isOrderingEnabled}
                  disabled={!canManage}
                  onClick={() =>
                    updateField("isOrderingEnabled", !form.isOrderingEnabled)
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer disabled:opacity-50 ${
                    form.isOrderingEnabled ? "bg-emerald-600" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      form.isOrderingEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Customer Notice Banner */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Customer Notice / Pause Reason Banner
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.customerNotice || ""}
                  onChange={(e) =>
                    updateField("customerNotice", e.target.value)
                  }
                  maxLength={300}
                  placeholder="e.g. Kitchen closes at 10:30 PM • Happy Hour 4–7 PM!"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Displayed prominently at the top of the Customer QR Menu (and
                  returned as the reason if ordering is paused).
                </p>
              </div>

              {/* Toggle 2: Allow Special Instructions */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-border bg-surface-muted/50">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Allow Dish Special Instructions
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Allow guests to attach preparation notes (e.g. &quot;less
                    spicy&quot;, &quot;no onions&quot;) when adding items to
                    their cart.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.allowSpecialInstructions}
                  disabled={!canManage}
                  onClick={() =>
                    updateField(
                      "allowSpecialInstructions",
                      !form.allowSpecialInstructions
                    )
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer disabled:opacity-50 ${
                    form.allowSpecialInstructions
                      ? "bg-emerald-600"
                      : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      form.allowSpecialInstructions
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* 3. Google Business / Maps Review Link */}
              <div className="p-4 rounded-2xl border border-border bg-surface-muted/30 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-black text-sm shrink-0">
                    G
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-foreground">
                      Google Business / Maps Review Link
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      When guests complete their meal, they are presented with an AI-generated positive review of their ordered dishes and a 1-tap button to copy and publish it directly to your Google Business profile!
                    </p>
                  </div>
                </div>
                <input
                  type="url"
                  disabled={!canManage}
                  value={form.googleReviewUrl || ""}
                  onChange={(e) =>
                    updateField("googleReviewUrl", e.target.value)
                  }
                  maxLength={1000}
                  placeholder="e.g. https://g.page/r/.../review or https://maps.app.goo.gl/..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                {form.googleReviewUrl && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium truncate">
                      Active: {form.googleReviewUrl}
                    </span>
                    <a
                      href={form.googleReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-primary hover:underline font-bold shrink-0"
                    >
                      <span>Test link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 6. TAXES & PRICING */}
        {activeTab === "tax" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Taxes & Pricing Configuration
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure tax percentage and GST / Tax Registration ID. Tax
                updates apply only to new orders and are snapshotted per order.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Default Tax / GST Percentage (0% – 50%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="50"
                    disabled={!canManage}
                    value={taxInputStr}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setTaxInputStr(raw);
                      const parsed = raw === "" ? 0 : parseFloat(raw);
                      updateField(
                        "taxPercentage",
                        Number.isNaN(parsed) ? 0 : parsed
                      );
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Each order snapshots <code>appliedTaxPercentage</code>,{" "}
                  <code>subtotal</code>, <code>tax</code>, and{" "}
                  <code>total</code> at creation time. Historical orders and
                  payments are never recalculated.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  GSTIN / Tax Registration Number
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={form.gstNumber || ""}
                  onChange={(e) =>
                    updateField("gstNumber", e.target.value.toUpperCase())
                  }
                  maxLength={30}
                  placeholder="e.g. 27AABCU9603R1ZM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Sample Calculation Preview */}
            <div className="p-4 rounded-2xl bg-surface-muted border border-border space-y-2 max-w-md">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Sample Order Tax Preview
              </p>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Sample Item Subtotal</span>
                <span>
                  {form.currency} {sampleSubtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Tax ({Number(form.taxPercentage || 0)}%)</span>
                <span>
                  {form.currency} {sampleTax.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border">
                <span>Customer Total</span>
                <span>
                  {form.currency} {sampleTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Inline Save Button Footer for Configuration Tabs */}
        {canManage && activeTab !== "notifications" && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || saving}
              className="px-4 py-2.5 rounded-xl border border-border bg-surface text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard Changes</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 disabled:opacity-50 transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? "Saving Changes..." : "Save Configuration"}</span>
            </button>
          </div>
        )}

        {/* 7. NOTIFICATION PREFERENCES */}
        {activeTab === "notifications" && (
          <div className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Personal Notification Preferences
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which operational alerts you receive in-app and via
                  sound for your account.
                </p>
              </div>
              <Link
                href="/dashboard/notifications"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <span>Open Notification Center</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Global Delivery Channels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-border bg-surface-muted/50 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    In-App Notification Bell & Feed
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show real-time unread badges and operational alerts in the
                    dashboard header.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.inAppEnabled}
                  onChange={(e) =>
                    setNotifPrefs((prev) => ({
                      ...prev,
                      inAppEnabled: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl border border-border bg-surface-muted/50 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Sound Chime Alerts
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Play an audio chime when high-priority orders or kitchen
                    events arrive.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.soundEnabled}
                  onChange={(e) =>
                    setNotifPrefs((prev) => ({
                      ...prev,
                      soundEnabled: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
              </div>
            </div>

            {/* Event Type Toggles */}
            <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
              {NOTIFICATION_EVENT_TOGGLES.map((item) => (
                <div
                  key={item.key}
                  className="p-4 flex items-center justify-between gap-4 bg-background"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={Boolean(notifPrefs[item.key])}
                      onChange={(e) =>
                        setNotifPrefs((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    />
                    <span>Enabled</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotifications}
                disabled={savingNotif}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
              >
                {savingNotif ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>
                  {savingNotif ? "Saving..." : "Save Notification Preferences"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Sticky Unsaved Changes Bar */}
        {canManage && isDirty && activeTab !== "notifications" && (
          <div className="fixed bottom-20 left-4 right-4 sm:bottom-6 sm:left-auto sm:right-8 sm:w-auto z-50 bg-foreground text-background px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-6 border border-white/10">
            <div className="text-xs font-semibold">
              You have unsaved configuration changes.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition cursor-pointer"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Now</span>
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
