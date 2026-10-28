/* eslint-disable @next/next/no-img-element */
import { getCurrentUser } from "@/lib/auth";
import { prisma as db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, List, Utensils } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MenuDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const currentRestaurant = user.restaurants[0].restaurant;

  const categoriesCount = await db.menuCategory.count({
    where: { restaurantId: currentRestaurant.id }
  });

  const menuItemsCount = await db.menuItem.count({
    where: { restaurantId: currentRestaurant.id }
  });

  const menuItems = await db.menuItem.findMany({
    where: { restaurantId: currentRestaurant.id },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const currency = currentRestaurant.currency || "USD";
  const formatPrice = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(val);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Menu Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage your categories and menu items here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link href="/dashboard/menu/categories">
            <Button variant="outline" className="text-xs sm:text-sm gap-2">
              <List className="w-4 h-4" />
              Manage Categories
            </Button>
          </Link>
          <Link href="/dashboard/menu/items/new">
            <Button className="text-xs sm:text-sm gap-2">
              <Plus className="w-4 h-4" />
              Add Menu Item
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3.5 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Categories</CardTitle>
            <List className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-6 pt-0 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{categoriesCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3.5 sm:p-6 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Menu Items</CardTitle>
            <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="p-3.5 sm:p-6 pt-0 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{menuItemsCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">Recent Menu Items</CardTitle>
              <CardDescription className="text-xs">A list of recently added or updated dishes.</CardDescription>
            </div>
            <Link href="/dashboard/menu/items" className="text-xs font-semibold text-primary hover:underline">
              View All Items →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {menuItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center p-6">
              <Utensils className="h-10 w-10 text-muted-foreground mb-4" />
              <p>No menu items found. Get started by adding a category and some items.</p>
            </div>
          ) : (
            <>
              {/* MOBILE CARDS VIEW (< md) */}
              <div className="md:hidden divide-y divide-border">
                {menuItems.map((item) => (
                  <div key={item.id} className="p-4 flex items-start gap-3 hover:bg-surface-muted/30 transition-colors">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-muted border border-border shrink-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Utensils className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                        <span className="font-extrabold text-sm text-foreground shrink-0">
                          {formatPrice(Number(item.price))}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.category?.name || "Uncategorized"}</p>
                      <div className="flex items-center justify-between mt-2">
                        {item.isAvailable ? (
                          <Badge variant="success" className="text-[10px] px-1.5 py-0">Available</Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">Unavailable</Badge>
                        )}
                        <Link href={`/dashboard/menu/items/${item.id}/edit`}>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs font-semibold">
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP TABLE VIEW (>= md) */}
              <div className="hidden md:block relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-16">Image</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Category</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Price</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {menuItems.map((item) => (
                      <tr key={item.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <td className="p-4 align-middle">
                          {item.imageUrl ? (
                            <div className="w-11 h-11 rounded-xl overflow-hidden border border-border bg-muted shadow-2xs">
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-11 h-11 rounded-xl border border-dashed border-border bg-muted/50 flex items-center justify-center text-muted-foreground/40">
                              <Utensils className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td className="p-4 align-middle font-medium">{item.name}</td>
                        <td className="p-4 align-middle">{item.category?.name || "Uncategorized"}</td>
                        <td className="p-4 align-middle">{formatPrice(Number(item.price))}</td>
                        <td className="p-4 align-middle">
                          {item.isAvailable ? (
                            <Badge variant="success">Available</Badge>
                          ) : (
                            <Badge variant="default">Unavailable</Badge>
                          )}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <Link href={`/dashboard/menu/items/${item.id}/edit`}>
                            <Button size="sm" variant="outline" className="text-xs">
                              Edit
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
