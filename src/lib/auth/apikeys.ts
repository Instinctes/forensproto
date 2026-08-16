/**
 * API-Keys für programmatischen Zugriff
 * =====================================
 * Der Klartext-Key wird nur einmal bei Erzeugung zurückgegeben; gespeichert
 * wird ausschließlich der SHA-256-Hash. Lookups erfolgen über den Hash.
 * Key-Format: fp_<keyId>_<secret>
 */

import { randomBytes, createHash, randomUUID } from "crypto";
import { db } from "../db";

export interface ApiKeyRecord {
  id: string;
  hash: string; // sha256(plaintext)
  userId: string;
  label: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked?: boolean;
}

function hashKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function createApiKey(userId: string, label = "default"): { record: Omit<ApiKeyRecord, "hash">; plaintext: string } {
  const id = randomUUID().slice(0, 8);
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `fp_${id}_${secret}`;
  const record: ApiKeyRecord = {
    id,
    hash: hashKey(plaintext),
    userId,
    label,
    createdAt: Date.now(),
  };
  db.put<ApiKeyRecord>("apikeys", id, record);
  const { hash: _h, ...safe } = record;
  void _h;
  return { record: safe, plaintext };
}

export function resolveApiKey(plaintext: string | undefined | null): ApiKeyRecord | null {
  if (!plaintext || !plaintext.startsWith("fp_")) return null;
  const h = hashKey(plaintext);
  const rec = db.all<ApiKeyRecord>("apikeys").map((r) => r.data).find((k) => k.hash === h && !k.revoked);
  if (!rec) return null;
  db.put<ApiKeyRecord>("apikeys", rec.id, { ...rec, lastUsedAt: Date.now() });
  return rec;
}

export function listApiKeys(userId: string): Array<Omit<ApiKeyRecord, "hash">> {
  return db
    .all<ApiKeyRecord>("apikeys")
    .map((r) => r.data)
    .filter((k) => k.userId === userId)
    .map(({ hash: _h, ...rest }) => {
      void _h;
      return rest;
    });
}

export function revokeApiKey(id: string): boolean {
  const rec = db.get<ApiKeyRecord>("apikeys", id)?.data;
  if (!rec) return false;
  db.put<ApiKeyRecord>("apikeys", id, { ...rec, revoked: true });
  return true;
}
