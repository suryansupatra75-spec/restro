import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { variantSchema } from "@/lib/validations/menu";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const itemId = (await props.params).id;
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === item.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = variantSchema.parse(body);

    const variant = await prisma.menuItemVariant.create({
      data: {
        ...validatedData,
        menuItemId: itemId,
      },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    console.error("POST_VARIANT_ERROR", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
