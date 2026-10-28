import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminAuditLogsClient } from "./client-audit-logs";

export const dynamic = "force-dynamic";

export default async function SuperAdminAuditLogsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isSuperAdmin) {
    return null;
  }

  return <SuperAdminAuditLogsClient />;
}
