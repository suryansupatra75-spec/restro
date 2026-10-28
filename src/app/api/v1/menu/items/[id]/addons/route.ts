import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const linkSchema = z.object({
  addonId: z.string().uuid("Valid Add-on ID is required")
});

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const itemId = (await props.params).id;
    
    // Verify menu item belongs to user
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { restaurantId: true }
    });

    if (!menuItem || !user.restaurants.some(r => r.restaurantId === menuItem.restaurantId)) {
      return NextResponse.json({ error: "Menu item not found or forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const result = linkSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const { addonId } = result.data;

    // Verify addon belongs to the same restaurant
    const addon = await prisma.menuItemAddon.findUnique({
      where: { id: addonId },
      select: { restaurantId: true }
    });

    if (!addon || addon.restaurantId !== menuItem.restaurantId) {
      return NextResponse.json({ error: "Add-on not found or restaurant mismatch" }, { status: 400 });
    }

    // Create link safely, ignore if it already exists using upsert or just catch unique constraint error
    const link = await prisma.menuItemAddonLink.create({
      data: {
        menuItemId: itemId,
        addonId: addonId
      }
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: "Add-on is already attached to this item" }, { status: 400 });
    }
    console.error("Addon link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const itemId = (await props.params).id;
    
    // Extract addonId from search params
    const url = new URL(req.url);
    const addonId = url.searchParams.get("addonId");

    if (!addonId) {
      return NextResponse.json({ error: "addonId is required" }, { status: 400 });
    }

    // Verify menu item belongs to user
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { restaurantId: true }
    });

    if (!menuItem || !user.restaurants.some(r => r.restaurantId === menuItem.restaurantId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.menuItemAddonLink.delete({
      where: {
        menuItemId_addonId: {
          menuItemId: itemId,
          addonId: addonId
        }
      }
    });

    return NextResponse.json({ message: "Add-on detached successfully" });
  } catch (error) {
    console.error("Addon detach error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
