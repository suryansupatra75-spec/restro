import crypto from "crypto";
import { prisma } from "@/lib/db";
import { isSafePublicUrl, redactSecret } from "./security";

export interface CreateWebhookParams {
  restaurantId: string;
  name: string;
  url: string;
  events: string[];
  isActive?: boolean;
}

export interface UpdateWebhookParams {
  restaurantId: string;
  id: string;
  name?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
}

/**
 * Creates a new outgoing webhook subscription for a tenant.
 */
export async function createTenantWebhookSubscription(params: CreateWebhookParams) {
  const urlCheck = isSafePublicUrl(params.url);
  if (!urlCheck.valid) {
    throw new Error(urlCheck.reason || "Invalid webhook destination URL.");
  }

  const secret = `whsec_${crypto.randomBytes(20).toString("hex")}`;

  const sub = await prisma.webhookSubscription.create({
    data: {
      restaurantId: params.restaurantId,
      name: params.name,
      url: params.url,
      secret,
      events: JSON.stringify(params.events),
      isActive: params.isActive !== undefined ? params.isActive : true,
    },
  });

  return {
    ...sub,
    events: JSON.parse(sub.events) as string[],
  };
}

/**
 * Updates an existing webhook subscription.
 */
export async function updateTenantWebhookSubscription(params: UpdateWebhookParams) {
  const existing = await prisma.webhookSubscription.findFirst({
    where: { id: params.id, restaurantId: params.restaurantId },
  });

  if (!existing) {
    throw new Error("Webhook subscription not found.");
  }

  if (params.url) {
    const urlCheck = isSafePublicUrl(params.url);
    if (!urlCheck.valid) {
      throw new Error(urlCheck.reason || "Invalid webhook destination URL.");
    }
  }

  const updated = await prisma.webhookSubscription.update({
    where: { id: params.id },
    data: {
      ...(params.name && { name: params.name }),
      ...(params.url && { url: params.url }),
      ...(params.events && { events: JSON.stringify(params.events) }),
      ...(params.isActive !== undefined && { isActive: params.isActive }),
    },
  });

  return {
    ...updated,
    events: JSON.parse(updated.events) as string[],
  };
}

/**
 * Deletes a webhook subscription.
 */
export async function deleteTenantWebhookSubscription(restaurantId: string, subscriptionId: string) {
  const existing = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, restaurantId },
  });

  if (!existing) {
    throw new Error("Webhook subscription not found.");
  }

  await prisma.webhookSubscription.delete({
    where: { id: subscriptionId },
  });

  return true;
}

/**
 * Lists webhook subscriptions with redacted secrets and delivery stats.
 */
export async function listTenantWebhookSubscriptions(restaurantId: string) {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { deliveries: true },
      },
    },
  });

  return subscriptions.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    secretRedacted: redactSecret(s.secret, 6),
    events: JSON.parse(s.events) as string[],
    isActive: s.isActive,
    failureCount: s.failureCount,
    lastTriggeredAt: s.lastTriggeredAt,
    lastError: s.lastError,
    totalDeliveries: s._count.deliveries,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

/**
 * Helper to compute HMAC-SHA256 signature for outgoing webhook payload.
 */
export function computeWebhookSignature(secret: string, payloadString: string): string {
  return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
}

/**
 * Dispatches an event payload to all matching active webhook subscriptions.
 * Fully decoupled and exception-safe: network errors or subscriber timeouts never throw to caller.
 */
export async function dispatchTenantWebhookEvent(
  restaurantId: string,
  eventName: string,
  eventData: Record<string, unknown>
): Promise<number> {
  try {
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
    });

    const matching = subscriptions.filter((sub) => {
      try {
        const events = JSON.parse(sub.events) as string[];
        return events.includes(eventName) || events.includes("*");
      } catch {
        return false;
      }
    });

    if (matching.length === 0) return 0;

    const payloadObj = {
      event: eventName,
      restaurantId,
      timestamp: new Date().toISOString(),
      data: eventData,
    };
    const payloadString = JSON.stringify(payloadObj);

    // Asynchronously dispatch to each subscriber
    for (const sub of matching) {
      deliverWebhookToSubscription(sub.id, sub.url, sub.secret, eventName, payloadString, restaurantId).catch(
        (err) => console.error(`[WEBHOOK_DISPATCH_ERROR] Subscription ${sub.id}:`, err)
      );
    }

    return matching.length;
  } catch (err) {
    console.error("[WEBHOOK_DISPATCH_ROOT_ERROR]", err);
    return 0;
  }
}

/**
 * Pings a webhook subscription with a mock event to verify connectivity.
 */
export async function pingTenantWebhookSubscription(restaurantId: string, subscriptionId: string) {
  const sub = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, restaurantId },
  });

  if (!sub) {
    throw new Error("Webhook subscription not found.");
  }

  const payloadObj = {
    event: "ping",
    restaurantId,
    timestamp: new Date().toISOString(),
    data: {
      message: "Test webhook delivery from restaurant SaaS",
      subscriptionId: sub.id,
      name: sub.name,
    },
  };

  const payloadString = JSON.stringify(payloadObj);

  return deliverWebhookToSubscription(sub.id, sub.url, sub.secret, "ping", payloadString, restaurantId);
}

/**
 * Internal delivery execution with timeout, signature header, and audit logging.
 */
async function deliverWebhookToSubscription(
  subscriptionId: string,
  url: string,
  secret: string,
  eventName: string,
  payloadString: string,
  restaurantId: string
) {
  const startTime = Date.now();
  const signature = computeWebhookSignature(secret, payloadString);

  let responseCode: number | null = null;
  let status: "SUCCESS" | "FAILED" = "FAILED";
  let errorSummary: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restaurant-Signature": signature,
        "X-Restaurant-Event": eventName,
        "User-Agent": "RestaurantSaaS-Webhook/2.0",
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseCode = res.status;
    status = res.ok ? "SUCCESS" : "FAILED";
    if (!res.ok) {
      errorSummary = `HTTP ${res.status}: ${res.statusText || "Endpoint rejected request"}`;
    }
  } catch (err: any) {
    status = "FAILED";
    errorSummary = err.name === "AbortError" ? "Delivery timed out (5000ms)" : err.message || "Network error";
  }

  const durationMs = Date.now() - startTime;

  // Record audit log
  await prisma.webhookDeliveryLog.create({
    data: {
      restaurantId,
      subscriptionId,
      event: eventName,
      status,
      responseCode,
      errorSummary,
      durationMs,
      payloadSummary: payloadString.slice(0, 300),
    },
  });

  // Update subscription stats
  await prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: {
      lastTriggeredAt: new Date(),
      lastError: status === "FAILED" ? errorSummary : null,
      failureCount: status === "FAILED" ? { increment: 1 } : 0,
    },
  });

  return {
    success: status === "SUCCESS",
    responseCode,
    error: errorSummary,
    durationMs,
  };
}

/**
 * Retrieves delivery logs for a tenant.
 */
export async function getTenantWebhookDeliveryLogs(restaurantId: string, limit = 50) {
  return prisma.webhookDeliveryLog.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      subscription: {
        select: { name: true, url: true },
      },
    },
  });
}
