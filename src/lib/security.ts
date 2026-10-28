import { NextRequest } from "next/server";
import crypto from "crypto";

/**
 * Validates that a redirect URL is strictly an internal, relative URL.
 * Prevents Open Redirect vulnerabilities (CWE-601).
 * Rejects absolute URLs (http://, https://), protocol-relative URLs (//evil.com),
 * backslash variants (/\\evil.com), and data/javascript URIs.
 */
export function isValidInternalRedirect(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();

  // Must begin with a single forward slash followed by a path character (not / or \)
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return false;

  // Must not contain scheme delimiter
  if (trimmed.includes("://") || trimmed.toLowerCase().startsWith("javascript:") || trimmed.toLowerCase().startsWith("data:")) {
    return false;
  }

  return true;
}

/**
 * Returns a validated internal redirect URL, falling back safely if invalid.
 */
export function getSafeRedirectUrl(target: string | null | undefined, fallback = "/dashboard"): string {
  if (isValidInternalRedirect(target)) {
    return target!.trim();
  }
  return fallback;
}

/**
 * SSRF (Server-Side Request Forgery) Protection.
 * Validates external URLs for webhooks, integrations, or callbacks.
 * Disallows loopback, link-local, private subnets, and cloud metadata IPs.
 */
export function isSafeOutgoingUrl(urlStr: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "Unsupported protocol. Only HTTP and HTTPS are permitted." };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, local domains, and AWS/GCP metadata
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "169.254.169.254" || // AWS / Azure metadata
      hostname === "metadata.google.internal"
    ) {
      return { safe: false, reason: "Targeting internal or metadata endpoints is forbidden." };
    }

    // Check private IPv4 ranges:
    // 127.0.0.0/8 (Loopback)
    // 10.0.0.0/8 (Private)
    // 172.16.0.0/12 (Private)
    // 192.168.0.0/16 (Private)
    // 0.0.0.0/8
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const octet1 = parseInt(match[1], 10);
      const octet2 = parseInt(match[2], 10);

      if (octet1 === 127 || octet1 === 0) {
        return { safe: false, reason: "Targeting loopback addresses is forbidden." };
      }
      if (octet1 === 10) {
        return { safe: false, reason: "Targeting private network addresses is forbidden." };
      }
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
        return { safe: false, reason: "Targeting private network addresses is forbidden." };
      }
      if (octet1 === 192 && octet2 === 168) {
        return { safe: false, reason: "Targeting private network addresses is forbidden." };
      }
      if (octet1 === 169 && octet2 === 254) {
        return { safe: false, reason: "Targeting link-local addresses is forbidden." };
      }
    }

    // Block IPv6 loopback
    if (hostname === "::1" || hostname === "[::1]") {
      return { safe: false, reason: "Targeting loopback addresses is forbidden." };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL format." };
  }
}

/**
 * Safely extracts client context (IP, User Agent, Correlation ID) from a NextRequest or standard Request.
 */
export function extractClientContext(req?: Request | NextRequest | null): {
  ipAddress: string;
  userAgent: string;
  requestId: string;
} {
  if (!req) {
    return {
      ipAddress: "127.0.0.1",
      userAgent: "Server-Internal",
      requestId: crypto.randomUUID(),
    };
  }

  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const cfConnectingIp = headers.get("cf-connecting-ip");

  const ipAddress = (cfConnectingIp || (forwarded ? forwarded.split(",")[0].trim() : null) || realIp || "127.0.0.1");
  const userAgent = headers.get("user-agent") || "Unknown Client";
  const requestId = headers.get("x-request-id") || crypto.randomUUID();

  return {
    ipAddress,
    userAgent,
    requestId,
  };
}
