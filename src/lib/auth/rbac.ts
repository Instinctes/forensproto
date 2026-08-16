/**
 * Rollenbasierte Zugriffskontrolle (RBAC)
 * =======================================
 * Drei Rollen mit aufsteigenden Rechten. Permissions werden explizit pro
 * Rolle vergeben (Whitelist), damit Erweiterungen nachvollziehbar bleiben.
 */

import type { Role } from "./users";

export type Permission =
  | "recovery:start"
  | "recovery:stop"
  | "recovery:delete"
  | "recovery:view"
  | "case:create"
  | "case:view"
  | "case:edit"
  | "evidence:import"
  | "evidence:verify"
  | "report:generate"
  | "audit:view"
  | "admin:users"
  | "admin:tenants"
  | "admin:system";

const VIEWER: Permission[] = ["recovery:view", "case:view", "audit:view"];
const INVESTIGATOR: Permission[] = [
  ...VIEWER,
  "recovery:start",
  "recovery:stop",
  "case:create",
  "case:edit",
  "evidence:import",
  "evidence:verify",
  "report:generate",
];
const ADMIN: Permission[] = [
  ...INVESTIGATOR,
  "recovery:delete",
  "admin:users",
  "admin:tenants",
  "admin:system",
];

const MATRIX: Record<Role, Permission[]> = {
  viewer: VIEWER,
  investigator: INVESTIGATOR,
  admin: ADMIN,
};

export function permissionsForRole(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

export function hasPermission(role: Role, perm: Permission): boolean {
  return permissionsForRole(role).includes(perm);
}
