/* eslint-disable @next/next/no-img-element */
import { getCurrentUser } from "@/lib/auth";
import { prisma as db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Utensils, Leaf, Heart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MenuItemsPage() {
  const user = await getCurrentUser();
  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const currentRestaurant = user.restaurants[0].restaurant;

  const menuItems = await db.menuItem.findMany({
    where: { restaurantId: currentRestaurant.id },
    include: { category: true },
    orderBy: { createdAt: "desc" }
  });

  const currency = currentRestaurant.currency || "USD";
  const formatPrice = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(val);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Menu Items
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage your dishes, photos, prices, and availability.
          </p>
        </div>
        <Link href="/dashboard/menu/items/new">
          <Button className="w-full sm:w-auto gap-2">
            <Plus className="w-4 h-4" />
            Add Menu Item
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6 border-b border-border">
          <CardTitle className="text-lg font-bold">All Menu Items</CardTitle>
          <CardDescription className="text-xs">
            {menuItems.length} {menuItems.length === 1 ? "dish" : "dishes"} in your restaurant catalog
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {menuItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center p-6">
              <Utensils className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="font-semibold text-foreground">No menu items found</p>
              <p className="text-xs mt-1">Get started by creating your first dish.</p>
              <Link href="/dashboard/menu/items/new" className="mt-4">
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> Add Item
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {/* MOBILE CARDS VIEW (Visible on < md) */}
              <div className="md:hidden divide-y divide-border">
                {menuItems.map((item) => (
                  <div key={item.id} className="p-4 flex items-start gap-3 hover:bg-surface-muted/30 transition-colors">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-muted border border-border shrink-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Utensils className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-[10px] font-bold text-muted-foreground bg-surface-muted px-2 py-0.5 rounded-md">
                          {item.category?.name || "Uncategorized"}
                        </span>
                        {item.isVegetarian && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            <Leaf className="w-2.5 h-2.5" /> Veg
                          </span>
                        )}
                        {item.isVegan && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                            <Heart className="w-2.5 h-2.5" /> Vegan
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-sm text-foreground truncate">{item.name}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-extrabold text-sm text-foreground">
                          {formatPrice(Number(item.price))}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {item.isAvailable ? (
                            <Badge variant="success" className="text-[10px] px-1.5 py-0">Available</Badge>
                          ) : (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">Off</Badge>
                          )}
                          <Link href={`/dashboard/menu/items/${item.id}/edit`}>
                            <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs font-bold gap-1">
                              <Edit2 className="h-3.5 w-3.5" /> Edit
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP TABLE VIEW (Visible on md and up) */}
              <div className="hidden md:block relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-16">Image</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Category</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Price</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {menuItems.map((item) => (
                      <tr key={item.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <td className="p-4 align-middle">
                          {item.imageUrl ? (
                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-border bg-muted shadow-2xs">
                              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-xl border border-dashed border-border bg-muted/50 flex items-center justify-center text-muted-foreground/40">
                              <Utensils className="w-5 h-5" />
                            </div>
                          )}
                        </td>
                        <td className="p-4 align-middle font-medium">{item.name}</td>
                        <td className="p-4 align-middle">{item.category?.name || "Uncategorized"}</td>
                        <td className="p-4 align-middle">{formatPrice(Number(item.price))}</td>
                        <td className="p-4 align-middle">
                          <div className="flex gap-2">
                             {item.isVegetarian && <Badge variant="success">Veg</Badge>}
                             {item.isVegan && <Badge variant="success">Vegan</Badge>}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          {item.isAvailable ? (
                            <Badge variant="success">Available</Badge>
                          ) : (
                            <Badge variant="default">Unavailable</Badge>
                          )}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/dashboard/menu/items/${item.id}/edit`}>
                              <Button size="sm" variant="outline">
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
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
