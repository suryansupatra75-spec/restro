// Phase 10: Staff Management, Roles & Permissions Architecture

export type StaffRole = "OWNER" | "MANAGER" | "STAFF" | "KITCHEN";

export type Permission =
  | "staff.view"
  | "staff.invite"
  | "staff.update"
  | "staff.disable"
  | "staff.remove"
  | "menu.view"
  | "menu.manage"
  | "tables.view"
  | "tables.manage"
  | "orders.view"
  | "orders.manage"
  | "kitchen.view"
  | "kitchen.manage"
  | "payments.view"
  | "payments.manage"
  | "restaurant.manage"
  | "customers.view"
  | "customers.search"
  | "customers.viewContact"
  | "customers.manageNotes"
  | "inventory.view"
  | "inventory.create"
  | "inventory.update"
  | "inventory.receive"
  | "inventory.adjust"
  | "inventory.viewHistory"
  | "inventory.manageRecipes"
  | "inventory.viewCosts"
  | "analytics.view"
  | "analytics.export"
  | "settings.view"
  | "settings.manage"
  | "billing.view"
  | "billing.manage"
  | "promotions.view"
  | "promotions.manage"
  | "loyalty.view"
  | "loyalty.manage"
  | "loyalty.adjust"
  | "integrations.view"
  | "integrations.manage"
  | "integrations.test"
  | "api_keys.manage"
  | "receipts.view"
  | "receipts.manage"
  | "receipts.send"
  | "audit.view"
  | "audit.export";

export const ALL_ROLES: StaffRole[] = ["OWNER", "MANAGER", "STAFF", "KITCHEN"];
export const ASSIGNABLE_ROLES: StaffRole[] = ["MANAGER", "STAFF", "KITCHEN"];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  OWNER: [
    "staff.view",
    "staff.invite",
    "staff.update",
    "staff.disable",
    "staff.remove",
    "menu.view",
    "menu.manage",
    "tables.view",
    "tables.manage",
    "orders.view",
    "orders.manage",
    "kitchen.view",
    "kitchen.manage",
    "payments.view",
    "payments.manage",
    "restaurant.manage",
    "customers.view",
    "customers.search",
    "customers.viewContact",
    "customers.manageNotes",
    "inventory.view",
    "inventory.create",
    "inventory.update",
    "inventory.receive",
    "inventory.adjust",
    "inventory.viewHistory",
    "inventory.manageRecipes",
    "inventory.viewCosts",
    "analytics.view",
    "analytics.export",
    "settings.view",
    "settings.manage",
    "billing.view",
    "billing.manage",
    "promotions.view",
    "promotions.manage",
    "loyalty.view",
    "loyalty.manage",
    "loyalty.adjust",
    "integrations.view",
    "integrations.manage",
    "integrations.test",
    "api_keys.manage",
    "receipts.view",
    "receipts.manage",
    "receipts.send",
    "audit.view",
    "audit.export",
  ],
  MANAGER: [
    "staff.view",
    "staff.invite",
    "staff.update",
    "staff.disable",
    "staff.remove",
    "menu.view",
    "menu.manage",
    "tables.view",
    "tables.manage",
    "orders.view",
    "orders.manage",
    "kitchen.view",
    "kitchen.manage",
    "payments.view",
    "payments.manage",
    "customers.view",
    "customers.search",
    "customers.viewContact",
    "customers.manageNotes",
    "inventory.view",
    "inventory.create",
    "inventory.update",
    "inventory.receive",
    "inventory.adjust",
    "inventory.viewHistory",
    "inventory.manageRecipes",
    "inventory.viewCosts",
    "analytics.view",
    "analytics.export",
    "settings.view",
    "billing.view",
    "promotions.view",
    "promotions.manage",
    "loyalty.view",
    "loyalty.manage",
    "loyalty.adjust",
    "integrations.view",
    "integrations.test",
    "receipts.view",
    "receipts.manage",
    "receipts.send",
    "audit.view",
  ],
  STAFF: [
    "menu.view",
    "tables.view",
    "orders.view",
    "orders.manage",
    "kitchen.view",
    "payments.view",
    "payments.manage",
    "customers.view",
    "customers.search",
    "inventory.view",
    "inventory.receive",
    "promotions.view",
    "loyalty.view",
    "receipts.view",
    "receipts.send",
  ],
  KITCHEN: [
    "kitchen.view",
    "kitchen.manage",
    "orders.view",
    "menu.view",
    "inventory.view",
  ],
};

/**
 * Check if a role possesses a specific permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as StaffRole];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Determine if an actor role is authorized to manage a member of targetRole.
 * Owner can manage MANAGER, STAFF, KITCHEN.
 * Manager can ONLY manage STAFF, KITCHEN (cannot touch Owner or other Managers).
 * Staff/Kitchen cannot manage anyone.
 */
export function canManageTargetRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === "OWNER") {
    return targetRole !== "OWNER"; // Owner cannot target another owner if any
  }
  if (actorRole === "MANAGER") {
    return targetRole === "STAFF" || targetRole === "KITCHEN";
  }
  return false;
}

/**
 * Determine if an actor role is authorized to assign or invite to a given newRole.
 * OWNER can assign MANAGER, STAFF, KITCHEN.
 * MANAGER can ONLY assign STAFF, KITCHEN.
 * Nobody can grant OWNER through staff management (Owner Protection).
 */
export function canAssignRole(actorRole: string, newRole: string): boolean {
  if (newRole === "OWNER") return false; // Strictly blocked

  if (actorRole === "OWNER") {
    return ["MANAGER", "STAFF", "KITCHEN"].includes(newRole);
  }
  if (actorRole === "MANAGER") {
    return ["STAFF", "KITCHEN"].includes(newRole);
  }
  return false;
}

/**
 * Human-readable role labels and descriptions.
 */
export const ROLE_METADATA: Record<StaffRole, { title: string; description: string; badgeColor: string }> = {
  OWNER: {
    title: "Owner",
    description: "Full control over restaurant settings, staff, billing, and operational systems.",
    badgeColor: "bg-red-100 text-red-800 border-red-200",
  },
  MANAGER: {
    title: "Manager",
    description: "Operational management of menus, tables, orders, KDS, and operational staff.",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
  },
  STAFF: {
    title: "Floor Staff",
    description: "Front-of-house operations: table overview, order placement, and cash settlements.",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  KITCHEN: {
    title: "Kitchen (Chef)",
    description: "Kitchen display (KDS) access to view incoming tickets and advance prep states.",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
  },
};
