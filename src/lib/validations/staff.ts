import { z } from "zod";

export const inviteStaffSchema = z.object({
  email: z.string().email("Please provide a valid email address").toLowerCase().trim(),
  role: z.enum(["OWNER", "MANAGER", "STAFF", "KITCHEN"], {
    message: "Role must be OWNER, MANAGER, STAFF, or KITCHEN",
  }),
});

export const updateStaffSchema = z.object({
  role: z.enum(["OWNER", "MANAGER", "STAFF", "KITCHEN"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
}).refine(data => data.role !== undefined || data.status !== undefined, {
  message: "Either role or status must be provided",
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
});
