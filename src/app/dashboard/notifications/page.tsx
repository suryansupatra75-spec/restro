import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listUserNotifications } from "@/lib/notifications/service";
import { ClientNotificationCenter } from "./client-notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.restaurants || user.restaurants.length === 0) {
    redirect("/onboarding");
  }

  const membership = user.restaurants[0];
  if (membership.status === "DISABLED") {
    redirect("/dashboard");
  }

  const initialData = await listUserNotifications({
    restaurantId: membership.restaurantId,
    userId: user.id,
    role: membership.role,
    limit: 50,
  });

  return (
    <ClientNotificationCenter
      restaurantId={membership.restaurantId}
      restaurantName={membership.restaurant.name}
      role={membership.role}
      initialNotifications={initialData.notifications}
      initialUnreadCount={initialData.unreadCount}
      initialPreferences={initialData.preferences}
    />
  );
}
