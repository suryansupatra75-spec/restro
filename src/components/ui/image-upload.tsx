/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, Link as LinkIcon, Sparkles, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const FOOD_PRESETS = [
  {
    name: "Classic Pizza",
    url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Juicy Burger",
    url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Special Biryani / Rice",
    url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Creamy Pasta",
    url: "https://images.unsplash.com/photo-1621996346565-e3d5d6281290?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Fresh Garden Salad",
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Crispy Appetizers / Fries",
    url: "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Refreshing Mocktail / Drinks",
    url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Dessert / Cake / Sweet",
    url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Artisan Coffee",
    url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80",
  },
  {
    name: "Loaded Sandwich",
    url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
  },
];

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "url" | "presets">("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image file must be under 5MB.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/v1/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      onChange(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleApplyUrl = () => {
    if (!customUrl.trim()) return;
    onChange(customUrl.trim());
    setCustomUrl("");
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <div className="space-y-3">
      {/* Current Image Preview */}
      {value ? (
        <div className="relative w-full max-w-md aspect-[16/9] rounded-2xl overflow-hidden border border-border bg-surface-muted group shadow-xs">
          <img
            src={value}
            alt="Dish Preview"
            className="w-full h-full object-cover transition-transform group-hover:scale-102"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={disabled}
              className="bg-white/90 hover:bg-white text-destructive border-none shadow-md font-bold"
            >
              <X className="w-4 h-4 mr-1.5" />
              Remove Image
            </Button>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center cursor-pointer transition shadow"
            title="Remove Image"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex border-b border-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`pb-2 px-3 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
                activeTab === "upload"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("presets")}
              className={`pb-2 px-3 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
                activeTab === "presets"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Food Presets
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("url")}
              className={`pb-2 px-3 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
                activeTab === "url"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Paste URL
            </button>
          </div>

          {/* TAB 1: Upload File */}
          {activeTab === "upload" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleFileChange}
                disabled={disabled || isUploading}
                className="hidden"
                id="menu-item-file-upload"
              />
              <label
                htmlFor="menu-item-file-upload"
                className={`flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 rounded-2xl p-6 cursor-pointer bg-surface hover:bg-surface-muted/50 transition-all ${
                  isUploading ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-xs font-semibold text-muted-foreground">Uploading image...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Click or tap to upload photo</p>
                      <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WebP or GIF up to 5MB</p>
                    </div>
                  </div>
                )}
              </label>
            </div>
          )}

          {/* TAB 2: Food Presets */}
          {activeTab === "presets" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Select one of our appetizing high-resolution photos for your dish:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 max-h-56 overflow-y-auto p-1">
                {FOOD_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onChange(preset.url)}
                    className="group flex flex-col rounded-xl overflow-hidden border border-border hover:border-primary hover:shadow-md transition text-left cursor-pointer"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <span className="p-1.5 text-[11px] font-semibold text-foreground truncate block">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Paste URL */}
          {activeTab === "url" && (
            <div className="flex gap-2">
              <Input
                placeholder="https://images.unsplash.com/photo-..."
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={disabled}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleApplyUrl}
                disabled={disabled || !customUrl.trim()}
                className="shrink-0 text-xs font-bold"
              >
                Apply
              </Button>
            </div>
          )}

          {uploadError && (
            <p className="text-xs text-destructive font-medium">{uploadError}</p>
          )}
        </div>
      )}
    </div>
  );
}
