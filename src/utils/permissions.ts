// src/utils/permissions.ts
// ---------------------------------------------------------------------------
// Role-based access control.
// A signed-in user is assigned a role (stored in the `users/{uid}` Firestore
// document). Each role grants a fixed set of permissions. UI elements check
// permissions via `useAuth().can(...)`; the same model is mirrored in
// firestore.rules for server-side enforcement.
// ---------------------------------------------------------------------------

export type Role = "admin" | "staff" | "viewer";

export type Permission =
  | "viewInventory" // browse categories & products
  | "viewDashboard" // open the analytics dashboard
  | "editStock" // change front/back quantities
  | "addProduct" // add new products
  | "deleteProduct" // remove products
  | "manageSuppliers" // create/edit suppliers
  | "manageUsers"; // administer other users' roles

export const ROLES: Role[] = ["admin", "staff", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  viewer: "Viewer",
};

/** What each role is allowed to do. Edit freely to fit your business. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "viewInventory",
    "viewDashboard",
    "editStock",
    "addProduct",
    "deleteProduct",
    "manageSuppliers",
    "manageUsers",
  ],
  staff: [
    "viewInventory",
    "viewDashboard",
    "editStock",
    "addProduct",
    "manageSuppliers",
  ],
  viewer: ["viewInventory", "viewDashboard"],
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "staff" || value === "viewer";
}

export function hasPermission(role: Role | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
