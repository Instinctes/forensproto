/**
 * Mandantenfähigkeit (Multi-Tenancy)
 * ==================================
 * Jeder Benutzer gehört zu einem Tenant; forensische Datensätze tragen
 * eine tenantId. Das Scoping wird nur erzwungen, wenn Auth aktiv ist –
 * andernfalls läuft alles im Tenant "default" (abwärtskompatibel).
 */

import { randomUUID } from "crypto";
import { db } from "../db";
import { authEnabled } from "./context";

export interface Tenant {
  id: string;
  name: string;
  createdAt: number;
}

export const DEFAULT_TENANT = "default";

export function ensureDefaultTenant(): void {
  if (!db.get<Tenant>("tenants", DEFAULT_TENANT)) {
    db.put<Tenant>("tenants", DEFAULT_TENANT, {
      id: DEFAULT_TENANT,
      name: "Standard-Mandant",
      createdAt: Date.now(),
    });
  }
}

export function createTenant(name: string): Tenant {
  const t: Tenant = { id: `tenant-${randomUUID().slice(0, 10)}`, name, createdAt: Date.now() };
  db.put<Tenant>("tenants", t.id, t);
  return t;
}

export function getTenant(id: string): Tenant | undefined {
  return db.get<Tenant>("tenants", id)?.data;
}

export function listTenants(): Tenant[] {
  ensureDefaultTenant();
  return db.all<Tenant>("tenants").map((r) => r.data);
}

/**
 * Filtert eine Liste tenant-behafteter Objekte auf den Mandanten des
 * Kontexts. Ohne aktive Auth (oder Admin-System-Kontext "default") wird
 * nicht gefiltert.
 */
export function scopeToTenant<T extends { tenantId?: string }>(items: T[], tenantId: string): T[] {
  if (!authEnabled()) return items;
  return items.filter((it) => (it.tenantId || DEFAULT_TENANT) === tenantId);
}
