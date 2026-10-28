"use client";

import { useState, useMemo } from "react";
import { Sparkles, Plus, Check, UtensilsCrossed } from "lucide-react";

interface Variant {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

interface Addon {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  isAvailable: boolean;
  isVegetarian: boolean;
  isVegan: boolean;
  variants: Variant[];
  addons: Addon[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: MenuItem[];
}

interface ChefsPairingsProps {
  categories: MenuCategory[];
  currentDishId?: string;
  currentCategoryId?: string;
  onAddItem: (item: MenuItem) => void;
  currency: string;
  accentColor?: string;
  title?: string;
}

export function ChefsPairings({
  categories,
  currentDishId,
  currentCategoryId,
  onAddItem,
  currency,
  accentColor = "#E85D2A",
  title = "Chef's Recommended Pairings",
}: ChefsPairingsProps) {
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Pick up to 4 available pairings from different categories (sides, drinks, desserts, or other items)
  const pairings = useMemo(() => {
    const allItems: MenuItem[] = [];

    // Prioritize categories other than current item's category to create a true pairing
    const otherCategories = categories.filter((c) => c.id !== currentCategoryId);
    const targetCategories = otherCategories.length > 0 ? otherCategories : categories;

    targetCategories.forEach((cat) => {
      cat.items.forEach((item) => {
        if (item.isAvailable && item.id !== currentDishId) {
          allItems.push(item);
        }
      });
    });

    // Return first 4 diverse items
    return allItems.slice(0, 4);
  }, [categories, currentDishId, currentCategoryId]);

  if (pairings.length === 0) return null;

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(val);
  };

  const handleQuickAdd = (item: MenuItem) => {
    onAddItem(item);
    setAddedIds((prev) => new Set(prev).add(item.id));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 2000);
  };

  return (
    <div className="w-full bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 rounded-2xl p-3.5 border border-amber-200/60 shadow-xs space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: accentColor }}
          >
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-black text-neutral-900 uppercase tracking-wider">
            {title}
          </span>
        </div>
        <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
          Frequently Added
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
        {pairings.map((dish) => {
          const isAdded = addedIds.has(dish.id);
          return (
            <div
              key={dish.id}
              className="min-w-[140px] max-w-[140px] bg-white rounded-xl border border-neutral-200/80 p-2 flex flex-col justify-between shrink-0 shadow-xs hover:border-amber-300 transition"
            >
              {dish.imageUrl ? (
                <div className="w-full h-18 rounded-lg overflow-hidden mb-1.5 bg-neutral-100">
                  <img
                    src={dish.imageUrl}
                    alt={dish.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="w-full h-14 rounded-lg bg-amber-50 flex items-center justify-center mb-1.5 text-amber-600">
                  <UtensilsCrossed className="w-5 h-5 opacity-50" />
                </div>
              )}

              <div className="min-w-0">
                <p className="text-[11px] font-bold text-neutral-900 truncate leading-tight">
                  {dish.name}
                </p>
                <p className="text-[11px] font-black font-mono text-neutral-800 mt-0.5">
                  {formatMoney(dish.price)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleQuickAdd(dish)}
                className={`mt-2 w-full py-1.5 px-2 rounded-lg text-[10px] font-black flex items-center justify-center gap-1 transition cursor-pointer active:scale-95 ${
                  isAdded
                    ? "bg-emerald-500 text-white shadow-xs"
                    : "bg-neutral-900 hover:bg-neutral-800 text-white"
                }`}
              >
                {isAdded ? (
                  <>
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>Added!</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>+ Add</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
