import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Utensils, Users, DollarSign, ChefHat, ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { DashboardAutoRefresher } from "./auto-refresher";

const STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ACCEPTED: "bg-blue-100 text-blue-800 border-blue-200",
  PREPARING: "bg-purple-100 text-purple-800 border-purple-200",
  READY: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-neutral-100 text-neutral-800 border-neutral-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const currentRestaurant = user?.restaurants[0]?.restaurant;

  if (!currentRestaurant) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-muted-foreground">
        No restaurant found.
      </div>
    );
  }

  // Real Database Queries
  const [menuItemsCount, activeOrdersCount, totalOrdersCount, recentOrders, allOrders] = await Promise.all([
    prisma.menuItem.count({
      where: { restaurantId: currentRestaurant.id, status: "ACTIVE" },
    }),
    prisma.order.count({
      where: {
        restaurantId: currentRestaurant.id,
        status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] },
      },
    }),
    prisma.order.count({
      where: { restaurantId: currentRestaurant.id },
    }),
    prisma.order.findMany({
      where: { restaurantId: currentRestaurant.id },
      include: {
        table: true,
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.order.findMany({
      where: {
        restaurantId: currentRestaurant.id,
        status: { notIn: ["REJECTED", "CANCELLED"] },
      },
      select: { total: true },
    }),
  ]);

  // Calculate Revenue
  const totalRevenueNumber = allOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const currency = currentRestaurant.currency || "USD";
  const formattedRevenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(totalRevenueNumber);

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {user?.name.split(" ")[0]}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Here is what is happening at <span className="font-semibold text-foreground">{currentRestaurant.name}</span> today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardAutoRefresher />
          <Link
            href="/dashboard/kitchen"
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            <ChefHat className="w-4 h-4" />
            Kitchen Display
          </Link>
          <Link
            href="/dashboard/orders"
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            Live Orders
          </Link>
        </div>
      </div>

      {/* Dynamic Real Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-foreground truncate">{formattedRevenue}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">
              From {allOrders.length} valid orders
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Active Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600 shrink-0" />
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-foreground truncate">{activeOrdersCount}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">
              {activeOrdersCount > 0 ? "Requires kitchen attention" : "No active orders right now"}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Menu Items</CardTitle>
            <Utensils className="h-4 w-4 text-orange-600 shrink-0" />
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-foreground truncate">{menuItemsCount}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">
              Active items available
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Orders</CardTitle>
            <Users className="h-4 w-4 text-green-600 shrink-0" />
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-foreground truncate">{totalOrdersCount}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">
              Cumulative orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Recent Orders Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-surface-muted/30 p-3.5 sm:px-6 sm:py-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold">Recent Customer Orders</CardTitle>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Real-time orders placed via table QR codes</p>
          </div>
          <Link
            href="/dashboard/orders"
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0"
          >
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-muted-foreground">
              <ShoppingCart className="w-10 sm:w-12 h-10 sm:h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-sm sm:text-base text-foreground">No orders received yet</p>
              <p className="text-xs mt-1">Scan a table QR code to place your first customer order!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentOrders.map((order) => {
                const totalItemQty = order.items.reduce((acc, i) => acc + i.quantity, 0);
                const orderTotal = new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency,
                }).format(Number(order.total));

                return (
                  <div
                    key={order.id}
                    className="p-3 sm:p-4 px-3.5 sm:px-6 flex items-center justify-between hover:bg-surface-muted/40 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
                        {order.table?.name || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-foreground truncate">{order.orderNumber}</span>
                          <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 ${STATUS_BADGES[order.status] || "bg-gray-100 text-gray-800"}`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                          Table {order.table?.name} • {totalItemQty} {totalItemQty === 1 ? "item" : "items"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-bold text-xs sm:text-sm text-foreground">{orderTotal}</div>
                      <div className="text-[10px] sm:text-[11px] text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="truncate">{formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Navigation Cards */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/kitchen"
          className="p-4 sm:p-5 bg-surface border border-border rounded-xl hover:border-purple-500/50 hover:shadow-md transition-all group flex items-start gap-3 sm:gap-4"
        >
          <div className="p-2.5 sm:p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
            <ChefHat className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-sm">Kitchen Display (KDS)</h3>
            <p className="text-xs text-muted-foreground mt-1">Live prep tickets, timers, and kitchen state flow</p>
          </div>
        </Link>

        <Link
          href="/dashboard/menu"
          className="p-4 sm:p-5 bg-surface border border-border rounded-xl hover:border-orange-500/50 hover:shadow-md transition-all group flex items-start gap-3 sm:gap-4"
        >
          <div className="p-2.5 sm:p-3 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors shrink-0">
            <Utensils className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-sm">Menu Management</h3>
            <p className="text-xs text-muted-foreground mt-1">Add items, configure variants, add-ons and pricing</p>
          </div>
        </Link>

        <Link
          href="/dashboard/tables"
          className="p-4 sm:p-5 bg-surface border border-border rounded-xl hover:border-blue-500/50 hover:shadow-md transition-all group flex items-start gap-3 sm:gap-4"
        >
          <div className="p-2.5 sm:p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-sm">Tables & QR Codes</h3>
            <p className="text-xs text-muted-foreground mt-1">Generate contactless digital menus for your dining tables</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
