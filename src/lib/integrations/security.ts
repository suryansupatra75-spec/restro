import { URL } from "url";

/**
 * Validates outbound webhook URLs against SSRF (Server-Side Request Forgery).
 * Strictly forbids localhost, loopback, private IP ranges (RFC 1918), link-local,
 * cloud metadata endpoints (169.254.169.254), and non-standard protocols.
 */
export function isSafePublicUrl(urlString: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, reason: "URL must use HTTP or HTTPS protocol." };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and standard aliases
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return { valid: false, reason: "Localhost and loopback addresses are prohibited." };
    }

    // Block Cloud metadata service (AWS/GCP/Azure)
    if (hostname === "169.254.169.254" || hostname.startsWith("169.254.")) {
      return { valid: false, reason: "Cloud metadata endpoints are prohibited." };
    }

    // Check IPv4 private network ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const octet1 = parseInt(ipMatch[1], 10);
      const octet2 = parseInt(ipMatch[2], 10);

      // 10.0.0.0/8
      if (octet1 === 10) {
        return { valid: false, reason: "Private network IP addresses (10.0.0.0/8) are prohibited." };
      }
      // 172.16.0.0/12
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
        return { valid: false, reason: "Private network IP addresses (172.16.0.0/12) are prohibited." };
      }
      // 192.168.0.0/16
      if (octet1 === 192 && octet2 === 168) {
        return { valid: false, reason: "Private network IP addresses (192.168.0.0/16) are prohibited." };
      }
      // 127.0.0.0/8
      if (octet1 === 127) {
        return { valid: false, reason: "Loopback IP addresses (127.0.0.0/8) are prohibited." };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Malformed or invalid URL string." };
  }
}

/**
 * Masks sensitive passwords, secrets, and auth tokens.
 */
export function redactSecret(secret?: string | null, keepChars = 4): string {
  if (!secret) return "";
  if (secret.length <= keepChars * 2) {
    return "••••••••";
  }
  const prefix = secret.slice(0, keepChars);
  const suffix = secret.slice(-keepChars);
  return `${prefix}••••••••${suffix}`;
}

/**
 * Escapes values in CSV exports to completely prevent CSV Formula Injection
 * (e.g. cells starting with '=', '+', '-', '@', tab, or carriage return).
 */
export function sanitizeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);

  let safeStr = str;
  if (/^[=+\-@\t\r]/.test(safeStr)) {
    safeStr = `'${safeStr}`;
  }

  // Escape inner double quotes
  safeStr = safeStr.replace(/"/g, '""');
  return `"${safeStr}"`;
}
