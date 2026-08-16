import { NextRequest, NextResponse } from "next/server";
import { getCase, updateCase, getEvidenceForCase } from "@/lib/cases";
import { getAuditLogs } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const rec = getCase(caseId);
  if (!rec) return NextResponse.json({ success: false, error: "Fall nicht gefunden" }, { status: 404 });
  return NextResponse.json({
    success: true,
    case: rec,
    evidence: getEvidenceForCase(caseId),
    audit: getAuditLogs({ caseId }),
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  try {
    const body = await request.json();
    const updated = updateCase(caseId, body);
    if (!updated) return NextResponse.json({ success: false, error: "Fall nicht gefunden" }, { status: 404 });
    return NextResponse.json({ success: true, case: updated });
  } catch {
    return NextResponse.json({ success: false, error: "Aktualisierung fehlgeschlagen" }, { status: 500 });
  }
}
