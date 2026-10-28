import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  createInventoryItemSchema,
  inventoryQuerySchema,
} from "@/lib/validations/inventory";
import { recordStockMovement } from "@/lib/inventory/service";
import { notifyInventoryLowStock } from "@/lib/notifications/service";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    // Server-side SaaS Plan Feature Entitlement Enforcement
    await assertEntitlement(restaurantId, "USE_INVENTORY");

    const url = new URL(req.url);

    const queryResult = inventoryQuerySchema.safeParse({
      page: url.searchParams.get("page") || 1,
      limit: url.searchParams.get("limit") || 20,
      search: url.searchParams.get("search") || undefined,
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || "ALL",
      sortBy: url.searchParams.get("sortBy") || "name",
      sortOrder: url.searchParams.get("sortOrder") || "asc",
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: queryResult.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { page, limit, search, category, status, sortBy, sortOrder } = queryResult.data;
    const canViewCosts = hasPermission(role, "inventory.viewCosts");
    const canManageRecipes = hasPermission(role, "inventory.manageRecipes");

    // Build filter query
    const where: any = {
      restaurantId,
    };

    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { sku: { contains: q } },
        { category: { contains: q } },
      ];
    }

    if (category && category !== "ALL") {
      where.category = category;
    }

    if (status === "ACTIVE") {
      where.isActive = true;
    } else if (status === "INACTIVE") {
      where.isActive = false;
    }

    // Fetch items matching filters
    const allItems = await prisma.inventoryItem.findMany({
      where,
      orderBy: sortBy === "name"
        ? { name: sortOrder }
        : sortBy === "stock"
        ? { currentStock: sortOrder }
        : sortBy === "cost"
        ? { costPerUnit: sortOrder }
        : { updatedAt: sortOrder },
    });

    // Compute derived status and filter by LOW_STOCK / OUT_OF_STOCK if specified
    const itemsWithStatus = allItems.map((item) => {
      const stock = Number(item.currentStock);
      const threshold = Number(item.lowStockThreshold);
      let stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";

      if (stock <= 0) {
        stockStatus = "OUT_OF_STOCK";
      } else if (threshold > 0 && stock <= threshold) {
        stockStatus = "LOW_STOCK";
      }

      return {
        id: item.id,
        restaurantId: item.restaurantId,
        name: item.name,
        sku: item.sku,
        category: item.category,
        unit: item.unit,
        currentStock: stock,
        lowStockThreshold: threshold,
        costPerUnit: canViewCosts ? (item.costPerUnit ? Number(item.costPerUnit) : 0) : null,
        totalValuation: canViewCosts && item.costPerUnit
          ? Math.round(stock * Number(item.costPerUnit) * 100) / 100
          : null,
        stockStatus,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    let filtered = itemsWithStatus;
    if (status === "LOW_STOCK") {
      filtered = itemsWithStatus.filter((i) => i.stockStatus === "LOW_STOCK" && i.isActive);
    } else if (status === "OUT_OF_STOCK") {
      filtered = itemsWithStatus.filter((i) => i.stockStatus === "OUT_OF_STOCK" && i.isActive);
    }

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    // Summary counts for KPI cards
    const totalItemsCount = allItems.filter((i) => i.isActive).length;
    const lowStockCount = itemsWithStatus.filter((i) => i.stockStatus === "LOW_STOCK" && i.isActive).length;
    const outOfStockCount = itemsWithStatus.filter((i) => i.stockStatus === "OUT_OF_STOCK" && i.isActive).length;
    const totalValuation = canViewCosts
      ? itemsWithStatus
          .filter((i) => i.isActive)
          .reduce((sum, i) => sum + (i.totalValuation || 0), 0)
      : null;

    // Distinct categories for quick filtering
    const categories = Array.from(new Set(allItems.map((i) => i.category).filter(Boolean)));

    return NextResponse.json({
      success: true,
      items: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      summary: {
        totalItemsCount,
        lowStockCount,
        outOfStockCount,
        totalValuation,
        canViewCosts,
        canManageRecipes,
      },
      categories,
    });
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("GET /api/v1/inventory error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.create");
    if (errorResponse) return errorResponse;

    const { restaurantId, user } = context;

    // Server-side SaaS Plan Feature Entitlement Enforcement
    await assertEntitlement(restaurantId, "USE_INVENTORY");

    let body: any = {};
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = createInventoryItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid inventory item data" },
        { status: 400 }
      );
    }

    const { name, sku, category, unit, openingStock, lowStockThreshold, costPerUnit } = parsed.data;

    // Duplicate name validation within tenant
    const existing = await prisma.inventoryItem.findFirst({
      where: {
        restaurantId,
        name: { equals: name.trim() },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `An inventory item named "${name}" already exists in this restaurant` },
        { status: 400 }
      );
    }

    // Duplicate SKU validation within tenant if provided
    if (sku && sku.trim().length > 0) {
      const existingSku = await prisma.inventoryItem.findFirst({
        where: {
          restaurantId,
          sku: sku.trim(),
        },
      });
      if (existingSku) {
        return NextResponse.json(
          { error: `SKU "${sku}" is already in use by item "${existingSku.name}"` },
          { status: 400 }
        );
      }
    }

    // Atomic creation: Item + optional Opening Stock Movement
    const createdItem = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          restaurantId,
          name: name.trim(),
          sku: sku ? sku.trim() : null,
          category: category ? category.trim() : null,
          unit,
          currentStock: openingStock || 0,
          lowStockThreshold: lowStockThreshold || 0,
          costPerUnit: costPerUnit || 0,
          isActive: true,
        },
      });

      if (openingStock && openingStock > 0) {
        await tx.inventoryMovement.create({
          data: {
            restaurantId,
            itemId: item.id,
            type: "OPENING_STOCK",
            quantityChange: openingStock,
            resultingBalance: openingStock,
            unit,
            costPerUnit: costPerUnit || 0,
            reason: "Initial opening stock setup",
            actorId: user.id,
            actorName: user.name,
          },
        });
      }

      return item;
    });

    if (
      createdItem.isActive &&
      Number(createdItem.lowStockThreshold) > 0 &&
      Number(createdItem.currentStock) <= Number(createdItem.lowStockThreshold)
    ) {
      await notifyInventoryLowStock({
        restaurantId,
        itemId: createdItem.id,
        itemName: createdItem.name,
        currentStock: Number(createdItem.currentStock),
        lowStockThreshold: Number(createdItem.lowStockThreshold),
        unit: createdItem.unit,
        isActive: createdItem.isActive,
      });
    }

    return NextResponse.json(
      {
        success: true,
        item: {
          id: createdItem.id,
          name: createdItem.name,
          sku: createdItem.sku,
          category: createdItem.category,
          unit: createdItem.unit,
          currentStock: Number(createdItem.currentStock),
          lowStockThreshold: Number(createdItem.lowStockThreshold),
          costPerUnit: Number(createdItem.costPerUnit),
          isActive: createdItem.isActive,
          createdAt: createdItem.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/v1/inventory error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
