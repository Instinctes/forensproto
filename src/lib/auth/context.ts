/**
 * Auth-Context & Enforcement
 * ==========================
 * Zentrale Stelle, um die Identität eines Requests aufzulösen (Session-
 * Cookie ODER X-API-Key) und Permissions zu prüfen.
 *
 * Gated über FORENSPROTO_AUTH: ist Auth deaktiviert (Default), verhält
 * sich die App wie bisher – `requirePermission` lässt alles durch und
 * liefert einen System-Kontext (Tenant "default"). So bleibt die
 * Research-Preview ohne Login lauffähig; produktiv wird Auth per Flag
 * scharf geschaltet.
 */

import { NextResponse } from "next/server";
import { resolveSession, SESSION_COOKIE } from "./session";
import { resolveApiKey } from "./apikeys";
import { getUserById, bootstrapAdmin, countUsers, type Role } from "./users";
import { hasPermission, type Permission } from "./rbac";

export interface AuthContext {
  userId: string;
  username: string;
  role: Role;
  tenantId: string;
  via: "session" | "apikey" | "disabled";
}

export function authEnabled(): boolean {
  const v = (process.env.FORENSPROTO_AUTH || "").toLowerCase();
  return v === "enabled" || v === "1" || v === "true";
}

const SYSTEM_CONTEXT: AuthContext = {
  userId: "system",
  username: "system",
  role: "admin",
  tenantId: "default",
  via: "disabled",
};

// Beim ersten Import mit aktivierter Auth: initialen Admin sicherstellen.
const globalForAuthInit = global as unknown as { __forensAuthInit?: boolean };
if (authEnabled() && !globalForAuthInit.__forensAuthInit) {
  globalForAuthInit.__forensAuthInit = true;
  try {
    if (countUsers() === 0) bootstrapAdmin();
  } catch (e) {
    console.error("[Auth] Bootstrap fehlgeschlagen:", e);
  }
}

/** Testbare Kern-Auflösung aus rohen Credentials. */
export function resolveContextFromCredentials(
  sessionToken?: string | null,
  apiKey?: string | null
): AuthContext | null {
  // 1) API-Key
  const keyRec = resolveApiKey(apiKey);
  if (keyRec) {
    const u = getUserById(keyRec.userId);
    if (u && !u.disabled) {
      return { userId: u.id, username: u.username, role: u.role, tenantId: u.tenantId, via: "apikey" };
    }
  }
  // 2) Session
  const sess = resolveSession(sessionToken);
  if (sess) {
    const u = getUserById(sess.userId);
    if (u && !u.disabled) {
      return { userId: u.id, username: u.username, role: u.role, tenantId: u.tenantId, via: "session" };
    }
  }
  return null;
}

interface RequestLike {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}

export function getAuthContext(request: RequestLike): AuthContext | null {
  if (!authEnabled()) return SYSTEM_CONTEXT;
  const apiKey = request.headers.get("x-api-key") || extractBearer(request.headers.get("authorization"));
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  return resolveContextFromCredentials(sessionToken, apiKey);
}

function extractBearer(h: string | null): string | null {
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/**
 * Prüft Auth + Permission. Gibt bei Erfolg den AuthContext zurück,
 * andernfalls eine fertige NextResponse (401/403), die der Handler
 * direkt zurückgeben kann.
 */
export function requirePermission(request: RequestLike, perm: Permission): AuthContext | NextResponse {
  if (!authEnabled()) return SYSTEM_CONTEXT;
  const ctx = getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (!hasPermission(ctx.role, perm)) {
    return NextResponse.json(
      { error: `Zugriff verweigert – Permission '${perm}' erforderlich (Rolle: ${ctx.role})` },
      { status: 403 }
    );
  }
  return ctx;
}

/** Typ-Guard für Handler. */
export function isAuthError(x: AuthContext | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
