import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { areUnitsCompatible, recipeItemSchema } from "@/lib/validations/inventory";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.view");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;
    const url = new URL(req.url);
    const menuItemId = url.searchParams.get("menuItemId");

    const where: any = { restaurantId };
    if (menuItemId) {
      where.menuItemId = menuItemId;
    }

    const recipes = await prisma.recipeItem.findMany({
      where,
      include: {
        menuItem: {
          select: { id: true, name: true, price: true, status: true },
        },
        inventoryItem: {
          select: { id: true, name: true, unit: true, currentStock: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      recipes: recipes.map((r) => ({
        id: r.id,
        menuItemId: r.menuItemId,
        menuItemName: r.menuItem.name,
        inventoryItemId: r.inventoryItemId,
        inventoryItemName: r.inventoryItem.name,
        currentStock: Number(r.inventoryItem.currentStock),
        quantity: Number(r.quantity),
        unit: r.unit,
      })),
    });
  } catch (error) {
    console.error("GET /api/v1/inventory/recipes error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.manageRecipes");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    let body: any = {};
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = recipeItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid recipe data" },
        { status: 400 }
      );
    }

    const { menuItemId, inventoryItemId, quantity, unit } = parsed.data;

    // Verify MenuItem belongs to this restaurant
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId },
    });
    if (!menuItem) {
      return NextResponse.json({ error: "Menu item not found in this restaurant" }, { status: 404 });
    }

    // Verify InventoryItem belongs to this restaurant
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, restaurantId },
    });
    if (!inventoryItem) {
      return NextResponse.json({ error: "Inventory item not found in this restaurant" }, { status: 404 });
    }

    // Verify unit compatibility
    if (!areUnitsCompatible(unit, inventoryItem.unit)) {
      return NextResponse.json(
        { error: `Recipe unit "${unit}" is incompatible with inventory item unit "${inventoryItem.unit}"` },
        { status: 400 }
      );
    }

    // Upsert RecipeItem
    const recipe = await prisma.recipeItem.upsert({
      where: {
        menuItemId_inventoryItemId: {
          menuItemId,
          inventoryItemId,
        },
      },
      update: {
        quantity,
        unit,
      },
      create: {
        restaurantId,
        menuItemId,
        inventoryItemId,
        quantity,
        unit,
      },
      include: {
        menuItem: { select: { id: true, name: true } },
        inventoryItem: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        recipe: {
          id: recipe.id,
          menuItemId: recipe.menuItemId,
          menuItemName: recipe.menuItem.name,
          inventoryItemId: recipe.inventoryItemId,
          inventoryItemName: recipe.inventoryItem.name,
          quantity: Number(recipe.quantity),
          unit: recipe.unit,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/v1/inventory/recipes error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
