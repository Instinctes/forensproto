import { NextRequest, NextResponse } from "next/server";
import { createTenant, listTenants } from "@/lib/auth/tenant";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "admin:tenants");
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ success: true, tenants: listTenants() });
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "admin:tenants");
  if (isAuthError(auth)) return auth;
  const body = await request.json().catch(() => ({}));
  if (!body.name) return NextResponse.json({ success: false, error: "Name erforderlich" }, { status: 400 });
  const t = createTenant(body.name);
  appendAuditLog({ level: "info", action: "Mandant angelegt", message: `${t.name} (${t.id})`, source: "admin/tenants", user: auth.username });
  return NextResponse.json({ success: true, tenant: t });
}
