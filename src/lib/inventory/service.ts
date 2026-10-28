import { prisma } from "@/lib/db";
import { convertUnit, InventoryMovementType } from "@/lib/validations/inventory";
import { notifyInventoryLowStock } from "@/lib/notifications/service";

export interface RecordMovementParams {
  restaurantId: string;
  itemId: string;
  type: InventoryMovementType;
  quantity: number; // Positive magnitude
  unit: string;
  costPerUnit?: number | null;
  reason?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  orderId?: string | null;
}

/**
 * Transactionally records a stock movement, validates unit compatibility,
 * converts quantity to item's native unit, enforces non-negative stock policy,
 * and maintains atomic balance consistency with the movement ledger.
 */
export async function recordStockMovement(params: RecordMovementParams) {
  const {
    restaurantId,
    itemId,
    type,
    quantity,
    unit,
    costPerUnit,
    reason,
    actorId,
    actorName,
    orderId,
  } = params;

  if (quantity <= 0) {
    throw new Error("Movement quantity must be greater than zero");
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch item and lock/verify tenant ownership
    const item = await tx.inventoryItem.findFirst({
      where: { id: itemId, restaurantId },
    });

    if (!item) {
      throw new Error("Inventory item not found or does not belong to this restaurant");
    }

    // 2. Unit conversion to item's configured native unit
    const conversion = convertUnit(quantity, unit, item.unit);
    if (!conversion.success) {
      throw new Error(conversion.error || `Incompatible unit: ${unit} for item unit ${item.unit}`);
    }

    const convertedAmount = conversion.convertedAmount;

    // 3. Determine signed change direction
    const isIncrease = [
      "OPENING_STOCK",
      "STOCK_RECEIVED",
      "ADJUSTMENT_INCREASE",
      "REVERSAL",
    ].includes(type);

    const signedDelta = isIncrease ? convertedAmount : -convertedAmount;
    const currentStockNum = Number(item.currentStock);
    const newBalanceNum = Math.round((currentStockNum + signedDelta) * 1000) / 1000;

    // 4. Strict Negative Stock Policy
    if (newBalanceNum < 0) {
      throw new Error(
        `Insufficient stock for "${item.name}". Current balance: ${currentStockNum} ${item.unit}, required: ${convertedAmount} ${item.unit}.`
      );
    }

    // 5. Update Inventory Item current balance
    const updatedItem = await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        currentStock: newBalanceNum,
        ...(costPerUnit !== undefined && costPerUnit !== null ? { costPerUnit } : {}),
      },
    });

    // 6. Write append-only movement ledger entry
    const movement = await tx.inventoryMovement.create({
      data: {
        restaurantId,
        itemId: item.id,
        type,
        quantityChange: signedDelta,
        resultingBalance: newBalanceNum,
        unit: item.unit,
        costPerUnit: costPerUnit !== undefined ? costPerUnit : item.costPerUnit,
        reason: reason || null,
        actorId: actorId || null,
        actorName: actorName || null,
        orderId: orderId || null,
      },
    });

    return { item: updatedItem, movement };
  });

  if (
    result.item.isActive &&
    Number(result.item.currentStock) <= Number(result.item.lowStockThreshold)
  ) {
    await notifyInventoryLowStock({
      restaurantId,
      itemId: result.item.id,
      itemName: result.item.name,
      currentStock: Number(result.item.currentStock),
      lowStockThreshold: Number(result.item.lowStockThreshold),
      unit: result.item.unit,
      isActive: result.item.isActive,
    });
  }

  return result;
}

/**
 * Idempotently deducts inventory ingredient stock for an order based on recipes.
 * Only executes once per orderId to prevent duplicate deductions.
 */
export async function deductStockForOrder(orderId: string, restaurantId: string, actorName = "Kitchen System") {
  // 1. Fast-path idempotency & recipe existence check in parallel
  const [existingDeduction, recipeCount] = await Promise.all([
    prisma.inventoryMovement.findFirst({
      where: {
        restaurantId,
        orderId,
        type: "ORDER_DEDUCTION",
      },
      select: { id: true },
    }),
    prisma.recipeItem.count({
      where: {
        menuItem: { restaurantId },
      },
    }),
  ]);

  if (existingDeduction) {
    return { success: true, skipped: true, message: "Order stock already deducted" };
  }

  if (recipeCount === 0) {
    return { success: true, skipped: true, count: 0, deductions: [] };
  }

  // 2. Fetch order with items and recipe links
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: {
      items: {
        include: {
          menuItem: {
            include: {
              recipeItems: {
                include: {
                  inventoryItem: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const deductionsRecorded: any[] = [];

  // 3. Process each order item's recipe ingredients
  for (const item of order.items) {
    const recipes = item.menuItem.recipeItems || [];
    for (const recipe of recipes) {
      const requiredAmount = Number(recipe.quantity) * item.quantity;
      if (requiredAmount > 0) {
        try {
          const res = await recordStockMovement({
            restaurantId,
            itemId: recipe.inventoryItemId,
            type: "ORDER_DEDUCTION",
            quantity: requiredAmount,
            unit: recipe.unit,
            reason: `Order ${order.orderNumber} - ${item.quantity}x ${item.name}`,
            actorName,
            orderId: order.id,
          });
          deductionsRecorded.push(res.movement);
        } catch (err: any) {
          console.warn(`[Inventory Auto-Deduct] Insufficient stock or deduction warning: ${err.message}`);
          // Continue or log without breaking order flow if soft policy
        }
      }
    }
  }

  return { success: true, skipped: false, count: deductionsRecorded.length, deductions: deductionsRecorded };
}

/**
 * Compensating restock reversal if an order is cancelled or rejected after deduction.
 */
export async function reverseStockForOrder(orderId: string, restaurantId: string, actorName = "System Cancellation") {
  // 1. Find all deduction movements for this order
  const deductions = await prisma.inventoryMovement.findMany({
    where: {
      restaurantId,
      orderId,
      type: "ORDER_DEDUCTION",
    },
  });

  if (deductions.length === 0) {
    return { success: true, skipped: true, message: "No stock deductions found for this order" };
  }

  // 2. Check if already reversed
  const existingReversals = await prisma.inventoryMovement.findMany({
    where: {
      restaurantId,
      orderId,
      type: "REVERSAL",
    },
  });

  if (existingReversals.length >= deductions.length) {
    return { success: true, skipped: true, message: "Order deductions already reversed" };
  }

  const reversalsRecorded: any[] = [];

  // 3. Compensate each deduction
  for (const deduction of deductions) {
    const restoreAmount = Math.abs(Number(deduction.quantityChange));
    const res = await recordStockMovement({
      restaurantId,
      itemId: deduction.itemId,
      type: "REVERSAL",
      quantity: restoreAmount,
      unit: deduction.unit,
      reason: `Restock cancellation for order ${orderId}`,
      actorName,
      orderId,
    });
    reversalsRecorded.push(res.movement);
  }

  return { success: true, skipped: false, count: reversalsRecorded.length, reversals: reversalsRecorded };
}
