import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SuperAdminUserDetailClient } from "./client-user-detail";

export const dynamic = "force-dynamic";

export default async function SuperAdminUserDetailPage(props: {
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
  return (
    <SuperAdminUserDetailClient userId={id} currentActorId={user.id} />
  );
}
