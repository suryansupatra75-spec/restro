"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  if (iconOnly) {
    return (
      <Button variant="ghost" size="sm" onClick={handleLogout} disabled={loading} className="w-10 px-0">
        <LogOut className="h-5 w-5" />
        <span className="sr-only">Log out</span>
      </Button>
    );
  }

  return (
    <Button 
      variant="outline" 
      className="w-full justify-start text-muted-foreground hover:text-foreground" 
      onClick={handleLogout}
      disabled={loading}
    >
      <LogOut className="mr-2 h-4 w-4" />
      {loading ? "Logging out..." : "Log out"}
    </Button>
  );
}
