import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { menuItemSchema } from "@/lib/validations/menu";
import { slugify } from "@/lib/utils";
import { recordAuditLog } from "@/lib/audit/service";
import { invalidateMenuCache } from "@/lib/cache/menu-cache";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const itemId = (await props.params).id;
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: {
        category: true,
        variants: true,
        addonLinks: {
          include: { addon: true }
        }
      }
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === item.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("GET_ITEM_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === item.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const validatedData = menuItemSchema.partial().parse(body);

    if (validatedData.categoryId && validatedData.categoryId !== item.categoryId) {
      const category = await prisma.menuCategory.findUnique({
        where: { id: validatedData.categoryId },
      });
      if (!category || category.restaurantId !== item.restaurantId) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }

    let newSlug = item.slug;
    if (validatedData.name && validatedData.name !== item.name) {
      newSlug = slugify(validatedData.name);
      let unique = false;
      let counter = 1;
      
      while (!unique) {
        const existing = await prisma.menuItem.findFirst({
          where: { 
            restaurantId: item.restaurantId, 
            slug: newSlug,
            id: { not: itemId }
          },
        });
        if (!existing) {
          unique = true;
        } else {
          newSlug = `${slugify(validatedData.name)}-${counter}`;
          counter++;
        }
      }
    }

    const updatedItem = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...validatedData,
        slug: newSlug,
      },
      include: {
        category: true,
      }
    });

    await recordAuditLog({
      restaurantId: item.restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      action: "MENU_ITEM_UPDATED",
      resourceType: "MENU",
      resourceId: updatedItem.id,
      resourceName: updatedItem.name,
      outcome: "SUCCESS",
      metadata: {
        previousPrice: Number(item.price),
        newPrice: validatedData.price !== undefined ? Number(validatedData.price) : undefined,
        name: updatedItem.name,
      },
      req,
    });

    invalidateMenuCache(item.restaurantId);

    return NextResponse.json(updatedItem);
  } catch (error) {
    console.error("PATCH_ITEM_ERROR", error);
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

    const itemId = (await props.params).id;
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some((r) => r.restaurantId === item.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const archivedItem = await prisma.menuItem.update({
      where: { id: itemId },
      data: { status: "ARCHIVED" },
    });

    await recordAuditLog({
      restaurantId: item.restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      action: "MENU_ITEM_DELETED",
      resourceType: "MENU",
      resourceId: item.id,
      resourceName: item.name,
      outcome: "SUCCESS",
      req,
    });

    invalidateMenuCache(item.restaurantId);

    return NextResponse.json(archivedItem);
  } catch (error) {
    console.error("DELETE_ITEM_ERROR", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
