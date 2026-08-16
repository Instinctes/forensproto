import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { getAuthorization, revokeAuthorization, effectiveStatus } from "@/lib/authorization";

export const dynamic = "force-dynamic";

/** Einzelne Autorisierung inkl. effektivem Status. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const rec = getAuthorization(id);
  if (!rec) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ success: true, authorization: rec, effectiveStatus: effectiveStatus(rec) });
}

/** Widerruft eine Autorisierung. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requirePermission(request, "case:edit");
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let reason = "(kein Grund angegeben)";
  try {
    const body = await request.json();
    if (body && typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim();
  } catch {
    /* Body optional */
  }

  const rec = revokeAuthorization(id, auth.username, reason);
  if (!rec) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ success: true, authorization: rec });
}
