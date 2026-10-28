import { getCurrentUser } from "@/lib/auth";
import { prisma as db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";

export default async function MenuPreviewPage() {
  const user = await getCurrentUser();
  if (!user || user.restaurants.length === 0) {
    redirect("/login");
  }

  const currentRestaurant = user.restaurants[0].restaurant;

  const categories = await db.menuCategory.findMany({
    where: { 
      restaurantId: currentRestaurant.id,
      isActive: true 
    },
    include: {
      items: {
        where: {
          isAvailable: true,
          status: 'ACTIVE'
        }
      }
    },
    orderBy: { sortOrder: 'asc' }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 bg-surface-muted min-h-screen pb-12">
      <div className="bg-surface border-b px-8 py-12 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-primary mb-2">
          {currentRestaurant.name}
        </h1>
        <p className="text-muted-foreground">Our Menu</p>
      </div>

      <div className="px-4 md:px-8 space-y-12 mt-8">
        {categories.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No active categories or items found.
          </div>
        ) : (
          categories.map((category) => (
            category.items.length > 0 && (
              <div key={category.id} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold border-b pb-2 inline-block">
                    {category.name}
                  </h2>
                  {category.description && (
                    <p className="text-muted-foreground mt-2">{category.description}</p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {category.items.map((item) => (
                    <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <CardContent className="p-0 flex flex-col h-full">
                        {item.imageUrl && (
                          <div 
                            className="h-48 w-full bg-cover bg-center" 
                            style={{ backgroundImage: `url(${item.imageUrl})` }}
                          />
                        )}
                        <div className="p-4 flex flex-col flex-1">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <h3 className="font-semibold text-lg">{item.name}</h3>
                              <div className="flex gap-2 mt-1 mb-2">
                                {item.isVegetarian && <Badge variant="success" className="text-[10px] px-1.5 py-0">Veg</Badge>}
                                {item.isVegan && <Badge variant="success" className="text-[10px] px-1.5 py-0">Vegan</Badge>}
                              </div>
                            </div>
                            <div className="font-bold whitespace-nowrap">
                              ${Number(item.price).toFixed(2)}
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-2 flex-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          ))
        )}
      </div>
    </div>
  );
}
