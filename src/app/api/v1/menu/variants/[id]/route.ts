import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { variantSchema } from "@/lib/validations/menu";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const variantId = (await props.params).id;
    const variant = await prisma.menuItemVariant.findUnique({
      where: { id: variantId },
      include: { menuItem: true },
    });

    if (!variant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === variant.menuItem.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = variantSchema.partial().parse(body);

    const updatedVariant = await prisma.menuItemVariant.update({
      where: { id: variantId },
      data: validatedData,
    });

    return NextResponse.json(updatedVariant);
  } catch (error) {
    console.error("PATCH_VARIANT_ERROR", error);
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

    const variantId = (await props.params).id;
    const variant = await prisma.menuItemVariant.findUnique({
      where: { id: variantId },
      include: { menuItem: true },
    });

    if (!variant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === variant.menuItem.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.menuItemVariant.delete({
      where: { id: variantId },
    });

    return NextResponse.json({ message: "Variant deleted" });
  } catch (error) {
    console.error("DELETE_VARIANT_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
