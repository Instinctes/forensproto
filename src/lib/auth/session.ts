/**
 * Session-Verwaltung mit signierten Tokens (HMAC-SHA256)
 * =====================================================
 * Token-Format: base64url(JSON{sid,userId,exp}).<hmacHex>
 * Der HMAC verhindert Manipulation; die serverseitige Session-Tabelle
 * erlaubt explizites Invalidieren (Logout) und überlebt Neustarts.
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { db } from "../db";
import { getServerSecret } from "./secret";

export const SESSION_COOKIE = "fp_session";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12h

interface SessionRecord {
  sid: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getServerSecret()).update(payloadB64).digest("hex");
}

export function createSession(userId: string, ttlMs = DEFAULT_TTL_MS): string {
  const sid = randomUUID();
  const now = Date.now();
  const rec: SessionRecord = { sid, userId, createdAt: now, expiresAt: now + ttlMs };
  db.put<SessionRecord>("sessions", sid, rec);

  const payload = Buffer.from(JSON.stringify({ sid, userId, exp: rec.expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function resolveSession(token: string | undefined | null): { userId: string; sid: string } | null {
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  // HMAC zeitkonstant prüfen
  const expected = sign(payload);
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { sid: string; userId: string; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (Date.now() > parsed.exp) return null;

  const rec = db.get<SessionRecord>("sessions", parsed.sid)?.data;
  if (!rec || rec.userId !== parsed.userId || Date.now() > rec.expiresAt) return null;

  return { userId: rec.userId, sid: rec.sid };
}

export function destroySession(sid: string): void {
  db.remove("sessions", sid);
}

/** Entfernt abgelaufene Sessions (kann periodisch aufgerufen werden). */
export function purgeExpiredSessions(): number {
  let n = 0;
  for (const row of db.all<SessionRecord>("sessions")) {
    if (Date.now() > row.data.expiresAt) {
      db.remove("sessions", row.id);
      n++;
    }
  }
  return n;
}
