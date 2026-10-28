import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { menuItemSchema } from "@/lib/validations/menu";
import { slugify } from "@/lib/utils";
import { assertEntitlement, BillingRuleError } from "@/lib/billing/service";
import { recordAuditLog } from "@/lib/audit/service";
import { invalidateMenuCache } from "@/lib/cache/menu-cache";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queryRestaurantId = searchParams.get("restaurantId");
    const restaurantId = queryRestaurantId || user.restaurants[0]?.restaurantId;
    const categoryId = searchParams.get("categoryId");

    if (!restaurantId) {
      return NextResponse.json({ error: "Restaurant ID is required" }, { status: 400 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const whereClause: Record<string, unknown> = { restaurantId };
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    const items = await prisma.menuItem.findMany({
      where: whereClause,
      include: {
        category: true,
        variants: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET_ITEMS_ERROR", error);
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
    const validatedData = menuItemSchema.parse(body);

    const category = await prisma.menuCategory.findUnique({
      where: { id: validatedData.categoryId },
    });
    
    if (!category || category.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    // Server-side SaaS Plan Limit & Subscription Status Enforcement
    await assertEntitlement(restaurantId, "ADD_MENU_ITEM");

    let slug = slugify(validatedData.name);
    let unique = false;
    let counter = 1;
    
    while (!unique) {
      const existing = await prisma.menuItem.findFirst({
        where: { restaurantId, slug },
      });
      if (!existing) {
        unique = true;
      } else {
        slug = `${slugify(validatedData.name)}-${counter}`;
        counter++;
      }
    }

    const item = await prisma.menuItem.create({
      data: {
        ...validatedData,
        restaurantId,
        slug,
      },
      include: {
        category: true,
      }
    });

    await recordAuditLog({
      restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      action: "MENU_ITEM_CREATED",
      resourceType: "MENU",
      resourceId: item.id,
      resourceName: item.name,
      outcome: "SUCCESS",
      metadata: {
        price: Number(item.price),
        category: category.name,
      },
      req,
    });

    invalidateMenuCache(restaurantId);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST_ITEM_ERROR", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
