import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { categorySchema } from "@/lib/validations/menu";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categoryId = (await props.params).id;
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === category.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = categorySchema.partial().parse(body);

    if (validatedData.name && validatedData.name !== category.name) {
      const existing = await prisma.menuCategory.findFirst({
        where: {
          restaurantId: category.restaurantId,
          name: validatedData.name,
        },
      });
      if (existing) {
        return NextResponse.json({ error: "Category with this name already exists" }, { status: 409 });
      }
    }

    const updatedCategory = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: validatedData,
    });

    return NextResponse.json(updatedCategory);
  } catch (error) {
    console.error("PATCH_CATEGORY_ERROR", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categoryId = (await props.params).id;
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === category.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const itemsCount = await prisma.menuItem.count({ where: { categoryId } });
    
    if (itemsCount > 0) {
      // Archive instead of delete to preserve references
      const archived = await prisma.menuCategory.update({
        where: { id: categoryId },
        data: { isActive: false },
      });
      return NextResponse.json(archived);
    } else {
      await prisma.menuCategory.delete({
        where: { id: categoryId },
      });
      return NextResponse.json({ message: "Category deleted" });
    }
  } catch (error) {
    console.error("DELETE_CATEGORY_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
