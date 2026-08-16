import { NextRequest, NextResponse } from "next/server";
import { getEvidence, getCustody, appendCustody, verifyCustodyChain } from "@/lib/cases";
import { requirePermission, isAuthError } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  const { evidenceId } = await context.params;
  if (!getEvidence(evidenceId)) {
    return NextResponse.json({ success: false, error: "Asservat nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    custody: getCustody(evidenceId),
    verification: verifyCustodyChain(evidenceId),
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = requirePermission(request, "evidence:import");
  if (isAuthError(auth)) return auth;

  const { evidenceId } = await context.params;
  if (!getEvidence(evidenceId)) {
    return NextResponse.json({ success: false, error: "Asservat nicht gefunden" }, { status: 404 });
  }
  try {
    const body = await request.json();
    if (!body.action) return NextResponse.json({ success: false, error: "action erforderlich" }, { status: 400 });
    const evt = appendCustody(evidenceId, {
      actor: body.actor || auth.username,
      action: body.action,
      note: body.note,
    });
    return NextResponse.json({ success: true, event: evt });
  } catch {
    return NextResponse.json({ success: false, error: "Custody-Eintrag fehlgeschlagen" }, { status: 500 });
  }
}
