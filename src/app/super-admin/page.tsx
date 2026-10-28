import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminOverviewClient } from "./client-overview";

export const dynamic = "force-dynamic";

export default async function SuperAdminOverviewPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    return null;
  }

  return <SuperAdminOverviewClient />;
}
