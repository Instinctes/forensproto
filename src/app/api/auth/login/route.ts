import { NextRequest, NextResponse } from "next/server";
import { getUserByName, verifyPasswordHash } from "@/lib/auth/users";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "local";
  const rl = checkRateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Login-Versuche" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  try {
    const { username, password } = await request.json();
    const user = username ? getUserByName(username) : undefined;
    const valid = user && !user.disabled && verifyPasswordHash(password || "", user.passwordHash);

    if (!valid) {
      appendAuditLog({ level: "warning", action: "Login fehlgeschlagen", message: `Benutzer "${username}"`, source: "auth", user: String(username || "?") });
      return NextResponse.json({ error: "Ungültige Anmeldedaten" }, { status: 401 });
    }

    const token = createSession(user!.id);
    appendAuditLog({ level: "success", action: "Login", message: `Benutzer "${user!.username}" (${user!.role})`, source: "auth", user: user!.username, caseId: undefined });

    const res = NextResponse.json({
      success: true,
      user: { id: user!.id, username: user!.username, role: user!.role, tenantId: user!.tenantId },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 500 });
  }
}
