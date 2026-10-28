import { z } from "zod";

export const INVENTORY_UNITS = [
  "PIECE",
  "PACK",
  "GRAM",
  "KILOGRAM",
  "MILLILITER",
  "LITER",
] as const;

export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  "OPENING_STOCK",
  "STOCK_RECEIVED",
  "USAGE",
  "WASTE",
  "ADJUSTMENT_INCREASE",
  "ADJUSTMENT_DECREASE",
  "ORDER_DEDUCTION",
  "REVERSAL",
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

/**
 * Unit display labels and category metadata.
 */
export const UNIT_LABELS: Record<InventoryUnit, string> = {
  PIECE: "pc",
  PACK: "pack",
  GRAM: "g",
  KILOGRAM: "kg",
  MILLILITER: "ml",
  LITER: "L",
};

/**
 * Check if two units are dimensionally compatible and convert an amount.
 */
export function convertUnit(
  amount: number,
  fromUnit: string,
  toUnit: string
): { success: boolean; convertedAmount: number; error?: string } {
  const normFrom = fromUnit.toUpperCase().trim();
  const normTo = toUnit.toUpperCase().trim();

  if (normFrom === normTo) {
    return { success: true, convertedAmount: Math.round(amount * 1000) / 1000 };
  }

  // Weight conversions: GRAM <-> KILOGRAM
  if (normFrom === "KILOGRAM" && normTo === "GRAM") {
    return { success: true, convertedAmount: Math.round(amount * 1000 * 1000) / 1000 };
  }
  if (normFrom === "GRAM" && normTo === "KILOGRAM") {
    return { success: true, convertedAmount: Math.round((amount / 1000) * 1000) / 1000 };
  }

  // Volume conversions: LITER <-> MILLILITER
  if (normFrom === "LITER" && normTo === "MILLILITER") {
    return { success: true, convertedAmount: Math.round(amount * 1000 * 1000) / 1000 };
  }
  if (normFrom === "MILLILITER" && normTo === "LITER") {
    return { success: true, convertedAmount: Math.round((amount / 1000) * 1000) / 1000 };
  }

  return {
    success: false,
    convertedAmount: amount,
    error: `Incompatible units: cannot convert between ${normFrom} and ${normTo}.`,
  };
}

/**
 * Verify compatibility between a movement unit and item's configured unit.
 */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  const res = convertUnit(1, unitA, unitB);
  return res.success;
}

// Zod Schemas
export const createInventoryItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100, "Name too long"),
  sku: z.string().max(50, "SKU too long").optional().nullable(),
  category: z.string().max(50, "Category too long").optional().nullable(),
  unit: z.enum(INVENTORY_UNITS, {
    message: `Unit must be one of: ${INVENTORY_UNITS.join(", ")}`,
  }),
  openingStock: z.coerce.number().min(0, "Opening stock cannot be negative").default(0),
  lowStockThreshold: z.coerce.number().min(0, "Threshold cannot be negative").default(0),
  costPerUnit: z.coerce.number().min(0, "Cost cannot be negative").optional().nullable(),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(100).optional(),
  sku: z.string().max(50).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  lowStockThreshold: z.coerce.number().min(0).optional(),
  costPerUnit: z.coerce.number().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createMovementSchema = z.object({
  itemId: z.string().uuid("Invalid item ID"),
  type: z.enum(["STOCK_RECEIVED", "ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE", "WASTE"] as const, {
    message: "Type must be STOCK_RECEIVED, ADJUSTMENT_INCREASE, ADJUSTMENT_DECREASE, or WASTE",
  }),
  quantity: z.coerce.number().gt(0, "Quantity must be greater than zero"),
  unit: z.string().min(1, "Unit is required"),
  costPerUnit: z.coerce.number().min(0, "Cost cannot be negative").optional().nullable(),
  reason: z.string().max(255, "Reason too long").optional().nullable(),
});

export const recipeItemSchema = z.object({
  menuItemId: z.string().uuid("Invalid menu item ID"),
  inventoryItemId: z.string().uuid("Invalid inventory item ID"),
  quantity: z.coerce.number().gt(0, "Quantity must be greater than zero"),
  unit: z.string().min(1, "Unit is required"),
});

export const inventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE", "LOW_STOCK", "OUT_OF_STOCK"]).default("ALL"),
  sortBy: z.enum(["name", "stock", "updatedAt", "cost"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const movementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  itemId: z.string().optional(),
  type: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
