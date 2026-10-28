"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { ImageUpload } from "@/components/ui/image-upload";

interface Category {
  id: string;
  name: string;
}

export default function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const itemId = resolvedParams.id;
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegan, setIsVegan] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // 1. Fetch categories
        const catsRes = await fetch("/api/v1/menu/categories");
        const catsData = await catsRes.json();
        const cats = Array.isArray(catsData) ? catsData : catsData.data || [];
        setCategories(cats);

        // 2. Fetch the menu item
        const itemRes = await fetch(`/api/v1/menu/items/${itemId}`);
        if (!itemRes.ok) throw new Error("Failed to load menu item");
        const item = await itemRes.json();

        setName(item.name || "");
        setCategoryId(item.categoryId || (cats[0]?.id || ""));
        setDescription(item.description || "");
        setPrice(String(item.price || ""));
        setImageUrl(item.imageUrl || "");
        setIsAvailable(item.isAvailable ?? true);
        setIsVegetarian(item.isVegetarian ?? false);
        setIsVegan(item.isVegan ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load item data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [itemId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId || !price) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch(`/api/v1/menu/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          categoryId,
          description: description.trim() || null,
          price: parseFloat(price),
          imageUrl: imageUrl.trim() || null,
          isAvailable,
          isVegetarian,
          isVegan,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update menu item");
      }

      router.push("/dashboard/menu/items");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update menu item");
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Loading dish details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/menu/items">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Edit Menu Item
          </h1>
          <p className="text-muted-foreground mt-1">
            Update dish information, pricing, and photo.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
          <CardDescription>Changes will update in real time across digital menus.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Item Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Margherita Pizza"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={isSubmitting || categories.length === 0}
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="e.g. Classic pizza with fresh tomatoes and mozzarella"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Dish Photo</Label>
                <ImageUpload
                  value={imageUrl}
                  onChange={setImageUrl}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-4 md:col-span-2">
                <h3 className="text-sm font-medium">Dietary & Availability</h3>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      checked={isAvailable}
                      onChange={(e) => setIsAvailable(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span className="text-sm">Available for Ordering</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      checked={isVegetarian}
                      onChange={(e) => setIsVegetarian(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span className="text-sm">Vegetarian</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      checked={isVegan}
                      onChange={(e) => setIsVegan(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span className="text-sm">Vegan</span>
                  </label>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4">
              <Link href="/dashboard/menu/items" className="w-full sm:w-auto">
                <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={isSubmitting}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
