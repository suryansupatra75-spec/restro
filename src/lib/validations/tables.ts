import { z } from "zod";

export const tableSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name is too long"),
  number: z.string().optional(),
  description: z.string().max(200, "Description is too long").optional(),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().default(0),
});
