"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  ShoppingCart,
  CreditCard,
  AlertTriangle,
  Users,
  Settings,
  ExternalLink,
  RefreshCw,
  WifiOff,
  Clock,
} from "lucide-react";
import { hasPermission } from "@/lib/permissions";

export interface NotificationItem {
  id: string;
  restaurantId: string;
  userId: string;
  eventType: string;
  title: string;
  message: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  category: "ORDERS" | "PAYMENTS" | "INVENTORY" | "STAFF" | "BILLING";
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface NotificationBellProps {
  restaurantId: string;
  role: string;
  align?: "left" | "right";
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

export function NotificationBell({
  restaurantId,
  role,
  align = "left",
}: NotificationBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "LIVE" | "RECONNECTING" | "PAUSED"
  >("LIVE");

  const containerRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const failureCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotifications = useCallback(
    async (isBackground = false) => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden" &&
        isBackground
      ) {
        setConnectionState("PAUSED");
        return;
      }

      if (!isBackground) {
        setLoading(true);
      }

      try {
        const res = await fetch(
          `/api/v1/notifications?restaurantId=${encodeURIComponent(restaurantId)}&limit=30`,
          {
            cache: "no-store",
            headers: {
              "x-restaurant-id": restaurantId,
            },
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const fetchedList: NotificationItem[] = Array.isArray(data.notifications)
          ? data.notifications
          : [];
        const newUnreadCount =
          typeof data.unreadCount === "number" ? data.unreadCount : 0;

        failureCountRef.current = 0;
        setConnectionState("LIVE");
        setNotifications(fetchedList);
        setUnreadCount(newUnreadCount);

        // Detect newly arrived notifications after initial mount
        const newArrivals: NotificationItem[] = [];
        for (const item of fetchedList) {
          if (!seenIdsRef.current.has(item.id)) {
            seenIdsRef.current.add(item.id);
            if (initializedRef.current) {
              newArrivals.push(item);
            }
          }
        }
        initializedRef.current = true;

        if (newArrivals.length > 0 && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("restaurant:notifications-updated", {
              detail: {
                newNotifications: newArrivals,
                unreadCount: newUnreadCount,
              },
            })
          );
        }
      } catch {
        failureCountRef.current += 1;
        setConnectionState("RECONNECTING");
      } finally {
        if (!isBackground) {
          setLoading(false);
        }
      }
    },
    [restaurantId]
  );

  // Bounded visibility-aware polling with exponential backoff
  useEffect(() => {
    let isMounted = true;

    const scheduleNext = () => {
      if (!isMounted) return;
      if (timerRef.current) clearTimeout(timerRef.current);

      const baseInterval = 8000;
      const backoffMultiplier = Math.min(
        Math.pow(2, failureCountRef.current),
        8
      );
      const delay = Math.min(baseInterval * backoffMultiplier, 60000);

      timerRef.current = setTimeout(async () => {
        if (!isMounted) return;
        await fetchNotifications(true);
        scheduleNext();
      }, delay);
    };

    fetchNotifications(false).then(() => {
      scheduleNext();
    });

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        failureCountRef.current = 0;
        fetchNotifications(true);
        scheduleNext();
      } else {
        setConnectionState("PAUSED");
      }
    };

    const handleLocalSync = () => {
      fetchNotifications(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleVisibilityOrFocus);
    window.addEventListener(
      "restaurant:notifications-local-sync",
      handleLocalSync
    );

    return () => {
      isMounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleVisibilityOrFocus);
      window.removeEventListener(
        "restaurant:notifications-local-sync",
        handleLocalSync
      );
    };
  }, [fetchNotifications]);

  // Close popover on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Optimistic UI update
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
      // Next poll will reconcile
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
      // Next poll will reconcile
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await handleMarkRead(item.id);
    }
    setIsOpen(false);
    if (item.actionUrl && item.actionUrl.startsWith("/dashboard")) {
      router.push(item.actionUrl);
    }
  };

  const getCategoryIcon = (category: string, priority: string) => {
    switch (category) {
      case "ORDERS":
        return (
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShoppingCart className="w-4 h-4" />
          </div>
        );
      case "PAYMENTS":
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
        );
      case "INVENTORY":
        return (
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              priority === "URGENT"
                ? "bg-red-500/15 text-red-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        );
      case "STAFF":
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-surface-muted text-muted-foreground flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
        );
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    if (unreadOnlyFilter && item.isRead) return false;
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const availableCategories = [
    { key: "ALL", label: "All" },
    ...(hasPermission(role, "orders.view") ||
    hasPermission(role, "kitchen.view")
      ? [{ key: "ORDERS", label: "Orders" }]
      : []),
    ...(hasPermission(role, "payments.view")
      ? [{ key: "PAYMENTS", label: "Payments" }]
      : []),
    ...(hasPermission(role, "inventory.view")
      ? [{ key: "INVENTORY", label: "Stock" }]
      : []),
    ...(hasPermission(role, "staff.view")
      ? [{ key: "STAFF", label: "Staff" }]
      : []),
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative w-9 h-9 rounded-xl bg-surface-muted hover:bg-surface-muted/80 flex items-center justify-center text-foreground transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shadow-xs">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className={`fixed inset-x-3 top-16 md:absolute md:inset-x-auto md:top-full md:mt-2 w-auto md:w-96 bg-surface border border-border rounded-2xl shadow-2xl z-50 flex flex-col max-h-[80dvh] md:max-h-[540px] overflow-hidden ${
            align === "right" ? "md:right-0" : "md:left-0"
          }`}
        >
          {/* Header */}
          <div className="p-3.5 border-b border-border flex items-center justify-between bg-surface-muted/40">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-foreground">
                Notifications
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  connectionState === "LIVE"
                    ? "bg-emerald-500/10 text-emerald-700"
                    : connectionState === "RECONNECTING"
                    ? "bg-amber-500/15 text-amber-700"
                    : "bg-surface-muted text-muted-foreground"
                }`}
                title={
                  connectionState === "LIVE"
                    ? "Live updates active"
                    : connectionState === "RECONNECTING"
                    ? "Reconnecting to notification feed..."
                    : "Background polling paused"
                }
              >
                {connectionState === "RECONNECTING" ? (
                  <WifiOff className="w-2.5 h-2.5" />
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connectionState === "LIVE"
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-muted-foreground"
                    }`}
                  />
                )}
                {connectionState === "LIVE"
                  ? "Live"
                  : connectionState === "RECONNECTING"
                  ? "Retrying"
                  : "Idle"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-primary hover:bg-primary/10 transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <Link
                href="/dashboard/notifications"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition"
                title="Notification Center & Preferences"
                aria-label="Notification Center & Preferences"
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-3.5 py-2 border-b border-border flex items-center justify-between gap-2 bg-surface overflow-x-auto">
            <div className="flex items-center gap-1 shrink-0">
              {availableCategories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    categoryFilter === cat.key
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setUnreadOnlyFilter((prev) => !prev)}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold shrink-0 transition cursor-pointer ${
                unreadOnlyFilter
                  ? "bg-foreground text-surface"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Unread only
            </button>
          </div>

          {/* Notification Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Loading notifications...</span>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-2xl bg-surface-muted text-muted-foreground flex items-center justify-center mx-auto mb-2.5">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-foreground mb-0.5">
                  {unreadOnlyFilter
                    ? "You're all caught up!"
                    : "No notifications yet"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {unreadOnlyFilter
                    ? "No unread alerts matching your current filter."
                    : "New orders, payment updates, and low-stock alerts will appear here."}
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 flex items-start gap-3 transition cursor-pointer hover:bg-surface-muted/60 ${
                    !item.isRead ? "bg-primary/[0.04]" : "bg-surface"
                  }`}
                >
                  {getCategoryIcon(item.category, item.priority)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-xs leading-snug truncate ${
                          !item.isRead
                            ? "font-extrabold text-foreground"
                            : "font-semibold text-foreground/85"
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-medium shrink-0 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                      {item.message}
                    </p>

                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-1.5">
                        {(item.priority === "URGENT" ||
                          item.priority === "HIGH") && (
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                              item.priority === "URGENT"
                                ? "bg-red-500/15 text-red-600"
                                : "bg-amber-500/15 text-amber-700"
                            }`}
                          >
                            {item.priority}
                          </span>
                        )}
                        {item.actionUrl && (
                          <span className="text-[10px] font-bold text-primary inline-flex items-center gap-0.5">
                            View <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>

                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkRead(item.id, e)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground hover:text-primary hover:bg-primary/10 transition cursor-pointer"
                          title="Mark as read"
                        >
                          <Check className="w-3 h-3" />
                          Read
                        </button>
                      )}
                    </div>
                  </div>

                  {!item.isRead && (
                    <span
                      className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5"
                      aria-label="Unread"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-border bg-surface-muted/30 flex items-center justify-between">
            <Link
              href="/dashboard/notifications"
              onClick={() => setIsOpen(false)}
              className="w-full py-1.5 px-3 rounded-xl text-center text-xs font-extrabold text-primary hover:bg-primary/10 transition"
            >
              Open Full Notification Center & Preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
