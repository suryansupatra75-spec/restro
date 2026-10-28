import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  NotificationCategory,
  NotificationEventType,
  NotificationPriority,
  sanitizeActionUrl,
  UpdateNotificationPreferencesInput,
} from "@/lib/validations/notification";

export const EVENT_CATEGORY_MAP: Record<
  NotificationEventType,
  NotificationCategory
> = {
  ORDER_CREATED: "ORDERS",
  ORDER_STATUS_CHANGED: "ORDERS",
  PAYMENT_STATUS_CHANGED: "PAYMENTS",
  INVENTORY_LOW: "INVENTORY",
  STAFF_ACCESS_CHANGED: "STAFF",
  SUBSCRIPTION_STATUS_CHANGED: "BILLING",
};

/**
 * Checks whether a given role has permission to receive/view a notification event type.
 */
export function canRoleViewNotification(
  role: string,
  eventType: string
): boolean {
  switch (eventType as NotificationEventType) {
    case "ORDER_CREATED":
    case "ORDER_STATUS_CHANGED":
      return (
        hasPermission(role, "orders.view") ||
        hasPermission(role, "kitchen.view")
      );
    case "PAYMENT_STATUS_CHANGED":
      return hasPermission(role, "payments.view");
    case "INVENTORY_LOW":
      return hasPermission(role, "inventory.view");
    case "STAFF_ACCESS_CHANGED":
      return hasPermission(role, "staff.view");
    case "SUBSCRIPTION_STATUS_CHANGED":
      return hasPermission(role, "billing.view");
    default:
      return false;
  }
}

export interface NotificationPreferenceFlags {
  orderCreated: boolean;
  orderStatusChanged: boolean;
  paymentStatusChanged: boolean;
  inventoryLow: boolean;
  staffAccessChanged: boolean;
  inAppEnabled: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceFlags = {
  orderCreated: true,
  orderStatusChanged: true,
  paymentStatusChanged: true,
  inventoryLow: true,
  staffAccessChanged: true,
  inAppEnabled: true,
  soundEnabled: true,
};

export function isEventEnabledInPreferences(
  prefs: NotificationPreferenceFlags,
  eventType: NotificationEventType
): boolean {
  if (!prefs.inAppEnabled) return false;
  switch (eventType) {
    case "ORDER_CREATED":
      return prefs.orderCreated;
    case "ORDER_STATUS_CHANGED":
      return prefs.orderStatusChanged;
    case "PAYMENT_STATUS_CHANGED":
      return prefs.paymentStatusChanged;
    case "INVENTORY_LOW":
      return prefs.inventoryLow;
    case "STAFF_ACCESS_CHANGED":
      return prefs.staffAccessChanged;
    default:
      return true;
  }
}

/**
 * Sanitizes notification metadata and actionUrl according to the recipient's role permissions.
 * For example, KITCHEN roles do not have `payments.view` or `customers.view`, so financial totals
 * and customer contact PII are stripped.
 */
export function sanitizeMetadataForRole(
  role: string,
  metadataObj: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!metadataObj || typeof metadataObj !== "object") return null;

  const canViewPayments = hasPermission(role, "payments.view");
  const canViewCustomers = hasPermission(role, "customers.view");

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadataObj)) {
    // Strip any secret/internal keys unconditionally
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("secret") ||
      lowerKey.includes("signature") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password")
    ) {
      continue;
    }

    // Strip financial fields for roles without payments.view
    if (
      !canViewPayments &&
      (key === "totalAmount" ||
        key === "amount" ||
        key === "subtotal" ||
        key === "taxAmount" ||
        key === "discountAmount" ||
        key === "paymentMethod" ||
        key === "costPerUnit")
    ) {
      continue;
    }

    // Strip customer PII for roles without customers.view
    if (
      !canViewCustomers &&
      (key === "customerPhone" ||
        key === "customerEmail" ||
        key === "customerName")
    ) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export interface DispatchNotificationInput {
  restaurantId: string;
  eventType: NotificationEventType;
  title: string | ((role: string) => string);
  message: string | ((role: string) => string);
  priority?: NotificationPriority;
  actionUrl?: string | ((role: string) => string | null) | null;
  entityType?: "ORDER" | "PAYMENT" | "INVENTORY_ITEM" | "STAFF";
  entityId?: string;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
  excludeUserId?: string;
}

/**
 * Dispatches an in-app notification to all active, authorized, opted-in members of a restaurant.
 * Uses deterministic deduplication keys so retries or duplicate triggers are idempotent.
 */
export async function dispatchNotificationEvent(
  input: DispatchNotificationInput
): Promise<number> {
  try {
    const {
      restaurantId,
      eventType,
      title,
      message,
      priority = "NORMAL",
      actionUrl,
      entityType,
      entityId,
      metadata,
      dedupeKey,
      excludeUserId,
    } = input;

    const category = EVENT_CATEGORY_MAP[eventType] || "ORDERS";

    // Fetch active restaurant members and tenant notification preferences concurrently
    const [members, existingPrefs] = await Promise.all([
      prisma.restaurantUser.findMany({
        where: {
          restaurantId,
          status: "ACTIVE",
          user: {
            isActive: true,
          },
        },
        select: {
          userId: true,
          role: true,
        },
      }),
      prisma.notificationPreference.findMany({
        where: {
          restaurantId,
        },
      }),
    ]);

    if (members.length === 0) return 0;

    // Filter members by role permission and optional excludeUserId
    const eligibleMembers = members.filter((m) => {
      if (excludeUserId && m.userId === excludeUserId) return false;
      return canRoleViewNotification(m.role, eventType);
    });

    if (eligibleMembers.length === 0) return 0;

    const prefsByUserId = new Map(existingPrefs.map((p) => [p.userId, p]));

    const upsertTasks = eligibleMembers
      .filter((member) => {
        const userPrefs =
          prefsByUserId.get(member.userId) ?? DEFAULT_NOTIFICATION_PREFERENCES;
        return isEventEnabledInPreferences(userPrefs, eventType);
      })
      .map(async (member) => {
        const resolvedTitle =
          typeof title === "function" ? title(member.role) : title;
        const resolvedMessage =
          typeof message === "function" ? message(member.role) : message;
        const rawActionUrl =
          typeof actionUrl === "function" ? actionUrl(member.role) : actionUrl;
        const safeActionUrl = sanitizeActionUrl(rawActionUrl);
        const roleMetadata = sanitizeMetadataForRole(member.role, metadata);

        try {
          await prisma.notification.upsert({
            where: {
              userId_dedupeKey: {
                userId: member.userId,
                dedupeKey,
              },
            },
            update: {}, // Idempotent no-op if already created for this user + dedupeKey
            create: {
              restaurantId,
              userId: member.userId,
              eventType,
              title: resolvedTitle,
              message: resolvedMessage,
              priority,
              category,
              actionUrl: safeActionUrl,
              entityType: entityType ?? null,
              entityId: entityId ?? null,
              metadata: roleMetadata ? JSON.stringify(roleMetadata) : null,
              dedupeKey,
            },
          });
          return 1;
        } catch (err) {
          console.error(
            `[NotificationService] Failed to upsert notification for user ${member.userId}:`,
            err
          );
          return 0;
        }
      });

    const results = await Promise.all(upsertTasks);
    const createdCount = results.reduce((sum: number, c: number) => sum + c, 0);

    return createdCount;
  } catch (error) {
    console.error("[NotificationService] dispatchNotificationEvent error:", error);
    return 0;
  }
}

// ============================================================================
// Domain Event Trigger Helpers
// ============================================================================

export async function notifyOrderCreated(params: {
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  tableName?: string | null;
  tableNumber?: string | null;
  itemCount: number;
  totalAmount: number;
  customerName?: string | null;
}): Promise<number> {
  const tableLabel =
    params.tableName ||
    (params.tableNumber ? `Table ${params.tableNumber}` : "Takeaway");

  return dispatchNotificationEvent({
    restaurantId: params.restaurantId,
    eventType: "ORDER_CREATED",
    priority: "HIGH",
    entityType: "ORDER",
    entityId: params.orderId,
    dedupeKey: `order_created:${params.orderId}`,
    title: () => `New Order ${params.orderNumber}`,
    message: (role: string) => {
      const canViewPayments = hasPermission(role, "payments.view");
      if (canViewPayments) {
        return `${tableLabel} placed an order with ${params.itemCount} item${params.itemCount === 1 ? "" : "s"} ($${Number(params.totalAmount).toFixed(2)}).`;
      }
      return `${tableLabel} placed an order with ${params.itemCount} item${params.itemCount === 1 ? "" : "s"}.`;
    },
    actionUrl: (role: string) =>
      role === "KITCHEN" ? "/dashboard/kitchen" : "/dashboard/orders",
    metadata: {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      tableLabel,
      itemCount: params.itemCount,
      totalAmount: Number(params.totalAmount),
      customerName: params.customerName || undefined,
    },
  });
}

export async function notifyOrderStatusChanged(params: {
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  previousStatus: string;
  newStatus: string;
  tableName?: string | null;
  tableNumber?: string | null;
  actorUserId?: string;
}): Promise<number> {
  if (params.previousStatus === params.newStatus) return 0;

  const tableLabel =
    params.tableName ||
    (params.tableNumber ? `Table ${params.tableNumber}` : "Table");

  const priorityMap: Record<string, NotificationPriority> = {
    READY: "HIGH",
    CANCELLED: "HIGH",
    PREPARING: "NORMAL",
    ACCEPTED: "NORMAL",
    COMPLETED: "LOW",
  };

  const statusLabels: Record<string, string> = {
    PLACED: "Placed",
    ACCEPTED: "Accepted",
    PREPARING: "Preparing",
    READY: "Ready to Serve",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };

  const readableStatus = statusLabels[params.newStatus] || params.newStatus;

  return dispatchNotificationEvent({
    restaurantId: params.restaurantId,
    eventType: "ORDER_STATUS_CHANGED",
    priority: priorityMap[params.newStatus] || "NORMAL",
    entityType: "ORDER",
    entityId: params.orderId,
    dedupeKey: `order_status:${params.orderId}:${params.newStatus}`,
    title: () => `Order ${params.orderNumber} ${readableStatus}`,
    message: () =>
      `Order ${params.orderNumber} (${tableLabel}) moved from ${params.previousStatus} to ${params.newStatus}.`,
    actionUrl: (role: string) =>
      role === "KITCHEN" ? "/dashboard/kitchen" : "/dashboard/orders",
    metadata: {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      tableLabel,
    },
  });
}

export async function notifyPaymentStatusChanged(params: {
  restaurantId: string;
  paymentId: string;
  orderId: string;
  orderNumber: string;
  status: "PAID" | "FAILED";
  amount: number;
  currency?: string;
  paymentMethod?: string | null;
  failureReason?: string | null;
}): Promise<number> {
  const isPaid = params.status === "PAID";
  const formattedAmount = `$${Number(params.amount).toFixed(2)}`;

  return dispatchNotificationEvent({
    restaurantId: params.restaurantId,
    eventType: "PAYMENT_STATUS_CHANGED",
    priority: isPaid ? "NORMAL" : "HIGH",
    entityType: "PAYMENT",
    entityId: params.paymentId,
    dedupeKey: `payment_status:${params.paymentId}:${params.status}`,
    title: isPaid
      ? `Payment Received (${params.orderNumber})`
      : `Payment Failed (${params.orderNumber})`,
    message: isPaid
      ? `Payment of ${formattedAmount} for Order ${params.orderNumber} was verified as PAID${params.paymentMethod ? ` via ${params.paymentMethod}` : ""}.`
      : `Payment of ${formattedAmount} for Order ${params.orderNumber} failed${params.failureReason ? `: ${params.failureReason}` : "."}`,
    actionUrl: "/dashboard/orders",
    metadata: {
      paymentId: params.paymentId,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      status: params.status,
      amount: Number(params.amount),
      currency: params.currency || "USD",
      paymentMethod: params.paymentMethod || undefined,
    },
  });
}

export async function notifyInventoryLowStock(params: {
  restaurantId: string;
  itemId: string;
  itemName: string;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  isActive?: boolean;
}): Promise<number> {
  if (params.isActive === false) return 0;

  const current = Number(params.currentStock);
  const threshold = Number(params.lowStockThreshold);

  if (current > threshold) return 0;

  const isOutOfStock = current <= 0;
  const stockState = isOutOfStock ? "OUT_OF_STOCK" : "LOW_STOCK";
  const dateBucket = new Date().toISOString().slice(0, 10); // YYYY-MM-DD bucket so same low-stock state doesn't spam repeatedly in a day

  return dispatchNotificationEvent({
    restaurantId: params.restaurantId,
    eventType: "INVENTORY_LOW",
    priority: isOutOfStock ? "URGENT" : "HIGH",
    entityType: "INVENTORY_ITEM",
    entityId: params.itemId,
    dedupeKey: `inventory_low:${params.itemId}:${stockState}:${dateBucket}`,
    title: isOutOfStock
      ? `Out of Stock: ${params.itemName}`
      : `Low Stock Alert: ${params.itemName}`,
    message: isOutOfStock
      ? `${params.itemName} is out of stock (${current} ${params.unit} remaining, threshold: ${threshold} ${params.unit}).`
      : `${params.itemName} is running low (${current} ${params.unit} remaining, threshold: ${threshold} ${params.unit}).`,
    actionUrl: "/dashboard/inventory",
    metadata: {
      itemId: params.itemId,
      itemName: params.itemName,
      currentStock: current,
      lowStockThreshold: threshold,
      unit: params.unit,
      stockState,
    },
  });
}

export async function notifyStaffAccessChanged(params: {
  restaurantId: string;
  action:
    | "STAFF_INVITED"
    | "INVITATION_ACCEPTED"
    | "ROLE_CHANGED"
    | "STAFF_DISABLED"
    | "STAFF_ENABLED"
    | "STAFF_REMOVED";
  targetIdentifier: string; // email or name
  role?: string;
  entityId: string;
  dedupeSuffix?: string;
}): Promise<number> {
  const titles: Record<typeof params.action, string> = {
    STAFF_INVITED: "Staff Invitation Sent",
    INVITATION_ACCEPTED: "Staff Member Joined",
    ROLE_CHANGED: "Staff Role Updated",
    STAFF_DISABLED: "Staff Account Disabled",
    STAFF_ENABLED: "Staff Account Enabled",
    STAFF_REMOVED: "Staff Member Removed",
  };

  const messages: Record<typeof params.action, string> = {
    STAFF_INVITED: `Invitation sent to ${params.targetIdentifier}${params.role ? ` as ${params.role}` : ""}.`,
    INVITATION_ACCEPTED: `${params.targetIdentifier} accepted their invitation${params.role ? ` as ${params.role}` : ""}.`,
    ROLE_CHANGED: `${params.targetIdentifier}'s role was updated${params.role ? ` to ${params.role}` : ""}.`,
    STAFF_DISABLED: `${params.targetIdentifier}'s access was disabled.`,
    STAFF_ENABLED: `${params.targetIdentifier}'s access was re-enabled.`,
    STAFF_REMOVED: `${params.targetIdentifier} was removed from the restaurant team.`,
  };

  const suffix = params.dedupeSuffix || `${params.role || ""}`;

  return dispatchNotificationEvent({
    restaurantId: params.restaurantId,
    eventType: "STAFF_ACCESS_CHANGED",
    priority: "NORMAL",
    entityType: "STAFF",
    entityId: params.entityId,
    dedupeKey: `staff_access:${params.action}:${params.entityId}:${suffix}`,
    title: titles[params.action],
    message: messages[params.action],
    actionUrl: "/dashboard/staff",
    metadata: {
      action: params.action,
      targetIdentifier: params.targetIdentifier,
      role: params.role,
      entityId: params.entityId,
    },
  });
}

export async function createNotification(params: {
  restaurantId: string;
  type: NotificationEventType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}): Promise<number> {
  const dedupeKey =
    params.dedupeKey ||
    `sub_event:${params.restaurantId}:${params.title}:${Date.now()}`;

  return dispatchNotificationEvent({
    restaurantId: params.restaurantId,
    eventType: params.type,
    priority: "HIGH",
    title: params.title,
    message: params.message,
    actionUrl: "/dashboard/billing",
    metadata: params.metadata,
    dedupeKey,
  });
}

// ============================================================================
// Query & Preference Management Helpers
// ============================================================================

export async function getOrCreateNotificationPreferences(
  restaurantId: string,
  userId: string
) {
  const existing = await prisma.notificationPreference.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId,
        userId,
      },
    },
  });

  if (existing) return existing;

  return prisma.notificationPreference.create({
    data: {
      restaurantId,
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    },
  });
}

export async function updateNotificationPreferences(
  restaurantId: string,
  userId: string,
  updates: UpdateNotificationPreferencesInput
) {
  const { restaurantId: _ignore, ...fields } = updates;
  return prisma.notificationPreference.upsert({
    where: {
      restaurantId_userId: {
        restaurantId,
        userId,
      },
    },
    update: fields,
    create: {
      restaurantId,
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...fields,
    },
  });
}

export async function listUserNotifications(params: {
  restaurantId: string;
  userId: string;
  role: string;
  unreadOnly?: boolean;
  category?: string;
  eventType?: string;
  since?: string;
  limit?: number;
}) {
  const {
    restaurantId,
    userId,
    role,
    unreadOnly = false,
    category = "ALL",
    eventType = "ALL",
    since,
    limit = 30,
  } = params;

  // Determine which eventTypes this role is currently permitted to see
  const permittedEventTypes = (
    [
      "ORDER_CREATED",
      "ORDER_STATUS_CHANGED",
      "PAYMENT_STATUS_CHANGED",
      "INVENTORY_LOW",
      "STAFF_ACCESS_CHANGED",
      "SUBSCRIPTION_STATUS_CHANGED",
    ] as NotificationEventType[]
  ).filter((et) => canRoleViewNotification(role, et));

  const effectiveEventTypes =
    eventType && eventType !== "ALL"
      ? permittedEventTypes.filter((et) => et === eventType)
      : permittedEventTypes;

  // Base scope for unread counter (always reflects all unread notifications permitted for this user's current role)
  const unreadWhere = {
    restaurantId,
    userId,
    isRead: false,
    eventType: { in: permittedEventTypes },
  };

  const listWhere: Record<string, unknown> = {
    restaurantId,
    userId,
    eventType: { in: effectiveEventTypes },
  };

  if (unreadOnly) {
    listWhere.isRead = false;
  }

  if (category && category !== "ALL") {
    listWhere.category = category;
  }

  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      listWhere.createdAt = { gt: sinceDate };
    }
  }

  const [rawNotifications, unreadCount, preferences] = await Promise.all([
    prisma.notification.findMany({
      where: listWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    }),
    prisma.notification.count({
      where: unreadWhere,
    }),
    getOrCreateNotificationPreferences(restaurantId, userId),
  ]);

  // Dynamically sanitize metadata and actionUrl for the user's current role
  const notifications = rawNotifications.map((n) => {
    let parsedMeta: Record<string, unknown> | null = null;
    if (n.metadata) {
      try {
        parsedMeta = JSON.parse(n.metadata);
      } catch {
        parsedMeta = null;
      }
    }
    const sanitizedMeta = sanitizeMetadataForRole(role, parsedMeta);
    let safeUrl = sanitizeActionUrl(n.actionUrl);
    if (role === "KITCHEN" && safeUrl === "/dashboard/orders") {
      safeUrl = "/dashboard/kitchen";
    }

    return {
      id: n.id,
      restaurantId: n.restaurantId,
      userId: n.userId,
      eventType: n.eventType,
      title: n.title,
      message: n.message,
      priority: n.priority as NotificationPriority,
      category: n.category as NotificationCategory,
      actionUrl: safeUrl,
      entityType: n.entityType,
      entityId: n.entityId,
      metadata: sanitizedMeta,
      isRead: n.isRead,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    };
  });

  const latestCursor =
    notifications.length > 0
      ? notifications[0].createdAt
      : since || new Date().toISOString();

  return {
    notifications,
    unreadCount,
    cursor: latestCursor,
    preferences: {
      orderCreated: preferences.orderCreated,
      orderStatusChanged: preferences.orderStatusChanged,
      paymentStatusChanged: preferences.paymentStatusChanged,
      inventoryLow: preferences.inventoryLow,
      staffAccessChanged: preferences.staffAccessChanged,
      inAppEnabled: preferences.inAppEnabled,
      soundEnabled: preferences.soundEnabled,
    },
  };
}
