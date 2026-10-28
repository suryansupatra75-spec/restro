import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminRestaurantsClient } from "./client-restaurants";

export const dynamic = "force-dynamic";

export default async function SuperAdminRestaurantsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    return null;
  }

  return <SuperAdminRestaurantsClient />;
}
