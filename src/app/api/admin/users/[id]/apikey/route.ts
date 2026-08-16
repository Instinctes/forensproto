import { NextRequest, NextResponse } from "next/server";
import { createApiKey, listApiKeys } from "@/lib/auth/apikeys";
import { getUserById } from "@/lib/auth/users";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "admin:users");
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  return NextResponse.json({ success: true, keys: listApiKeys(id) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "admin:users");
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  if (!getUserById(id)) return NextResponse.json({ success: false, error: "Benutzer nicht gefunden" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { record, plaintext } = createApiKey(id, body.label || "default");
  appendAuditLog({ level: "warning", action: "API-Key erzeugt", message: `Key ${record.id} für Benutzer ${id}`, source: "admin/users", user: auth.username });
  // Klartext nur EINMAL zurückgeben
  return NextResponse.json({ success: true, apiKey: plaintext, record });
}
