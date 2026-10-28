import * as z from "zod";

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url("Must be a valid URL").optional().nullable(),
  isActive: z.boolean().default(true),
});

export const menuItemSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be at least 0"),
  imageUrl: z.string().optional().nullable(),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isVegetarian: z.boolean().default(false),
  isVegan: z.boolean().default(false),
  sortOrder: z.coerce.number().default(0),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export const variantSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  price: z.coerce.number().min(0, "Price must be at least 0"),
  isAvailable: z.boolean().default(true),
});

export const addonSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be at least 0"),
  isAvailable: z.boolean().default(true),
});
