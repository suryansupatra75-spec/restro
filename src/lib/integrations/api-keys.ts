import crypto from "crypto";
import { prisma } from "@/lib/db";
import { ApiScope } from "@/lib/validations/integrations";

export interface GeneratedApiKeyResult {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiScope[];
  rawKey: string;
  createdAt: Date;
  expiresAt: Date | null;
}

/**
 * Generates a new tenant-scoped API key.
 * The raw key is returned ONLY once during creation.
 * The database strictly stores the SHA-256 hash.
 */
export async function generateTenantApiKey(params: {
  restaurantId: string;
  name: string;
  scopes: ApiScope[];
  expiresInDays?: number | null;
  createdByUserId?: string | null;
}): Promise<GeneratedApiKeyResult> {
  const entropy = crypto.randomBytes(24).toString("hex");
  const rawKey = `rk_live_${entropy}`;
  const keyPrefix = rawKey.slice(0, 14); // e.g., "rk_live_1a2b3c"
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  let expiresAt: Date | null = null;
  if (params.expiresInDays && params.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000);
  }

  const record = await prisma.apiKey.create({
    data: {
      restaurantId: params.restaurantId,
      name: params.name,
      keyPrefix,
      keyHash,
      scopes: JSON.stringify(params.scopes),
      isActive: true,
      expiresAt,
      createdBy: params.createdByUserId || null,
    },
  });

  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    scopes: params.scopes,
    rawKey,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

/**
 * Authenticates an incoming request using a Bearer API token.
 * Hashes the token, looks up the active record, checks expiration, and updates `lastUsedAt`.
 */
export async function authenticateExternalApiKey(
  authHeader?: string | null
): Promise<{ restaurantId: string; scopes: string[]; keyName: string; keyId: string } | null> {
  if (!authHeader) return null;

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  const rawKey = parts[1].trim();
  if (!rawKey.startsWith("rk_live_")) {
    return null;
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: {
      restaurant: {
        select: { id: true, status: true },
      },
    },
  });

  if (!apiKey || !apiKey.isActive) return null;

  // Verify restaurant is active
  if (apiKey.restaurant.status !== "ACTIVE") return null;

  // Check expiration if applicable
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Update lastUsedAt in background
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => console.error("Failed to update apiKey lastUsedAt:", err));

  let parsedScopes: string[] = [];
  try {
    parsedScopes = JSON.parse(apiKey.scopes);
  } catch {
    parsedScopes = [];
  }

  return {
    restaurantId: apiKey.restaurantId,
    scopes: parsedScopes,
    keyName: apiKey.name,
    keyId: apiKey.id,
  };
}

/**
 * Lists tenant API keys (safely masked, hash never returned).
 */
export async function listTenantApiKeys(restaurantId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return keys.map((k) => ({
    ...k,
    scopes: JSON.parse(k.scopes) as string[],
  }));
}

/**
 * Revokes a tenant API key. Strictly scoped to restaurantId.
 */
export async function revokeTenantApiKey(restaurantId: string, apiKeyId: string): Promise<boolean> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, restaurantId },
  });

  if (!existing) return false;

  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  return true;
}
