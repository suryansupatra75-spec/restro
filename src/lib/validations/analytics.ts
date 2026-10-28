import { z } from "zod";

export const analyticsPeriodEnum = z.enum([
  "today",
  "yesterday",
  "7d",
  "30d",
  "this_month",
  "prev_month",
  "custom",
]);

export type AnalyticsPeriod = z.infer<typeof analyticsPeriodEnum>;

export const analyticsQuerySchema = z.object({
  period: analyticsPeriodEnum.default("7d"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date format. Expected YYYY-MM-DD")
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date format. Expected YYYY-MM-DD")
    .optional(),
  exportFormat: z.enum(["csv"]).optional(),
});

export type AnalyticsQueryParams = z.infer<typeof analyticsQuerySchema>;

export interface ResolvedDateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface AnalyticsDateContext {
  current: ResolvedDateRange;
  previous: ResolvedDateRange;
  bucketType: "hourly" | "daily" | "monthly";
  daysCount: number;
}

/**
 * Resolves date ranges with strict server-side boundary validation.
 * Bounds are 00:00:00.000 (inclusive) to 23:59:59.999 (inclusive).
 */
export function resolveDateRange(
  period: AnalyticsPeriod = "7d",
  customStart?: string,
  customEnd?: string
): AnalyticsDateContext {
  const now = new Date();
  let start: Date;
  let end: Date;
  let label = "Last 7 Days";

  // Build calendar dates in UTC consistent terms
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  switch (period) {
    case "today": {
      start = todayStart;
      end = todayEnd;
      label = "Today";
      break;
    }
    case "yesterday": {
      start = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      end = new Date(todayEnd.getTime() - 24 * 60 * 60 * 1000);
      label = "Yesterday";
      break;
    }
    case "7d": {
      start = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      end = todayEnd;
      label = "Last 7 Days";
      break;
    }
    case "30d": {
      start = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
      end = todayEnd;
      label = "Last 30 Days";
      break;
    }
    case "this_month": {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      end = todayEnd;
      label = "This Month";
      break;
    }
    case "prev_month": {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
      label = "Previous Month";
      break;
    }
    case "custom": {
      if (!customStart || !customEnd) {
        throw new Error("Both startDate and endDate are required for custom period");
      }
      const [sYear, sMonth, sDay] = customStart.split("-").map(Number);
      const [eYear, eMonth, eDay] = customEnd.split("-").map(Number);

      start = new Date(Date.UTC(sYear, sMonth - 1, sDay, 0, 0, 0, 0));
      end = new Date(Date.UTC(eYear, eMonth - 1, eDay, 23, 59, 59, 999));

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid custom date range");
      }
      if (start.getTime() > end.getTime()) {
        throw new Error("Start date cannot be after end date");
      }

      // Safeguard: Max 366 days
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 366) {
        throw new Error("Custom date range cannot exceed 366 days");
      }

      label = `${customStart} to ${customEnd}`;
      break;
    }
    default: {
      start = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      end = todayEnd;
      label = "Last 7 Days";
    }
  }

  const durationMs = end.getTime() - start.getTime();
  const daysCount = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));

  // Compute previous equivalent period of identical length
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  const prevLabel = "Previous Period";

  // Bucket strategy:
  // <= 2 days: hourly
  // <= 35 days: daily
  // > 35 days: monthly
  let bucketType: "hourly" | "daily" | "monthly" = "daily";
  if (daysCount <= 2) {
    bucketType = "hourly";
  } else if (daysCount > 35) {
    bucketType = "monthly";
  }

  return {
    current: { start, end, label },
    previous: { start: prevStart, end: prevEnd, label: prevLabel },
    bucketType,
    daysCount,
  };
}

/**
 * Escapes CSV values to prevent formula injection (=, +, -, @).
 */
export function sanitizeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);

  // If the cell starts with formula trigger characters, prefix with single quote
  let safeStr = str;
  if (/^[=+\-@\t\r]/.test(safeStr)) {
    safeStr = `'${safeStr}`;
  }

  // Escape quotes
  safeStr = safeStr.replace(/"/g, '""');
  return `"${safeStr}"`;
}
