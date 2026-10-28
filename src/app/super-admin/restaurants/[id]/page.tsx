import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminRestaurantDetailClient } from "./client-restaurant-detail";

export const dynamic = "force-dynamic";

export default async function SuperAdminRestaurantDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    return null;
  }

  const { id } = await props.params;
  return <SuperAdminRestaurantDetailClient restaurantId={id} />;
}
