import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const addonSchema = z.object({
  name: z.string().min(1, "Add-on name is required"),
  description: z.string().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().default(0),
});

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const restaurantId = url.searchParams.get("restaurantId") || user.restaurants[0]?.restaurantId;

    if (!restaurantId || !user.restaurants.some(r => r.restaurantId === restaurantId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const addons = await prisma.menuItemAddon.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' }
    });

    return NextResponse.json({ addons });
  } catch (error) {
    console.error("Addons GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const restaurantId = url.searchParams.get("restaurantId") || user.restaurants[0]?.restaurantId;

    if (!restaurantId || !user.restaurants.some(r => r.restaurantId === restaurantId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const result = addonSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const addon = await prisma.menuItemAddon.create({
      data: {
        restaurantId,
        name: result.data.name,
        description: result.data.description,
        price: result.data.price,
        isAvailable: result.data.isAvailable,
        sortOrder: result.data.sortOrder,
      }
    });

    return NextResponse.json({ addon }, { status: 201 });
  } catch (error) {
    console.error("Addon create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
