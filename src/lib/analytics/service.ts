import { prisma } from "@/lib/db";
import { AnalyticsDateContext, sanitizeCsvField } from "@/lib/validations/analytics";

export interface AnalyticsTrendPoint {
  key: string;
  label: string;
  date: string;
  sales: number;
  orderCount: number;
}

export interface TopSellingItem {
  name: string;
  categoryName: string;
  quantitySold: number;
  totalRevenue: number;
  orderCount: number;
}

export interface CategorySummary {
  name: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface PaymentBreakdown {
  status: string;
  count: number;
  amount: number;
}

export interface AnalyticsSummary {
  period: string;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  currency: string;
  lastUpdated: string;

  kpis: {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    inProgressOrders: number;
    grossSales: number;
    netSales: number;
    taxCollected: number;
    aov: number;
    paidRevenue: number;
  };

  comparison: {
    previousPeriodLabel: string;
    totalOrdersChangePct: number;
    grossSalesChangePct: number;
    completedOrdersChangePct: number;
    aovChangePct: number;
    prevTotalOrders: number;
    prevGrossSales: number;
    prevCompletedOrders: number;
    prevAov: number;
  };

  trends: AnalyticsTrendPoint[];
  orderLifecycle: StatusBreakdown[];
  paymentBreakdown: PaymentBreakdown[];
  topItems: TopSellingItem[];
  categoryBreakdown: CategorySummary[];

  customerInsights: {
    uniqueCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    repeatOrderRate: number;
  };

  inventorySnapshot: {
    lowStockCount: number;
    outOfStockCount: number;
    receivedQuantity: number;
    wasteQuantity: number;
    adjustmentCount: number;
  };
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function calculatePctChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return round2(((current - previous) / previous) * 100);
}

/**
 * Generates continuous zero-filled trend intervals.
 */
function buildTrendBuckets(
  start: Date,
  end: Date,
  bucketType: "hourly" | "daily" | "monthly"
): Map<string, AnalyticsTrendPoint> {
  const buckets = new Map<string, AnalyticsTrendPoint>();

  if (bucketType === "hourly") {
    const cur = new Date(start);
    cur.setUTCMinutes(0, 0, 0);
    while (cur <= end) {
      const year = cur.getUTCFullYear();
      const month = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const day = String(cur.getUTCDate()).padStart(2, "0");
      const hour = String(cur.getUTCHours()).padStart(2, "0");
      const key = `${year}-${month}-${day} ${hour}:00`;
      const label = `${hour}:00 (${month}/${day})`;

      buckets.set(key, {
        key,
        label,
        date: cur.toISOString(),
        sales: 0,
        orderCount: 0,
      });
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
  } else if (bucketType === "monthly") {
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cur <= endMonth) {
      const year = cur.getUTCFullYear();
      const month = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const key = `${year}-${month}`;
      const label = cur.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

      buckets.set(key, {
        key,
        label,
        date: cur.toISOString(),
        sales: 0,
        orderCount: 0,
      });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  } else {
    // daily
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (cur <= endDay) {
      const year = cur.getUTCFullYear();
      const month = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const day = String(cur.getUTCDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;
      const label = cur.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

      buckets.set(key, {
        key,
        label,
        date: cur.toISOString(),
        sales: 0,
        orderCount: 0,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return buckets;
}

/**
 * Resolves bucket key for an arbitrary order date.
 */
function getBucketKey(date: Date, bucketType: "hourly" | "daily" | "monthly"): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  if (bucketType === "hourly") {
    const hour = String(date.getUTCHours()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:00`;
  }
  if (bucketType === "monthly") {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Master Analytics Retrieval Engine.
 * Strictly scopes every query to `restaurantId` on the database level.
 */
export async function getAnalyticsSummary(
  restaurantId: string,
  ctx: AnalyticsDateContext
): Promise<AnalyticsSummary> {
  const { current, previous, bucketType } = ctx;

  // Execute all independent database queries concurrently in parallel
  const [
    restaurant,
    currentOrders,
    previousOrders,
    currentPayments,
    activeInventoryItems,
    periodMovements,
  ] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { currency: true, name: true },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: current.start,
          lte: current.end,
        },
      },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: previous.start,
          lte: previous.end,
        },
      },
      select: {
        id: true,
        status: true,
        total: true,
        subtotal: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: current.start,
          lte: current.end,
        },
      },
      select: {
        id: true,
        status: true,
        amount: true,
        paymentMethod: true,
      },
    }),
    prisma.inventoryItem.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      select: {
        currentStock: true,
        lowStockThreshold: true,
      },
    }),
    prisma.inventoryMovement.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: current.start,
          lte: current.end,
        },
      },
      select: {
        type: true,
        quantityChange: true,
      },
    }),
  ]);

  const currency = restaurant?.currency || "USD";

  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const item of activeInventoryItems) {
    const cur = Number(item.currentStock) || 0;
    const thresh = Number(item.lowStockThreshold) || 0;
    if (cur <= 0) {
      outOfStockCount++;
    } else if (cur <= thresh) {
      lowStockCount++;
    }
  }

  let receivedQuantity = 0;
  let wasteQuantity = 0;
  let adjustmentCount = 0;
  for (const mov of periodMovements) {
    const q = Number(mov.quantityChange) || 0;
    if (mov.type === "STOCK_RECEIVED") {
      receivedQuantity += Math.max(0, q);
    } else if (mov.type === "WASTE") {
      wasteQuantity += Math.abs(q);
    } else if (mov.type === "ADJUSTMENT_INCREASE" || mov.type === "ADJUSTMENT_DECREASE") {
      adjustmentCount++;
    }
  }

  // 6. Fetch Customer Insights
  // Unique customers in period
  const customerIdsInPeriod = new Set<string>();
  for (const ord of currentOrders) {
    if (ord.customerId && ord.status !== "CANCELLED") {
      customerIdsInPeriod.add(ord.customerId);
    }
  }
  const uniqueCustomers = customerIdsInPeriod.size;

  // New customers created within period
  const newCustomers = await prisma.customer.count({
    where: {
      restaurantId,
      createdAt: {
        gte: current.start,
        lte: current.end,
      },
    },
  });

  // Returning customers: customers who ordered in period and have > 1 lifetime orders
  let returningCustomers = 0;
  if (customerIdsInPeriod.size > 0) {
    const candidateIds = Array.from(customerIdsInPeriod);
    const customerOrderCounts = await prisma.order.groupBy({
      by: ["customerId"],
      where: {
        restaurantId,
        customerId: { in: candidateIds },
        status: { not: "CANCELLED" },
      },
      _count: { id: true },
    });
    for (const group of customerOrderCounts) {
      if (group._count.id > 1) {
        returningCustomers++;
      }
    }
  }

  const repeatOrderRate =
    uniqueCustomers > 0 ? round2((returningCustomers / uniqueCustomers) * 100) : 0;

  // 7. Calculate Current Period KPIs & Trends
  const totalOrders = currentOrders.length;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let inProgressOrders = 0;
  let grossSales = 0;
  let subtotalSum = 0;
  let taxCollected = 0;
  let nonCancelledOrderCount = 0;

  const trendBuckets = buildTrendBuckets(current.start, current.end, bucketType);
  const statusCounts: Record<string, number> = {};
  const topItemsMap = new Map<string, TopSellingItem>();
  const categoryMap = new Map<string, CategorySummary>();

  for (const order of currentOrders) {
    const total = Number(order.total) || 0;
    const subtotal = Number(order.subtotal) || 0;
    const tax = Number(order.tax) || 0;

    // Status distribution
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

    if (order.status === "COMPLETED") {
      completedOrders++;
    } else if (order.status === "CANCELLED") {
      cancelledOrders++;
    } else if (["PENDING", "ACCEPTED", "PREPARING", "READY"].includes(order.status)) {
      inProgressOrders++;
    }

    // Revenue calculations (non-cancelled orders only)
    if (order.status !== "CANCELLED") {
      grossSales += total;
      subtotalSum += subtotal;
      taxCollected += tax;
      nonCancelledOrderCount++;

      // Trend accumulation
      const bKey = getBucketKey(order.createdAt, bucketType);
      const bucket = trendBuckets.get(bKey);
      if (bucket) {
        bucket.sales = round2(bucket.sales + total);
        bucket.orderCount += 1;
      }

      // Order items accumulation
      for (const item of order.items) {
        const itemPrice = Number(item.price) || 0;
        const itemQty = item.quantity || 0;
        const itemRevenue = round2(itemPrice * itemQty);
        const catName = item.menuItem?.category?.name || "General";

        // Top Item
        const existingItem = topItemsMap.get(item.name);
        if (existingItem) {
          existingItem.quantitySold += itemQty;
          existingItem.totalRevenue = round2(existingItem.totalRevenue + itemRevenue);
          existingItem.orderCount += 1;
        } else {
          topItemsMap.set(item.name, {
            name: item.name,
            categoryName: catName,
            quantitySold: itemQty,
            totalRevenue: itemRevenue,
            orderCount: 1,
          });
        }

        // Category
        const existingCat = categoryMap.get(catName);
        if (existingCat) {
          existingCat.quantitySold += itemQty;
          existingCat.totalRevenue = round2(existingCat.totalRevenue + itemRevenue);
        } else {
          categoryMap.set(catName, {
            name: catName,
            quantitySold: itemQty,
            totalRevenue: itemRevenue,
          });
        }
      }
    }
  }

  grossSales = round2(grossSales);
  subtotalSum = round2(subtotalSum);
  taxCollected = round2(taxCollected);
  const aov = nonCancelledOrderCount > 0 ? round2(grossSales / nonCancelledOrderCount) : 0;

  // Payments aggregation
  let paidRevenue = 0;
  let refundedAmount = 0;
  const paymentCounts: Record<string, { count: number; amount: number }> = {
    PAID: { count: 0, amount: 0 },
    PENDING: { count: 0, amount: 0 },
    FAILED: { count: 0, amount: 0 },
    REFUNDED: { count: 0, amount: 0 },
  };

  for (const pay of currentPayments) {
    const amt = Number(pay.amount) || 0;
    const st = pay.status.toUpperCase();
    if (!paymentCounts[st]) {
      paymentCounts[st] = { count: 0, amount: 0 };
    }
    paymentCounts[st].count += 1;
    paymentCounts[st].amount = round2(paymentCounts[st].amount + amt);

    if (st === "PAID") {
      paidRevenue += amt;
    } else if (st === "REFUNDED") {
      refundedAmount += amt;
    }
  }
  paidRevenue = round2(paidRevenue);
  refundedAmount = round2(refundedAmount);

  // Net Sales = Subtotal - Refunded Payments
  const netSales = round2(Math.max(0, subtotalSum - refundedAmount));

  // 8. Previous Period Calculations
  const prevTotalOrders = previousOrders.length;
  let prevCompletedOrders = 0;
  let prevGrossSales = 0;
  let prevNonCancelledCount = 0;

  for (const prev of previousOrders) {
    const t = Number(prev.total) || 0;
    if (prev.status === "COMPLETED") {
      prevCompletedOrders++;
    }
    if (prev.status !== "CANCELLED") {
      prevGrossSales += t;
      prevNonCancelledCount++;
    }
  }
  prevGrossSales = round2(prevGrossSales);
  const prevAov = prevNonCancelledCount > 0 ? round2(prevGrossSales / prevNonCancelledCount) : 0;

  // 9. Format Structures
  const trends = Array.from(trendBuckets.values());

  const orderLifecycle: StatusBreakdown[] = Object.entries(statusCounts).map(([st, cnt]) => ({
    status: st,
    count: cnt,
    percentage: totalOrders > 0 ? round2((cnt / totalOrders) * 100) : 0,
  }));

  const paymentBreakdown: PaymentBreakdown[] = Object.entries(paymentCounts).map(([st, data]) => ({
    status: st,
    count: data.count,
    amount: round2(data.amount),
  }));

  const topItems: TopSellingItem[] = Array.from(topItemsMap.values())
    .sort((a, b) => b.quantitySold - a.quantitySold || b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  const categoryBreakdown: CategorySummary[] = Array.from(categoryMap.values()).sort(
    (a, b) => b.totalRevenue - a.totalRevenue
  );

  return {
    period: ctx.current.label,
    dateRangeLabel: ctx.current.label,
    startDate: ctx.current.start.toISOString().split("T")[0],
    endDate: ctx.current.end.toISOString().split("T")[0],
    currency,
    lastUpdated: new Date().toISOString(),

    kpis: {
      totalOrders,
      completedOrders,
      cancelledOrders,
      inProgressOrders,
      grossSales,
      netSales,
      taxCollected,
      aov,
      paidRevenue,
    },

    comparison: {
      previousPeriodLabel: ctx.previous.label,
      totalOrdersChangePct: calculatePctChange(totalOrders, prevTotalOrders),
      grossSalesChangePct: calculatePctChange(grossSales, prevGrossSales),
      completedOrdersChangePct: calculatePctChange(completedOrders, prevCompletedOrders),
      aovChangePct: calculatePctChange(aov, prevAov),
      prevTotalOrders,
      prevGrossSales,
      prevCompletedOrders,
      prevAov,
    },

    trends,
    orderLifecycle,
    paymentBreakdown,
    topItems,
    categoryBreakdown,

    customerInsights: {
      uniqueCustomers,
      newCustomers,
      returningCustomers,
      repeatOrderRate,
    },

    inventorySnapshot: {
      lowStockCount,
      outOfStockCount,
      receivedQuantity: round2(receivedQuantity),
      wasteQuantity: round2(wasteQuantity),
      adjustmentCount,
    },
  };
}

/**
 * Builds CSV export string with formula injection mitigation.
 */
export function buildAnalyticsCsvString(
  restaurantName: string,
  summary: AnalyticsSummary
): string {
  const lines: string[] = [];

  // Metadata
  lines.push(`${sanitizeCsvField("Restaurant")},${sanitizeCsvField(restaurantName)}`);
  lines.push(`${sanitizeCsvField("Report Range")},${sanitizeCsvField(summary.dateRangeLabel)}`);
  lines.push(
    `${sanitizeCsvField("Date Interval")},${sanitizeCsvField(`${summary.startDate} to ${summary.endDate}`)}`
  );
  lines.push(`${sanitizeCsvField("Currency")},${sanitizeCsvField(summary.currency)}`);
  lines.push(
    `${sanitizeCsvField("Generated At")},${sanitizeCsvField(new Date().toISOString())}`
  );
  lines.push("");

  // Executive KPI Summary
  lines.push(`${sanitizeCsvField("--- EXECUTIVE KPI SUMMARY ---")}`);
  lines.push(
    `${sanitizeCsvField("Metric")},${sanitizeCsvField("Current Value")},${sanitizeCsvField("Previous Value")},${sanitizeCsvField("Change %")}`
  );
  lines.push(
    `${sanitizeCsvField("Gross Sales")},${sanitizeCsvField(summary.kpis.grossSales)},${sanitizeCsvField(summary.comparison.prevGrossSales)},${sanitizeCsvField(`${summary.comparison.grossSalesChangePct}%`)}`
  );
  lines.push(
    `${sanitizeCsvField("Net Sales")},${sanitizeCsvField(summary.kpis.netSales)},${sanitizeCsvField("N/A")},${sanitizeCsvField("N/A")}`
  );
  lines.push(
    `${sanitizeCsvField("Total Orders")},${sanitizeCsvField(summary.kpis.totalOrders)},${sanitizeCsvField(summary.comparison.prevTotalOrders)},${sanitizeCsvField(`${summary.comparison.totalOrdersChangePct}%`)}`
  );
  lines.push(
    `${sanitizeCsvField("Average Order Value (AOV)")},${sanitizeCsvField(summary.kpis.aov)},${sanitizeCsvField(summary.comparison.prevAov)},${sanitizeCsvField(`${summary.comparison.aovChangePct}%`)}`
  );
  lines.push(
    `${sanitizeCsvField("Completed Orders")},${sanitizeCsvField(summary.kpis.completedOrders)},${sanitizeCsvField(summary.comparison.prevCompletedOrders)},${sanitizeCsvField(`${summary.comparison.completedOrdersChangePct}%`)}`
  );
  lines.push(
    `${sanitizeCsvField("Cancelled Orders")},${sanitizeCsvField(summary.kpis.cancelledOrders)},${sanitizeCsvField("N/A")},${sanitizeCsvField("N/A")}`
  );
  lines.push(
    `${sanitizeCsvField("Paid Revenue (Captured)")},${sanitizeCsvField(summary.kpis.paidRevenue)},${sanitizeCsvField("N/A")},${sanitizeCsvField("N/A")}`
  );
  lines.push("");

  // Sales Trend Table
  lines.push(`${sanitizeCsvField("--- SALES & ORDER VOLUME TREND ---")}`);
  lines.push(
    `${sanitizeCsvField("Period Bucket")},${sanitizeCsvField("Orders Placed")},${sanitizeCsvField("Gross Sales")}`
  );
  for (const point of summary.trends) {
    lines.push(
      `${sanitizeCsvField(point.label)},${sanitizeCsvField(point.orderCount)},${sanitizeCsvField(point.sales)}`
    );
  }
  lines.push("");

  // Top Selling Items
  lines.push(`${sanitizeCsvField("--- TOP SELLING MENU ITEMS ---")}`);
  lines.push(
    `${sanitizeCsvField("Item Name")},${sanitizeCsvField("Category")},${sanitizeCsvField("Quantity Sold")},${sanitizeCsvField("Total Revenue")},${sanitizeCsvField("Orders Count")}`
  );
  for (const item of summary.topItems) {
    lines.push(
      `${sanitizeCsvField(item.name)},${sanitizeCsvField(item.categoryName)},${sanitizeCsvField(item.quantitySold)},${sanitizeCsvField(item.totalRevenue)},${sanitizeCsvField(item.orderCount)}`
    );
  }
  lines.push("");

  // Payment Breakdown
  lines.push(`${sanitizeCsvField("--- PAYMENT STATUS BREAKDOWN ---")}`);
  lines.push(
    `${sanitizeCsvField("Payment Status")},${sanitizeCsvField("Count")},${sanitizeCsvField("Total Amount")}`
  );
  for (const pay of summary.paymentBreakdown) {
    lines.push(
      `${sanitizeCsvField(pay.status)},${sanitizeCsvField(pay.count)},${sanitizeCsvField(pay.amount)}`
    );
  }
  lines.push("");

  // Customer Insights
  lines.push(`${sanitizeCsvField("--- CUSTOMER INSIGHTS ---")}`);
  lines.push(
    `${sanitizeCsvField("Metric")},${sanitizeCsvField("Value")}`
  );
  lines.push(
    `${sanitizeCsvField("Unique Customers")},${sanitizeCsvField(summary.customerInsights.uniqueCustomers)}`
  );
  lines.push(
    `${sanitizeCsvField("New Customers in Period")},${sanitizeCsvField(summary.customerInsights.newCustomers)}`
  );
  lines.push(
    `${sanitizeCsvField("Returning Customers")},${sanitizeCsvField(summary.customerInsights.returningCustomers)}`
  );
  lines.push(
    `${sanitizeCsvField("Repeat Order Rate")},${sanitizeCsvField(`${summary.customerInsights.repeatOrderRate}%`)}`
  );

  return lines.join("\r\n");
}
