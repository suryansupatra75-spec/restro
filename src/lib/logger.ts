/**
 * Production-Ready Structured Redacting Logger.
 * Emits machine-parseable JSON logs in production for Datadog, CloudWatch, Loki, or stdout.
 * Guarantees automatic redaction of sensitive credentials and secrets.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /auth/i,
  /cookie/i,
  /card/i,
  /cvv/i,
  /session/i,
  /bearer/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively redacts sensitive keys from any object or array.
 */
export function redactSecrets<T>(data: T, seen = new WeakSet()): T {
  if (data === null || typeof data !== "object") {
    return data;
  }

  // Handle circular references
  if (seen.has(data as object)) {
    return "[Circular]" as unknown as T;
  }
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item, seen)) as unknown as T;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: process.env.NODE_ENV !== "production" ? data.stack : undefined,
    } as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = redactSecrets(value, seen);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getActiveLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  return LOG_LEVEL_SEVERITY[envLevel] !== undefined ? envLevel : "info";
}

export interface LogContext {
  requestId?: string;
  restaurantId?: string;
  userId?: string;
  action?: string;
  [key: string]: unknown;
}

class Logger {
  private defaultContext: LogContext;

  constructor(defaultContext: LogContext = {}) {
    this.defaultContext = defaultContext;
  }

  public child(context: LogContext): Logger {
    return new Logger({ ...this.defaultContext, ...context });
  }

  private shouldLog(level: LogLevel): boolean {
    const activeLevel = getActiveLogLevel();
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[activeLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext): string {
    const merged = {
      ...this.defaultContext,
      ...context,
    };

    const sanitizedContext = redactSecrets(merged);

    const logObject = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...(Object.keys(sanitizedContext).length > 0 ? { context: sanitizedContext } : {}),
      env: process.env.NODE_ENV || "development",
    };

    return JSON.stringify(logObject);
  }

  public debug(message: string, context?: LogContext): void {
    if (!this.shouldLog("debug")) return;
    console.debug(this.formatEntry("debug", message, context));
  }

  public info(message: string, context?: LogContext): void {
    if (!this.shouldLog("info")) return;
    console.info(this.formatEntry("info", message, context));
  }

  public warn(message: string, context?: LogContext): void {
    if (!this.shouldLog("warn")) return;
    console.warn(this.formatEntry("warn", message, context));
  }

  public error(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void {
    if (!this.shouldLog("error")) return;

    let mergedContext: LogContext = { ...context };
    if (errorOrContext instanceof Error) {
      mergedContext = {
        ...mergedContext,
        errorName: errorOrContext.name,
        errorMessage: errorOrContext.message,
        stack: process.env.NODE_ENV !== "production" ? errorOrContext.stack : undefined,
      };
    } else if (typeof errorOrContext === "object" && errorOrContext !== null) {
      mergedContext = { ...errorOrContext, ...context };
    }

    console.error(this.formatEntry("error", message, mergedContext));
  }
}

export const logger = new Logger();
