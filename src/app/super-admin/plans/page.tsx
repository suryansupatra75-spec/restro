import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ClientSuperAdminPlans } from "./client-plans";

export const dynamic = "force-dynamic";

export default async function SuperAdminPlansPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.isSuperAdmin !== true) {
    redirect("/dashboard?denied=super-admin");
  }

  return <ClientSuperAdminPlans />;
}
