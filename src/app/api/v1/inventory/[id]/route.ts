import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { updateInventoryItemSchema } from "@/lib/validations/inventory";
import { notifyInventoryLowStock } from "@/lib/notifications/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "inventory.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;

    // Strict Tenant Isolation
    const item = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        recipes: {
          include: {
            menuItem: {
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const canViewCosts = hasPermission(role, "inventory.viewCosts");
    const stock = Number(item.currentStock);
    const threshold = Number(item.lowStockThreshold);
    let stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" = "IN_STOCK";

    if (stock <= 0) {
      stockStatus = "OUT_OF_STOCK";
    } else if (threshold > 0 && stock <= threshold) {
      stockStatus = "LOW_STOCK";
    }

    return NextResponse.json({
      success: true,
      item: {
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
      },
      recentMovements: item.movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantityChange: Number(m.quantityChange),
        resultingBalance: Number(m.resultingBalance),
        unit: m.unit,
        costPerUnit: canViewCosts && m.costPerUnit ? Number(m.costPerUnit) : null,
        reason: m.reason,
        actorName: m.actorName,
        orderId: m.orderId,
        createdAt: m.createdAt,
      })),
      linkedRecipes: item.recipes.map((r) => ({
        id: r.id,
        menuItemId: r.menuItemId,
        menuItemName: r.menuItem.name,
        quantity: Number(r.quantity),
        unit: r.unit,
      })),
    });
  } catch (error) {
    console.error("GET /api/v1/inventory/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "inventory.update");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    let body: any = {};
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = updateInventoryItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update data" },
        { status: 400 }
      );
    }

    // Verify item belongs to this restaurant (IDOR Defense)
    const existing = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const data: any = {};

    // Validate duplicate name if being updated
    if (parsed.data.name && parsed.data.name.trim() !== existing.name) {
      const duplicate = await prisma.inventoryItem.findFirst({
        where: {
          restaurantId,
          name: parsed.data.name.trim(),
          id: { not: id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `An item named "${parsed.data.name}" already exists in this restaurant` },
          { status: 400 }
        );
      }
      data.name = parsed.data.name.trim();
    }

    // Validate duplicate SKU if being updated
    if (parsed.data.sku !== undefined) {
      const cleanSku = parsed.data.sku ? parsed.data.sku.trim() : null;
      if (cleanSku && cleanSku !== existing.sku) {
        const duplicateSku = await prisma.inventoryItem.findFirst({
          where: {
            restaurantId,
            sku: cleanSku,
            id: { not: id },
          },
        });
        if (duplicateSku) {
          return NextResponse.json(
            { error: `SKU "${cleanSku}" is already in use by item "${duplicateSku.name}"` },
            { status: 400 }
          );
        }
      }
      data.sku = cleanSku;
    }

    if (parsed.data.category !== undefined) {
      data.category = parsed.data.category ? parsed.data.category.trim() : null;
    }
    if (parsed.data.lowStockThreshold !== undefined) {
      data.lowStockThreshold = parsed.data.lowStockThreshold;
    }
    if (parsed.data.costPerUnit !== undefined) {
      data.costPerUnit = parsed.data.costPerUnit;
    }
    if (parsed.data.isActive !== undefined) {
      data.isActive = parsed.data.isActive;
    }

    const updated = await prisma.inventoryItem.update({
      where: { id },
      data,
    });

    if (
      updated.isActive &&
      Number(updated.currentStock) <= Number(updated.lowStockThreshold)
    ) {
      await notifyInventoryLowStock({
        restaurantId,
        itemId: updated.id,
        itemName: updated.name,
        currentStock: Number(updated.currentStock),
        lowStockThreshold: Number(updated.lowStockThreshold),
        unit: updated.unit,
        isActive: updated.isActive,
      });
    }

    return NextResponse.json({
      success: true,
      item: {
        id: updated.id,
        name: updated.name,
        sku: updated.sku,
        category: updated.category,
        unit: updated.unit,
        currentStock: Number(updated.currentStock),
        lowStockThreshold: Number(updated.lowStockThreshold),
        costPerUnit: updated.costPerUnit ? Number(updated.costPerUnit) : 0,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("PATCH /api/v1/inventory/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "inventory.update");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    const existing = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId },
      include: {
        _count: {
          select: { movements: true, recipes: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    // Preservation rule: If item has historical movements, deactivate it safely rather than hard deleting
    if (existing._count.movements > 0 || existing._count.recipes > 0) {
      await prisma.inventoryItem.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: "Item has historical movements; deactivated safely to preserve audit ledger.",
      });
    }

    // If completely unused, can safely hard delete
    await prisma.inventoryItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      deleted: true,
      message: "Item deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE /api/v1/inventory/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
