import crypto from "crypto";

export interface SaasBillingConfigSummary {
  mode: "LIVE_RAZORPAY" | "SANDBOX";
  providerName: "RAZORPAY" | "SANDBOX";
  isLiveConfigured: boolean;
  isSandbox: boolean;
  publicKeyId: string | null;
  webhookConfigured: boolean;
  requiredEnvVars: readonly string[];
}

export const REQUIRED_SAAS_BILLING_ENV_VARS = [
  "SAAS_BILLING_RAZORPAY_KEY_ID",
  "SAAS_BILLING_RAZORPAY_KEY_SECRET",
  "SAAS_BILLING_WEBHOOK_SECRET",
] as const;

const SANDBOX_DEV_WEBHOOK_SECRET = "sandbox_webhook_secret_phase17_local_test_only";

/**
 * Inspects environment variables for SaaS platform billing.
 * Kept strictly separate from tenant food-order Razorpay credentials.
 * Never exposes secret values.
 */
export function getSaasBillingConfig(): SaasBillingConfigSummary {
  const keyId = process.env.SAAS_BILLING_RAZORPAY_KEY_ID?.trim() || "";
  const keySecret = process.env.SAAS_BILLING_RAZORPAY_KEY_SECRET?.trim() || "";
  const webhookSecret = process.env.SAAS_BILLING_WEBHOOK_SECRET?.trim() || "";

  const isPlaceholder =
    !keyId ||
    !keySecret ||
    keyId.includes("placeholder") ||
    keySecret.includes("placeholder");

  const webhookConfigured = Boolean(
    webhookSecret && !webhookSecret.includes("placeholder")
  );

  const isLiveConfigured = !isPlaceholder && webhookConfigured;

  return {
    mode: isLiveConfigured ? "LIVE_RAZORPAY" : "SANDBOX",
    providerName: isLiveConfigured ? "RAZORPAY" : "SANDBOX",
    isLiveConfigured,
    isSandbox: !isLiveConfigured,
    publicKeyId: isLiveConfigured ? keyId : null,
    webhookConfigured,
    requiredEnvVars: REQUIRED_SAAS_BILLING_ENV_VARS,
  };
}

export interface CreateSaasCheckoutInput {
  restaurantId: string;
  subscriptionId: string;
  invoiceId: string;
  planKey: string;
  planName: string;
  amountMinor: number;
  currency: string;
  simulateTimeout?: boolean;
}

export interface SaasCheckoutSessionResult {
  provider: "RAZORPAY" | "SANDBOX";
  isSandbox: boolean;
  liveCheckoutAvailable: boolean;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  publicKeyId: string | null;
  notice: string;
}

/**
 * Creates a server-side checkout session for a SaaS subscription invoice.
 * Never marks the invoice paid or subscription active; completion requires a verified webhook.
 */
export async function createSaasCheckoutSession(
  input: CreateSaasCheckoutInput
): Promise<SaasCheckoutSessionResult> {
  if (input.simulateTimeout) {
    throw new Error("PROVIDER_TIMEOUT: Billing provider did not respond within timeout window");
  }

  const config = getSaasBillingConfig();

  if (!config.isLiveConfigured) {
    const sandboxOrderId = `saas_sandbox_order_${crypto.randomBytes(8).toString("hex")}`;
    return {
      provider: "SANDBOX",
      isSandbox: true,
      liveCheckoutAvailable: false,
      providerOrderId: sandboxOrderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      publicKeyId: null,
      notice:
        "Sandbox / Test Mode: Live SaaS billing provider credentials (SAAS_BILLING_RAZORPAY_KEY_ID, SAAS_BILLING_RAZORPAY_KEY_SECRET, SAAS_BILLING_WEBHOOK_SECRET) are not configured. No real charge was created.",
    };
  }

  const keyId = process.env.SAAS_BILLING_RAZORPAY_KEY_ID!.trim();
  const keySecret = process.env.SAAS_BILLING_RAZORPAY_KEY_SECRET!.trim();
  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  let order: { id: string; amount: number; currency: string };
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency.toUpperCase(),
        receipt: `saas_inv_${input.invoiceId.slice(-16)}`,
        notes: {
          billingType: "SAAS_SUBSCRIPTION",
          restaurantId: input.restaurantId,
          subscriptionId: input.subscriptionId,
          invoiceId: input.invoiceId,
          planKey: input.planKey,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        `Razorpay SaaS API Error: ${errData.error?.description || res.statusText}`
      );
    }

    order = await res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("PROVIDER_TIMEOUT: Billing provider request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  return {
    provider: "RAZORPAY",
    isSandbox: false,
    liveCheckoutAvailable: true,
    providerOrderId: order.id,
    amountMinor: Number(order.amount),
    currency: order.currency,
    publicKeyId: keyId,
    notice: "Live checkout session created. Subscription activates only after verified webhook confirmation.",
  };
}

/**
 * Verifies the HMAC-SHA256 webhook signature using constant-time comparison.
 * In production, requires SAAS_BILLING_WEBHOOK_SECRET to be set.
 * In non-production sandbox mode, uses SANDBOX_DEV_WEBHOOK_SECRET if SAAS_BILLING_WEBHOOK_SECRET is not set.
 */
export function verifySubscriptionWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): { valid: boolean; reason?: string } {
  if (!signatureHeader || typeof signatureHeader !== "string" || signatureHeader.trim().length === 0) {
    return { valid: false, reason: "Missing x-saas-webhook-signature header" };
  }

  const configuredSecret = process.env.SAAS_BILLING_WEBHOOK_SECRET?.trim();
  const effectiveSecret =
    configuredSecret && !configuredSecret.includes("placeholder")
      ? configuredSecret
      : process.env.NODE_ENV !== "production"
        ? SANDBOX_DEV_WEBHOOK_SECRET
        : null;

  if (!effectiveSecret) {
    return {
      valid: false,
      reason: "SAAS_BILLING_WEBHOOK_SECRET is not configured",
    };
  }

  const expectedHex = crypto
    .createHmac("sha256", effectiveSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const providedHex = signatureHeader.trim();

  if (expectedHex.length !== providedHex.length) {
    return { valid: false, reason: "Invalid webhook signature length" };
  }

  try {
    const expectedBuf = Buffer.from(expectedHex, "utf8");
    const providedBuf = Buffer.from(providedHex, "utf8");
    const match = crypto.timingSafeEqual(expectedBuf, providedBuf);
    return match ? { valid: true } : { valid: false, reason: "Webhook signature mismatch" };
  } catch {
    return { valid: false, reason: "Failed to verify webhook signature" };
  }
}

/**
 * Helper used only in local/automated sandbox tests to sign a test webhook payload.
 */
export function computeSandboxWebhookSignature(rawBody: string): string {
  const configuredSecret = process.env.SAAS_BILLING_WEBHOOK_SECRET?.trim();
  const effectiveSecret =
    configuredSecret && !configuredSecret.includes("placeholder")
      ? configuredSecret
      : SANDBOX_DEV_WEBHOOK_SECRET;

  return crypto.createHmac("sha256", effectiveSecret).update(rawBody, "utf8").digest("hex");
}
