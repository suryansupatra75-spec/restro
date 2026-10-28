import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { errorResponse, context } = await requireAuthMember(req, "inventory.manageRecipes");
    if (errorResponse) return errorResponse;

    const { restaurantId } = context;

    const existing = await prisma.recipeItem.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Recipe mapping not found" }, { status: 404 });
    }

    await prisma.recipeItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Recipe ingredient mapping removed.",
    });
  } catch (error) {
    console.error("DELETE /api/v1/inventory/recipes/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
