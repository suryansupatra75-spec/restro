import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { categorySchema } from "@/lib/validations/menu";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queryRestaurantId = searchParams.get("restaurantId");
    const restaurantId = queryRestaurantId || user.restaurants[0]?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurant ID is required" }, { status: 400 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("GET_CATEGORIES_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queryRestaurantId = searchParams.get("restaurantId");
    const restaurantId = queryRestaurantId || user.restaurants[0]?.restaurantId;

    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurant ID is required" }, { status: 400 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = categorySchema.parse(body);

    const existingCategory = await prisma.menuCategory.findFirst({
      where: {
        restaurantId,
        name: validatedData.name,
      },
    });

    if (existingCategory) {
      return NextResponse.json({ error: "Category with this name already exists" }, { status: 409 });
    }

    const category = await prisma.menuCategory.create({
      data: {
        ...validatedData,
        restaurantId,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("POST_CATEGORY_ERROR", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
