import { ClientInviteAccept } from "./client-invite";

export const metadata = {
  title: "Join Restaurant Staff | Digital Dining SaaS",
  description: "Accept staff invitation to join restaurant management portal.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col items-center justify-center p-4">
      <ClientInviteAccept token={token} />
    </div>
  );
}
