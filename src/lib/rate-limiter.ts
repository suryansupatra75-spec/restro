/**
 * In-memory sliding window rate limiter.
 * Protects sensitive endpoints (login, password recovery, data export, receipt resend)
 * against brute-force and denial-of-service attempts.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Periodic garbage collection every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (now > entry.resetAt) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Checks and updates rate limit for a given key.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New or expired window
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      retryAfterSeconds: 0,
    };
  }

  if (entry.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Clears a rate limit entry (e.g. after successful login).
 */
export function resetRateLimit(key: string): void {
  memoryStore.delete(key);
}

/**
 * Login endpoint rate limiter: 5 attempts per 15 minutes per IP or Email.
 */
export function checkLoginRateLimit(identifier: string) {
  return checkRateLimit(`login:${identifier.toLowerCase()}`, 5, 15 * 60);
}

/**
 * Export rate limiter: 10 exports per 10 minutes per restaurant.
 */
export function checkExportRateLimit(restaurantId: string) {
  return checkRateLimit(`export:${restaurantId}`, 10, 10 * 60);
}

/**
 * Sensitive operation rate limiter: 5 actions per 5 minutes.
 */
export function checkSensitiveRateLimit(key: string) {
  return checkRateLimit(`sensitive:${key}`, 5, 5 * 60);
}
