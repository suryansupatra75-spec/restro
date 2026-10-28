"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  ShoppingCart,
  CreditCard,
  AlertTriangle,
  Users,
  RefreshCw,
  Sliders,
  Clock,
  ExternalLink,
  Volume2,
  ShieldCheck,
} from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import {
  NotificationItem,
  formatRelativeTime,
} from "@/components/dashboard/notification-bell";
import type { NotificationPreferenceFlags } from "@/lib/notifications/service";

interface ClientNotificationCenterProps {
  restaurantId: string;
  restaurantName: string;
  role: string;
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
  initialPreferences: NotificationPreferenceFlags;
}

export function ClientNotificationCenter({
  restaurantId,
  restaurantName,
  role,
  initialNotifications,
  initialUnreadCount,
  initialPreferences,
}: ClientNotificationCenterProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"FEED" | "PREFERENCES">("FEED");
  const [notifications, setNotifications] =
    useState<NotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [preferences, setPreferences] =
    useState<NotificationPreferenceFlags>(initialPreferences);

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const [savingPrefKey, setSavingPrefKey] = useState<string | null>(null);
  const [prefFeedback, setPrefFeedback] = useState<string | null>(null);

  const fetchLatest = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setRefreshing(true);
      try {
        const res = await fetch(
          `/api/v1/notifications?restaurantId=${encodeURIComponent(restaurantId)}&limit=60`,
          {
            cache: "no-store",
            headers: { "x-restaurant-id": restaurantId },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.notifications)) {
            setNotifications(data.notifications);
          }
          if (typeof data.unreadCount === "number") {
            setUnreadCount(data.unreadCount);
          }
          if (data.preferences) {
            setPreferences(data.preferences);
          }
        }
      } catch {
        // Silent background error
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [restaurantId]
  );

  // Sync with NotificationBell live events
  useEffect(() => {
    const handleLiveUpdate = () => {
      fetchLatest(false);
    };
    window.addEventListener(
      "restaurant:notifications-updated",
      handleLiveUpdate
    );
    window.addEventListener(
      "restaurant:notifications-local-sync",
      handleLiveUpdate
    );
    return () => {
      window.removeEventListener(
        "restaurant:notifications-updated",
        handleLiveUpdate
      );
      window.removeEventListener(
        "restaurant:notifications-local-sync",
        handleLiveUpdate
      );
    };
  }, [fetchLatest]);

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, isRead: true, readAt: new Date().toISOString() }
          : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await fetch(
        `/api/v1/notifications/${encodeURIComponent(id)}/read?restaurantId=${encodeURIComponent(restaurantId)}`,
        {
          method: "PATCH",
          headers: { "x-restaurant-id": restaurantId },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        }
        window.dispatchEvent(new Event("restaurant:notifications-local-sync"));
      }
    } catch {
      fetchLatest(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        isRead: true,
        readAt: n.readAt || new Date().toISOString(),
      }))
    );
    setUnreadCount(0);

    try {
      await fetch(
        `/api/v1/notifications/read-all?restaurantId=${encodeURIComponent(restaurantId)}`,
        {
          method: "POST",
          headers: { "x-restaurant-id": restaurantId },
        }
      );
      window.dispatchEvent(new Event("restaurant:notifications-local-sync"));
    } catch {
      fetchLatest(false);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleTogglePreference = async (
    key: keyof NotificationPreferenceFlags
  ) => {
    const nextValue = !preferences[key];
    const previous = { ...preferences };

    setPreferences((prev) => ({ ...prev, [key]: nextValue }));
    setSavingPrefKey(key);
    setPrefFeedback(null);

    try {
      const res = await fetch(
        `/api/v1/notifications/preferences?restaurantId=${encodeURIComponent(restaurantId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-restaurant-id": restaurantId,
          },
          body: JSON.stringify({ [key]: nextValue }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to save preference");
      }

      const data = await res.json();
      if (data.preferences) {
        setPreferences(data.preferences);
      }
      setPrefFeedback("Preferences saved");
      setTimeout(() => setPrefFeedback(null), 2500);
    } catch {
      setPreferences(previous);
      setPrefFeedback("Failed to update preference");
    } finally {
      setSavingPrefKey(null);
    }
  };

  const getCategoryIcon = (category: string, priority: string) => {
    switch (category) {
      case "ORDERS":
        return (
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
        );
      case "PAYMENTS":
        return (
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        );
      case "INVENTORY":
        return (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              priority === "URGENT"
                ? "bg-red-500/15 text-red-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      case "STAFF":
        return (
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-xl bg-surface-muted text-muted-foreground flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
        );
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (unreadOnly && n.isRead) return false;
    if (categoryFilter !== "ALL" && n.category !== categoryFilter) return false;
    return true;
  });

  const canOrders =
    hasPermission(role, "orders.view") || hasPermission(role, "kitchen.view");
  const canPayments = hasPermission(role, "payments.view");
  const canInventory = hasPermission(role, "inventory.view");
  const canStaff = hasPermission(role, "staff.view");

  const availableCategories = [
    { key: "ALL", label: "All Activity" },
    ...(canOrders ? [{ key: "ORDERS", label: "Orders & Kitchen" }] : []),
    ...(canPayments ? [{ key: "PAYMENTS", label: "Payments" }] : []),
    ...(canInventory ? [{ key: "INVENTORY", label: "Inventory" }] : []),
    ...(canStaff ? [{ key: "STAFF", label: "Staff & Access" }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border rounded-2xl p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-foreground">
                Notifications & Live Alerts
              </h1>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-primary text-white text-xs font-black">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Real-time operational updates for{" "}
              <span className="font-semibold text-foreground">
                {restaurantName}
              </span>{" "}
              • Role:{" "}
              <span className="font-bold text-primary uppercase">{role}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveTab("FEED")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "FEED"
                ? "bg-primary text-white shadow-xs"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Activity Feed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("PREFERENCES")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "PREFERENCES"
                ? "bg-primary text-white shadow-xs"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Preferences
          </button>
        </div>
      </div>

      {activeTab === "FEED" ? (
        <div className="bg-surface border border-border rounded-2xl shadow-xs overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-surface-muted/30">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {availableCategories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    categoryFilter === cat.key
                      ? "bg-primary text-white shadow-2xs"
                      : "bg-surface text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  unreadOnly
                    ? "bg-foreground text-surface border-foreground"
                    : "bg-surface text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                Unread Only
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/15 transition cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark All Read
                </button>
              )}

              <button
                type="button"
                onClick={() => fetchLatest(true)}
                disabled={refreshing}
                className="p-2 rounded-xl bg-surface border border-border text-muted-foreground hover:text-foreground transition cursor-pointer"
                title="Refresh notifications"
                aria-label="Refresh notifications"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? "animate-spin text-primary" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Feed Items */}
          {filteredNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-foreground">
                {unreadOnly
                  ? "No unread notifications"
                  : "No notifications in this view"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {unreadOnly
                  ? "You have reviewed all recent alerts. Switch off 'Unread Only' to browse your historical feed."
                  : "When orders are placed, statuses change, payments are verified, or stock runs low, alerts will appear here automatically."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={async () => {
                    if (!item.isRead) {
                      await handleMarkRead(item.id);
                    }
                    if (
                      item.actionUrl &&
                      item.actionUrl.startsWith("/dashboard")
                    ) {
                      router.push(item.actionUrl);
                    }
                  }}
                  className={`p-4 sm:p-5 flex items-start gap-4 transition cursor-pointer hover:bg-surface-muted/50 ${
                    !item.isRead ? "bg-primary/[0.03]" : "bg-surface"
                  }`}
                >
                  {getCategoryIcon(item.category, item.priority)}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4
                          className={`text-sm truncate ${
                            !item.isRead
                              ? "font-black text-foreground"
                              : "font-bold text-foreground/85"
                          }`}
                        >
                          {item.title}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-muted text-muted-foreground uppercase">
                          {item.category}
                        </span>
                        {(item.priority === "URGENT" ||
                          item.priority === "HIGH") && (
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              item.priority === "URGENT"
                                ? "bg-red-500/15 text-red-600"
                                : "bg-amber-500/15 text-amber-700"
                            }`}
                          >
                            {item.priority}
                          </span>
                        )}
                      </div>

                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                      {item.message}
                    </p>

                    <div className="flex items-center justify-between mt-3">
                      {item.actionUrl ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                          Open in Dashboard <ExternalLink className="w-3 h-3" />
                        </span>
                      ) : (
                        <span />
                      )}

                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkRead(item.id, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-surface-muted hover:bg-primary/10 hover:text-primary text-foreground transition cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Mark as Read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Notification Preferences Panel */
        <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-foreground flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Notification Delivery Preferences
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize which operational alerts you receive for your account
                in {restaurantName}.
              </p>
            </div>
            {prefFeedback && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700">
                {prefFeedback}
              </span>
            )}
          </div>

          {/* Global Delivery Toggles */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Global Channels
            </h3>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface-muted/20">
              <div className="pr-4">
                <p className="text-sm font-bold text-foreground">
                  In-App Notification Feed
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive live alerts in the top navigation bell and
                  notification center.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.inAppEnabled}
                disabled={savingPrefKey === "inAppEnabled"}
                onClick={() => handleTogglePreference("inAppEnabled")}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  preferences.inAppEnabled ? "bg-primary" : "bg-border"
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                    preferences.inAppEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface-muted/20">
              <div className="pr-4 flex items-start gap-2.5">
                <Volume2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Sound Chime on High-Priority Alerts
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Play a subtle audio chime when new orders or urgent stock
                    alerts arrive.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.soundEnabled}
                disabled={savingPrefKey === "soundEnabled"}
                onClick={() => handleTogglePreference("soundEnabled")}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  preferences.soundEnabled ? "bg-primary" : "bg-border"
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                    preferences.soundEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Event Category Toggles (Role-Aware) */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Operational Event Types
            </h3>

            {canOrders && (
              <>
                <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                  <div className="pr-4">
                    <p className="text-sm font-bold text-foreground">
                      New Customer Orders Placed
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Immediate alert whenever a table submits a new QR order.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.orderCreated}
                    disabled={savingPrefKey === "orderCreated"}
                    onClick={() => handleTogglePreference("orderCreated")}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      preferences.orderCreated ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                        preferences.orderCreated
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                  <div className="pr-4">
                    <p className="text-sm font-bold text-foreground">
                      Order Status Transitions
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Updates when orders move through Accepted, Preparing,
                      Ready, or Completed states.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.orderStatusChanged}
                    disabled={savingPrefKey === "orderStatusChanged"}
                    onClick={() => handleTogglePreference("orderStatusChanged")}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      preferences.orderStatusChanged
                        ? "bg-primary"
                        : "bg-border"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                        preferences.orderStatusChanged
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </>
            )}

            {canPayments && (
              <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                <div className="pr-4">
                  <p className="text-sm font-bold text-foreground">
                    Verified Payment Status Changes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Alerts when online or cash payments are verified as PAID or
                    FAILED.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.paymentStatusChanged}
                  disabled={savingPrefKey === "paymentStatusChanged"}
                  onClick={() => handleTogglePreference("paymentStatusChanged")}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    preferences.paymentStatusChanged
                      ? "bg-primary"
                      : "bg-border"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                      preferences.paymentStatusChanged
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            )}

            {canInventory && (
              <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                <div className="pr-4">
                  <p className="text-sm font-bold text-foreground">
                    Low Stock & Out-of-Stock Warnings
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Alerts when active inventory items drop at or below their
                    configured threshold.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.inventoryLow}
                  disabled={savingPrefKey === "inventoryLow"}
                  onClick={() => handleTogglePreference("inventoryLow")}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    preferences.inventoryLow ? "bg-primary" : "bg-border"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                      preferences.inventoryLow
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            )}

            {canStaff && (
              <div className="flex items-center justify-between p-4 rounded-xl border border-border">
                <div className="pr-4">
                  <p className="text-sm font-bold text-foreground">
                    Staff Invitations & Role Changes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Security and team notifications when staff are invited,
                    accept access, or change roles.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.staffAccessChanged}
                  disabled={savingPrefKey === "staffAccessChanged"}
                  onClick={() => handleTogglePreference("staffAccessChanged")}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    preferences.staffAccessChanged ? "bg-primary" : "bg-border"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform transform ${
                      preferences.staffAccessChanged
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
