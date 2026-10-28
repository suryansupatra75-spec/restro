import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;
    const canViewCosts = hasPermission(role, "inventory.viewCosts");

    const items = await prisma.inventoryItem.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: { currentStock: "asc" },
    });

    const lowStockItems = items
      .map((item) => {
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
          name: item.name,
          sku: item.sku,
          category: item.category,
          unit: item.unit,
          currentStock: stock,
          lowStockThreshold: threshold,
          costPerUnit: canViewCosts && item.costPerUnit ? Number(item.costPerUnit) : null,
          stockStatus,
        };
      })
      .filter((i) => i.stockStatus === "LOW_STOCK" || i.stockStatus === "OUT_OF_STOCK");

    return NextResponse.json({
      success: true,
      count: lowStockItems.length,
      items: lowStockItems,
    });
  } catch (error) {
    console.error("GET /api/v1/inventory/low-stock error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
