import { notFound } from "next/navigation";
import { getPublicReceiptByToken } from "@/lib/receipts/service";
import { ClientReceiptView } from "./client-receipt";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReceiptPublicPage({ params }: PageProps) {
  const { token } = await params;

  if (!token) {
    notFound();
  }

  const receipt = await getPublicReceiptByToken(token);

  if (!receipt) {
    return (
      <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-xl font-bold">?</span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
            Receipt Not Found
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            The requested digital receipt could not be located or the link may have expired.
            Please verify the URL or ask the restaurant staff for an updated receipt.
          </p>
        </div>
      </div>
    );
  }

  return <ClientReceiptView receiptData={receipt} />;
}
