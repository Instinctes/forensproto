import { NextRequest, NextResponse } from "next/server";
import { createUser, listUsers, type Role } from "@/lib/auth/users";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "admin:users");
  if (isAuthError(auth)) return auth;
  // Admins sehen Benutzer ihres Mandanten (System-Admin: alle)
  const tenant = auth.via === "disabled" ? undefined : auth.tenantId;
  return NextResponse.json({ success: true, users: listUsers(tenant) });
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "admin:users");
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const role = (["admin", "investigator", "viewer"] as Role[]).includes(body.role) ? body.role : "viewer";
    const tenantId = body.tenantId || auth.tenantId;
    const result = createUser({ username: body.username, password: body.password, role, tenantId });
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    appendAuditLog({
      level: "info",
      action: "Benutzer angelegt",
      message: `${result.user!.username} (${result.user!.role}) in Mandant ${tenantId}`,
      source: "admin/users",
      user: auth.username,
    });
    return NextResponse.json({ success: true, user: result.user });
  } catch {
    return NextResponse.json({ success: false, error: "Anlegen fehlgeschlagen" }, { status: 500 });
  }
}
