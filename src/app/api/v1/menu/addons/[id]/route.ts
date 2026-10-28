import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const updateAddonSchema = z.object({
  name: z.string().min(1, "Add-on name is required").optional(),
  description: z.string().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Price must be >= 0").optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

async function verifyAddonAccess(addonId: string, userId: string) {
  const addon = await prisma.menuItemAddon.findUnique({
    where: { id: addonId }
  });

  if (!addon) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { restaurants: true }
  });

  const isAuthorized = user?.restaurants.some(r => r.restaurantId === addon.restaurantId);
  return isAuthorized ? addon : null;
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const addonId = (await props.params).id;
    const addon = await verifyAddonAccess(addonId, user.id);

    if (!addon) {
      return NextResponse.json({ error: "Add-on not found or forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const result = updateAddonSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const updatedAddon = await prisma.menuItemAddon.update({
      where: { id: addonId },
      data: result.data
    });

    return NextResponse.json({ addon: updatedAddon });
  } catch (error) {
    console.error("Addon update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const addonId = (await props.params).id;
    const addon = await verifyAddonAccess(addonId, user.id);

    if (!addon) {
      return NextResponse.json({ error: "Add-on not found or forbidden" }, { status: 403 });
    }

    await prisma.menuItemAddon.delete({
      where: { id: addonId }
    });

    return NextResponse.json({ message: "Add-on deleted successfully" });
  } catch (error) {
    console.error("Addon delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
