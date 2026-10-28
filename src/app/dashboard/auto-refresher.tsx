"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardAutoRefresher() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Automatically revalidate server data every 10 seconds so stats update in real-time
    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 px-2.5 text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer"
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      disabled={isPending}
      title="Live stats auto-refresh every 10 seconds"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin text-primary" : ""}`} />
      <span className="hidden sm:inline">Live Refresh</span>
    </Button>
  );
}
