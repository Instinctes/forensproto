/**
 * Benutzerverwaltung mit scrypt-Passwort-Hashing
 * ==============================================
 * Passwörter werden mit scrypt (node:crypto) + zufälligem Salt gehasht.
 * Verifikation erfolgt zeitkonstant (timingSafeEqual).
 */

import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "crypto";
import { db } from "../db";

export type Role = "admin" | "investigator" | "viewer";

export interface User {
  id: string;
  username: string;
  passwordHash: string; // Format: scrypt$<saltHex>$<hashHex>
  role: Role;
  tenantId: string;
  createdAt: number;
  disabled?: boolean;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createUser(input: {
  username: string;
  password: string;
  role?: Role;
  tenantId?: string;
}): { ok: boolean; error?: string; user?: Omit<User, "passwordHash"> } {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, error: "Ungültiger Benutzername (3-32, a-z0-9._-)" };
  }
  if ((input.password || "").length < 8) {
    return { ok: false, error: "Passwort zu kurz (min. 8 Zeichen)" };
  }
  if (getUserByName(username)) return { ok: false, error: "Benutzer existiert bereits" };

  const user: User = {
    id: `user-${randomUUID().slice(0, 12)}`,
    username,
    passwordHash: hashPassword(input.password),
    role: input.role || "viewer",
    tenantId: input.tenantId || "default",
    createdAt: Date.now(),
  };
  db.put<User>("users", user.id, user);
  return { ok: true, user: stripUser(user) };
}

export function getUserByName(username: string): User | undefined {
  const u = username.trim().toLowerCase();
  return db.all<User>("users").map((r) => r.data).find((x) => x.username === u);
}

export function getUserById(id: string): User | undefined {
  return db.get<User>("users", id)?.data;
}

export function listUsers(tenantId?: string): Array<Omit<User, "passwordHash">> {
  return db
    .all<User>("users")
    .map((r) => r.data)
    .filter((u) => !tenantId || u.tenantId === tenantId)
    .map(stripUser);
}

export function setUserRole(id: string, role: Role): boolean {
  const u = getUserById(id);
  if (!u) return false;
  db.put<User>("users", id, { ...u, role });
  return true;
}

export function stripUser(u: User): Omit<User, "passwordHash"> {
  const { passwordHash: _ph, ...rest } = u;
  void _ph;
  return rest;
}

export function countUsers(): number {
  return db.all<User>("users").length;
}

/**
 * Erstellt bei Bedarf einen initialen Admin (erst-Start). Passwort aus
 * FORENSPROTO_ADMIN_PASSWORD oder zufällig (dann in Logs ausgegeben).
 */
export function bootstrapAdmin(): { created: boolean; username?: string; password?: string } {
  if (countUsers() > 0) return { created: false };
  const username = process.env.FORENSPROTO_ADMIN_USER || "admin";
  const password = process.env.FORENSPROTO_ADMIN_PASSWORD || randomBytes(9).toString("base64url");
  createUser({ username, password, role: "admin", tenantId: "default" });
  if (!process.env.FORENSPROTO_ADMIN_PASSWORD) {
    console.log(`[ForensProto Auth] Initialer Admin angelegt: ${username} / ${password}`);
  }
  return { created: true, username, password };
}
