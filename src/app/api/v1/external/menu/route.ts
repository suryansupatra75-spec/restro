import { NextRequest, NextResponse } from "next/server";
import { authenticateExternalApiKey } from "@/lib/integrations/api-keys";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateExternalApiKey(req.headers.get("authorization"));
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or expired API key" },
        { status: 401 }
      );
    }

    if (!auth.scopes.includes("menu:read")) {
      return NextResponse.json(
        { error: "Forbidden: API key lacks 'menu:read' scope" },
        { status: 403 }
      );
    }

    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: auth.restaurantId,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isAvailable: true },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            isVegetarian: true,
            isVegan: true,
            isAvailable: true,
            variants: {
              select: { id: true, name: true, price: true, isAvailable: true },
            },
            addonLinks: {
              select: {
                addon: {
                  select: { id: true, name: true, price: true, isAvailable: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      restaurantId: auth.restaurantId,
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        items: cat.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          imageUrl: item.imageUrl,
          isVegetarian: item.isVegetarian,
          isVegan: item.isVegan,
          isAvailable: item.isAvailable,
          variants: item.variants.map((v) => ({ ...v, price: Number(v.price) })),
          addons: item.addonLinks.map((al) => ({
            id: al.addon.id,
            name: al.addon.name,
            price: Number(al.addon.price),
            isAvailable: al.addon.isAvailable,
          })),
        })),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/v1/external/menu error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
