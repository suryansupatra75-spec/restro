"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function EditTablePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<{ id: string, name: string, number: string | null, capacity: number | null, description: string | null } | null>(null);

  useEffect(() => {
    const fetchTable = async () => {
      try {
        const res = await fetch(`/api/v1/tables`);
        if (!res.ok) throw new Error("Failed to fetch tables");
        const tables = await res.json();
        const table = tables.find((t: { id: string }) => t.id === id);
        if (!table) throw new Error("Table not found");
        setInitialData(table);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };
    fetchTable();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      number: formData.get("number") as string || undefined,
      description: formData.get("description") as string || undefined,
      capacity: formData.get("capacity") ? parseInt(formData.get("capacity") as string, 10) : undefined,
    };

    try {
      const res = await fetch(`/api/v1/tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update table");
      }

      router.push("/dashboard/tables");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/tables">
          <Button variant="ghost" size="sm" className="rounded-full w-9 h-9 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Table</h1>
          <p className="text-muted-foreground text-sm">Update table details.</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {initialData && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Table Name *</Label>
              <Input id="name" name="name" required defaultValue={initialData.name} placeholder="e.g. Table 1, Window Seat A" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="number">Table Number (Optional)</Label>
                <Input id="number" name="number" defaultValue={initialData.number || ""} placeholder="e.g. 1, 42" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (Optional)</Label>
                <Input id="capacity" name="capacity" type="number" min="1" defaultValue={initialData.capacity || ""} placeholder="e.g. 4" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input id="description" name="description" defaultValue={initialData.description || ""} placeholder="e.g. Near the window" />
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <Link href="/dashboard/tables">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
