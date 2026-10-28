import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  AuditLogQuery,
  redactSensitiveData,
  sanitizeCsvField,
} from "@/lib/validations/audit";
import { extractClientContext } from "@/lib/security";
import { NextRequest } from "next/server";

export interface RecordAuditParams {
  restaurantId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceName?: string | null;
  outcome?: "SUCCESS" | "FAILURE" | "DENIED";
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  req?: Request | NextRequest | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Server-generated, append-only audit record logger.
 * Recursively redacts sensitive credentials (passwords, tokens, API keys)
 * and safely isolates tenant scope.
 * Defined fail-safe: Audit recording errors will never crash critical business transactions.
 */
export async function recordAuditLog(params: RecordAuditParams) {
  try {
    const {
      restaurantId = null,
      actorId = null,
      actorEmail = null,
      actorName = null,
      actorRole = null,
      action,
      resourceType,
      resourceId = null,
      resourceName = null,
      outcome = "SUCCESS",
      reason = null,
      metadata = null,
      req = null,
    } = params;

    // Extract client context if not explicitly provided
    let ip = params.ipAddress;
    let ua = params.userAgent;
    let reqId = params.requestId;

    if (req && (!ip || !ua || !reqId)) {
      const clientCtx = extractClientContext(req);
      if (!ip) ip = clientCtx.ipAddress;
      if (!ua) ua = clientCtx.userAgent;
      if (!reqId) reqId = clientCtx.requestId;
    }

    // Strictly redact passwords, tokens, API keys, card numbers from metadata
    let safeMetadataString: string | null = null;
    if (metadata && typeof metadata === "object") {
      const redacted = redactSensitiveData(metadata);
      safeMetadataString = JSON.stringify(redacted);
    }

    return await prisma.auditLog.create({
      data: {
        restaurantId,
        actorId,
        actorEmail,
        actorName,
        actorRole,
        action,
        resourceType,
        resourceId,
        resourceName,
        outcome,
        reason,
        metadata: safeMetadataString,
        ipAddress: ip || "127.0.0.1",
        userAgent: ua ? (ua.length > 500 ? ua.substring(0, 500) : ua) : "Unknown",
        requestId: reqId || null,
      },
    });
  } catch (error) {
    // Fail-safe: log to stderr, do not throw to break primary transaction
    console.error("[AUDIT_LOG_WRITE_FAILURE]", error);
    return null;
  }
}

/**
 * Tenant-scoped query for audit logs with pagination and filters.
 * Strictly prevents cross-tenant access by scoping to restaurantId.
 */
export async function queryAuditLogs(
  restaurantId: string,
  query: AuditLogQuery
) {
  const { page, limit, search, action, resourceType, outcome, startDate, endDate, actorId } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    restaurantId, // Strict tenant isolation
  };

  if (action && action !== "ALL") {
    where.action = action;
  }

  if (resourceType && resourceType !== "ALL") {
    where.resourceType = resourceType;
  }

  if (outcome && outcome !== "ALL") {
    where.outcome = outcome;
  }

  if (actorId) {
    where.actorId = actorId;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (search && search.trim().length > 0) {
    const s = search.trim();
    where.OR = [
      { action: { contains: s } },
      { resourceType: { contains: s } },
      { resourceName: { contains: s } },
      { actorEmail: { contains: s } },
      { actorName: { contains: s } },
      { reason: { contains: s } },
      { ipAddress: { contains: s } },
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ]);

  return {
    logs: logs.map((log) => ({
      id: log.id,
      restaurantId: log.restaurantId,
      actor: {
        id: log.actorId,
        email: log.actorEmail,
        name: log.actorName,
        role: log.actorRole,
        avatarUrl: log.actor?.avatarUrl || null,
      },
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      resourceName: log.resourceName,
      outcome: log.outcome,
      reason: log.reason,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      requestId: log.requestId,
      createdAt: log.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Fetch a single audit log with strict tenant isolation.
 * Prevents IDOR/BOLA attacks.
 */
export async function getAuditLogById(id: string, restaurantId: string) {
  const log = await prisma.auditLog.findFirst({
    where: {
      id,
      restaurantId, // Strict tenant scope
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!log) return null;

  return {
    id: log.id,
    restaurantId: log.restaurantId,
    actor: {
      id: log.actorId,
      email: log.actorEmail,
      name: log.actorName,
      role: log.actorRole,
      avatarUrl: log.actor?.avatarUrl || null,
    },
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    resourceName: log.resourceName,
    outcome: log.outcome,
    reason: log.reason,
    metadata: log.metadata ? JSON.parse(log.metadata) : null,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    requestId: log.requestId,
    createdAt: log.createdAt.toISOString(),
  };
}

/**
 * Generates an immutable CSV string for audit logs.
 * Sanitizes every cell against formula injection.
 */
export async function buildAuditLogCsvString(
  restaurantName: string,
  restaurantId: string,
  query: AuditLogQuery
): Promise<string> {
  const { logs } = await queryAuditLogs(restaurantId, {
    ...query,
    page: 1,
    limit: 1000, // Export up to 1000 records
  });

  const lines: string[] = [];

  // Header / Metadata
  lines.push(`${sanitizeCsvField("Restaurant")},${sanitizeCsvField(restaurantName)}`);
  lines.push(`${sanitizeCsvField("Exported At (UTC)")},${sanitizeCsvField(new Date().toISOString())}`);
  lines.push(`${sanitizeCsvField("Total Records")},${sanitizeCsvField(logs.length)}`);
  lines.push("");

  // Column Headers
  lines.push(
    [
      sanitizeCsvField("Event ID"),
      sanitizeCsvField("Timestamp (UTC)"),
      sanitizeCsvField("Actor Name"),
      sanitizeCsvField("Actor Email"),
      sanitizeCsvField("Actor Role"),
      sanitizeCsvField("Action"),
      sanitizeCsvField("Resource Type"),
      sanitizeCsvField("Resource ID"),
      sanitizeCsvField("Resource Name"),
      sanitizeCsvField("Outcome"),
      sanitizeCsvField("Reason"),
      sanitizeCsvField("IP Address"),
      sanitizeCsvField("Correlation ID"),
      sanitizeCsvField("Safe Metadata"),
    ].join(",")
  );

  // Rows
  for (const log of logs) {
    lines.push(
      [
        sanitizeCsvField(log.id),
        sanitizeCsvField(log.createdAt),
        sanitizeCsvField(log.actor.name || "System"),
        sanitizeCsvField(log.actor.email || "N/A"),
        sanitizeCsvField(log.actor.role || "SYSTEM"),
        sanitizeCsvField(log.action),
        sanitizeCsvField(log.resourceType),
        sanitizeCsvField(log.resourceId || ""),
        sanitizeCsvField(log.resourceName || ""),
        sanitizeCsvField(log.outcome),
        sanitizeCsvField(log.reason || ""),
        sanitizeCsvField(log.ipAddress || ""),
        sanitizeCsvField(log.requestId || ""),
        sanitizeCsvField(log.metadata ? JSON.stringify(log.metadata) : ""),
      ].join(",")
    );
  }

  return lines.join("\r\n");
}
