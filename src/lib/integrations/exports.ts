import { prisma } from "@/lib/db";
import { sanitizeCsvCell } from "./security";

/**
 * Builds an itemized Sales Ledger Export for a date range.
 */
export async function buildSalesLedgerExport(
  restaurantId: string,
  startDateStr: string,
  endDateStr: string,
  format: "csv" | "json" = "csv"
) {
  const start = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T23:59:59.999Z`);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, currency: true, gstNumber: true },
  });

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: start, lte: end },
    },
    include: {
      table: { select: { name: true } },
      items: { select: { quantity: true } },
      payments: {
        select: { provider: true, paymentMethod: true, status: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (format === "json") {
    return {
      restaurant: restaurant?.name,
      currency: restaurant?.currency || "USD",
      startDate: startDateStr,
      endDate: endDateStr,
      totalOrders: orders.length,
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        createdAt: o.createdAt.toISOString(),
        table: o.table.name,
        itemsCount: o.items.reduce((acc, i) => acc + i.quantity, 0),
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount),
        loyaltyDiscountAmount: Number(o.loyaltyDiscountAmount),
        tax: Number(o.tax),
        total: Number(o.total),
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentProvider: o.payments[0]?.provider || "N/A",
        paymentMethod: o.payments[0]?.paymentMethod || "N/A",
      })),
    };
  }

  // Generate CSV
  const lines: string[] = [];
  lines.push(`${sanitizeCsvCell("Restaurant")},${sanitizeCsvCell(restaurant?.name || "Restaurant")}`);
  lines.push(`${sanitizeCsvCell("Report Type")},${sanitizeCsvCell("Accounting Sales Ledger")}`);
  lines.push(`${sanitizeCsvCell("Date Range")},${sanitizeCsvCell(`${startDateStr} to ${endDateStr}`)}`);
  lines.push(`${sanitizeCsvCell("Currency")},${sanitizeCsvCell(restaurant?.currency || "USD")}`);
  lines.push(`${sanitizeCsvCell("Total Orders")},${sanitizeCsvCell(orders.length)}`);
  lines.push("");

  // Column Headers
  lines.push(
    [
      sanitizeCsvCell("Order Number"),
      sanitizeCsvCell("Date & Time (UTC)"),
      sanitizeCsvCell("Table"),
      sanitizeCsvCell("Items Qty"),
      sanitizeCsvCell("Gross Subtotal"),
      sanitizeCsvCell("Promo Discount"),
      sanitizeCsvCell("Loyalty Discount"),
      sanitizeCsvCell("Tax Amount"),
      sanitizeCsvCell("Final Total"),
      sanitizeCsvCell("Order Status"),
      sanitizeCsvCell("Payment Status"),
      sanitizeCsvCell("Payment Provider"),
      sanitizeCsvCell("Payment Method"),
    ].join(",")
  );

  for (const o of orders) {
    const itemsQty = o.items.reduce((acc, i) => acc + i.quantity, 0);
    const pay = o.payments[0];
    lines.push(
      [
        sanitizeCsvCell(o.orderNumber),
        sanitizeCsvCell(o.createdAt.toISOString()),
        sanitizeCsvCell(o.table.name),
        sanitizeCsvCell(itemsQty),
        sanitizeCsvCell(Number(o.subtotal).toFixed(2)),
        sanitizeCsvCell(Number(o.discountAmount).toFixed(2)),
        sanitizeCsvCell(Number(o.loyaltyDiscountAmount).toFixed(2)),
        sanitizeCsvCell(Number(o.tax).toFixed(2)),
        sanitizeCsvCell(Number(o.total).toFixed(2)),
        sanitizeCsvCell(o.status),
        sanitizeCsvCell(o.paymentStatus),
        sanitizeCsvCell(pay?.provider || "N/A"),
        sanitizeCsvCell(pay?.paymentMethod || "N/A"),
      ].join(",")
    );
  }

  return lines.join("\r\n");
}

/**
 * Builds a dedicated Tax & Invoicing Summary Report for accounting compliance.
 */
export async function buildTaxReportExport(
  restaurantId: string,
  startDateStr: string,
  endDateStr: string,
  format: "csv" | "json" = "csv"
) {
  const start = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T23:59:59.999Z`);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, currency: true, gstNumber: true, taxPercentage: true },
  });

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { notIn: ["CANCELLED"] },
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalTaxCollected = orders.reduce((acc, o) => acc + Number(o.tax), 0);
  const totalTaxableSales = orders.reduce((acc, o) => acc + (Number(o.total) - Number(o.tax)), 0);
  const totalGrossRevenue = orders.reduce((acc, o) => acc + Number(o.total), 0);

  if (format === "json") {
    return {
      restaurant: restaurant?.name,
      gstNumber: restaurant?.gstNumber || "N/A",
      defaultTaxPercentage: restaurant?.taxPercentage || 0,
      currency: restaurant?.currency || "USD",
      startDate: startDateStr,
      endDate: endDateStr,
      summary: {
        totalOrders: orders.length,
        totalTaxableSales: Math.round(totalTaxableSales * 100) / 100,
        totalTaxCollected: Math.round(totalTaxCollected * 100) / 100,
        totalGrossRevenue: Math.round(totalGrossRevenue * 100) / 100,
      },
      itemizedOrders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        date: o.createdAt.toISOString(),
        netSubtotal: Number(o.subtotal) - Number(o.discountAmount) - Number(o.loyaltyDiscountAmount),
        taxPercentage: o.appliedTaxPercentage ?? restaurant?.taxPercentage ?? 0,
        taxAmount: Number(o.tax),
        total: Number(o.total),
        paymentStatus: o.paymentStatus,
      })),
    };
  }

  // Generate CSV
  const lines: string[] = [];
  lines.push(`${sanitizeCsvCell("Restaurant")},${sanitizeCsvCell(restaurant?.name || "Restaurant")}`);
  lines.push(`${sanitizeCsvCell("Tax / GST Number")},${sanitizeCsvCell(restaurant?.gstNumber || "Not configured")}`);
  lines.push(`${sanitizeCsvCell("Report Type")},${sanitizeCsvCell("Tax & Invoicing Report")}`);
  lines.push(`${sanitizeCsvCell("Date Range")},${sanitizeCsvCell(`${startDateStr} to ${endDateStr}`)}`);
  lines.push(`${sanitizeCsvCell("Currency")},${sanitizeCsvCell(restaurant?.currency || "USD")}`);
  lines.push(`${sanitizeCsvCell("Total Orders Included")},${sanitizeCsvCell(orders.length)}`);
  lines.push(`${sanitizeCsvCell("Total Taxable Sales")},${sanitizeCsvCell(totalTaxableSales.toFixed(2))}`);
  lines.push(`${sanitizeCsvCell("Total Tax Collected")},${sanitizeCsvCell(totalTaxCollected.toFixed(2))}`);
  lines.push(`${sanitizeCsvCell("Total Gross Bill Value")},${sanitizeCsvCell(totalGrossRevenue.toFixed(2))}`);
  lines.push("");

  lines.push(
    [
      sanitizeCsvCell("Order Number"),
      sanitizeCsvCell("Date (UTC)"),
      sanitizeCsvCell("Net Taxable Subtotal"),
      sanitizeCsvCell("Applied Tax Rate %"),
      sanitizeCsvCell("Tax Amount Collected"),
      sanitizeCsvCell("Total Invoiced Amount"),
      sanitizeCsvCell("Settlement Status"),
    ].join(",")
  );

  for (const o of orders) {
    const netSubtotal = Math.max(
      0,
      Number(o.subtotal) - Number(o.discountAmount) - Number(o.loyaltyDiscountAmount)
    );
    const taxRate = o.appliedTaxPercentage ?? restaurant?.taxPercentage ?? 0;
    lines.push(
      [
        sanitizeCsvCell(o.orderNumber),
        sanitizeCsvCell(o.createdAt.toISOString().slice(0, 10)),
        sanitizeCsvCell(netSubtotal.toFixed(2)),
        sanitizeCsvCell(`${taxRate}%`),
        sanitizeCsvCell(Number(o.tax).toFixed(2)),
        sanitizeCsvCell(Number(o.total).toFixed(2)),
        sanitizeCsvCell(o.paymentStatus),
      ].join(",")
    );
  }

  return lines.join("\r\n");
}

/**
 * Builds a Cost of Goods Sold & Profit/Loss Summary CSV Report.
 */
export async function buildProfitLossExport(
  restaurantId: string,
  startDateStr: string,
  endDateStr: string,
  format: "csv" | "json" = "csv"
) {
  const start = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T23:59:59.999Z`);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, currency: true },
  });

  // Fetch completed/active orders with line items
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { notIn: ["CANCELLED"] },
      createdAt: { gte: start, lte: end },
    },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              category: { select: { name: true } },
              recipeItems: {
                include: {
                  inventoryItem: { select: { costPerUnit: true, unit: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Aggregate by menu item
  const itemMap = new Map<
    string,
    {
      name: string;
      category: string;
      unitPrice: number;
      quantitySold: number;
      totalRevenue: number;
      estimatedUnitCost: number;
    }
  >();

  let totalSalesRevenue = 0;
  let totalCostOfGoods = 0;

  for (const o of orders) {
    for (const line of o.items) {
      const menuItem = line.menuItem;
      const key = menuItem ? menuItem.id : line.name;
      const existing = itemMap.get(key) || {
        name: menuItem?.name || line.name,
        category: menuItem?.category?.name || "General",
        unitPrice: Number(line.price),
        quantitySold: 0,
        totalRevenue: 0,
        estimatedUnitCost: 0,
      };

      // Calculate unit cost from recipe items
      let unitCost = 0;
      if (menuItem?.recipeItems && menuItem.recipeItems.length > 0) {
        unitCost = menuItem.recipeItems.reduce((sum, r) => {
          const ingCost = Number(r.inventoryItem?.costPerUnit || 0);
          return sum + ingCost * Number(r.quantity);
        }, 0);
      }
      existing.estimatedUnitCost = unitCost;

      existing.quantitySold += line.quantity;
      const lineRevenue = Number(line.price) * line.quantity;
      existing.totalRevenue += lineRevenue;
      totalSalesRevenue += lineRevenue;
      totalCostOfGoods += unitCost * line.quantity;

      itemMap.set(key, existing);
    }
  }

  const grossProfit = totalSalesRevenue - totalCostOfGoods;
  const grossMarginPct =
    totalSalesRevenue > 0 ? Math.round((grossProfit / totalSalesRevenue) * 1000) / 10 : 0;

  const itemList = Array.from(itemMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

  if (format === "json") {
    return {
      restaurant: restaurant?.name,
      currency: restaurant?.currency || "USD",
      startDate: startDateStr,
      endDate: endDateStr,
      summary: {
        totalRevenue: Math.round(totalSalesRevenue * 100) / 100,
        totalCostOfGoods: Math.round(totalCostOfGoods * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPercentage: grossMarginPct,
      },
      items: itemList.map((i) => ({
        ...i,
        totalCost: Math.round(i.estimatedUnitCost * i.quantitySold * 100) / 100,
        itemProfit: Math.round((i.totalRevenue - i.estimatedUnitCost * i.quantitySold) * 100) / 100,
      })),
    };
  }

  // Generate CSV
  const lines: string[] = [];
  lines.push(`${sanitizeCsvCell("Restaurant")},${sanitizeCsvCell(restaurant?.name || "Restaurant")}`);
  lines.push(`${sanitizeCsvCell("Report Type")},${sanitizeCsvCell("Cost of Goods & P&L Summary")}`);
  lines.push(`${sanitizeCsvCell("Date Range")},${sanitizeCsvCell(`${startDateStr} to ${endDateStr}`)}`);
  lines.push(`${sanitizeCsvCell("Currency")},${sanitizeCsvCell(restaurant?.currency || "USD")}`);
  lines.push(`${sanitizeCsvCell("Total Sales Revenue")},${sanitizeCsvCell(totalSalesRevenue.toFixed(2))}`);
  lines.push(`${sanitizeCsvCell("Total Cost of Goods (COGS)")},${sanitizeCsvCell(totalCostOfGoods.toFixed(2))}`);
  lines.push(`${sanitizeCsvCell("Gross Operational Profit")},${sanitizeCsvCell(grossProfit.toFixed(2))}`);
  lines.push(`${sanitizeCsvCell("Gross Margin %")},${sanitizeCsvCell(`${grossMarginPct}%`)}`);
  lines.push("");

  lines.push(
    [
      sanitizeCsvCell("Menu Item"),
      sanitizeCsvCell("Category"),
      sanitizeCsvCell("Units Sold"),
      sanitizeCsvCell("Selling Price"),
      sanitizeCsvCell("Total Sales"),
      sanitizeCsvCell("Est. Unit Cost"),
      sanitizeCsvCell("Total COGS"),
      sanitizeCsvCell("Gross Profit"),
      sanitizeCsvCell("Margin %"),
    ].join(",")
  );

  for (const item of itemList) {
    const itemCogs = item.estimatedUnitCost * item.quantitySold;
    const itemProfit = item.totalRevenue - itemCogs;
    const itemMargin = item.totalRevenue > 0 ? ((itemProfit / item.totalRevenue) * 100).toFixed(1) : "0.0";

    lines.push(
      [
        sanitizeCsvCell(item.name),
        sanitizeCsvCell(item.category),
        sanitizeCsvCell(item.quantitySold),
        sanitizeCsvCell(item.unitPrice.toFixed(2)),
        sanitizeCsvCell(item.totalRevenue.toFixed(2)),
        sanitizeCsvCell(item.estimatedUnitCost.toFixed(2)),
        sanitizeCsvCell(itemCogs.toFixed(2)),
        sanitizeCsvCell(itemProfit.toFixed(2)),
        sanitizeCsvCell(`${itemMargin}%`),
      ].join(",")
    );
  }

  return lines.join("\r\n");
}
