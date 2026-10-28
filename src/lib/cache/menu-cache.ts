import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type MenuCategoryWithItems = Prisma.MenuCategoryGetPayload<{
  include: {
    items: {
      include: {
        variants: true;
        addonLinks: {
          include: {
            addon: true;
          };
        };
      };
    };
  };
}>;

interface MenuCacheEntry {
  data: MenuCategoryWithItems[];
  timestamp: number;
}

const menuCache = new Map<string, MenuCacheEntry>();
const CACHE_TTL_MS = 15000; // 15 seconds in-memory cache

/**
 * High-performance cached retrieval of menu categories and active items.
 * Drastically cuts redundant nested database queries during peak QR scanning.
 */
export async function getCachedMenuCategories(
  restaurantId: string
): Promise<MenuCategoryWithItems[]> {
  const cached = menuCache.get(restaurantId);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const categoriesData = await prisma.menuCategory.findMany({
    where: {
      restaurantId,
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: {
          status: "ACTIVE",
        },
        orderBy: { sortOrder: "asc" },
        include: {
          variants: {
            orderBy: { sortOrder: "asc" },
          },
          addonLinks: {
            include: {
              addon: true,
            },
          },
        },
      },
    },
  });

  menuCache.set(restaurantId, {
    data: categoriesData,
    timestamp: now,
  });

  return categoriesData;
}

/**
 * Invalidate cache on menu mutations (Item/Category create, update, delete)
 */
export function invalidateMenuCache(restaurantId?: string) {
  if (restaurantId) {
    menuCache.delete(restaurantId);
  } else {
    menuCache.clear();
  }
}
