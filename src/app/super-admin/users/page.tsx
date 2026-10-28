import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminUsersClient } from "./client-users";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    return null;
  }

  return <SuperAdminUsersClient />;
}
