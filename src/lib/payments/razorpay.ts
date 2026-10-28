import crypto from "crypto";

const DEFAULT_TEST_SECRET = process.env.RAZORPAY_KEY_SECRET || "rzp_test_secret_dev_key_2026";
const DEFAULT_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder_key";

export function getRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || DEFAULT_KEY_ID;
}

export function getRazorpayKeySecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || DEFAULT_TEST_SECRET;
}

export function getRazorpayWebhookSecret(): string {
  return process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || DEFAULT_TEST_SECRET;
}

export function isRealRazorpayConfigured(): boolean {
  return !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    !process.env.RAZORPAY_KEY_ID.includes("placeholder")
  );
}

/**
 * Creates an order in Razorpay (or generates an authenticated test order reference in dev mode)
 */
export async function createRazorpayOrder({
  amount, // in standard currency units (e.g. 100.50)
  currency,
  receipt,
  notes,
}: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ providerOrderId: string; amountInSubunits: number }> {
  // Amount in subunits (e.g. paisa/cents: 100.50 -> 10050)
  const amountInSubunits = Math.round(amount * 100);

  if (isRealRazorpayConfigured()) {
    const keyId = getRazorpayKeyId();
    const keySecret = getRazorpayKeySecret();
    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: amountInSubunits,
        currency: currency.toUpperCase(),
        receipt,
        notes,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Razorpay API Error: ${errData.error?.description || res.statusText}`);
    }

    const data = await res.json();
    return {
      providerOrderId: data.id,
      amountInSubunits: data.amount,
    };
  }

  // Development / Test mode order generation
  const testOrderId = `order_${crypto.randomBytes(8).toString("hex")}`;
  return {
    providerOrderId: testOrderId,
    amountInSubunits,
  };
}

/**
 * Cryptographically verifies Razorpay payment signature using HMAC SHA256 and timingSafeEqual
 */
export function verifyRazorpayPaymentSignature({
  razorpayOrderId,
  razorpayPaymentId,
  signature,
  secret = getRazorpayKeySecret(),
}: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  secret?: string;
}): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !signature) {
    return false;
  }

  try {
    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(text)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error("verifyRazorpayPaymentSignature error:", err);
    return false;
  }
}

/**
 * Generates signature for testing/simulation purposes
 */
export function generateTestPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  secret = getRazorpayKeySecret()
): string {
  const text = `${razorpayOrderId}|${razorpayPaymentId}`;
  return crypto.createHmac("sha256", secret).update(text).digest("hex");
}

/**
 * Verifies Razorpay Webhook signature using HMAC SHA256 on the raw request body
 */
export function verifyRazorpayWebhookSignature({
  rawBody,
  signature,
  secret = getRazorpayWebhookSecret(),
}: {
  rawBody: string;
  signature: string;
  secret?: string;
}): boolean {
  if (!rawBody || !signature) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error("verifyRazorpayWebhookSignature error:", err);
    return false;
  }
}
