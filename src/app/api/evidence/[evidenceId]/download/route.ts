import { NextRequest, NextResponse } from "next/server";
import { getEvidence, getEvidenceBlob, appendCustody } from "@/lib/cases";
import { appendAuditLog } from "@/lib/audit-log";
import { requirePermission, isAuthError } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * Liefert die Original-Rohdatei eines Asservats aus dem Evidence Locker
 * (write-once, content-addressed unter .forensproto/evidence-blobs/
 * abgelegt, siehe lib/cases.ts). Jeder Abruf der Originaldatei ist selbst
 * ein Chain-of-Custody-relevantes Ereignis und wird entsprechend
 * protokolliert – ein Sachverständiger/Gericht kann so nachvollziehen,
 * wer wann Zugriff auf die Originaldaten hatte.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = requirePermission(request, "evidence:verify");
  if (isAuthError(auth)) return auth;

  const { evidenceId } = await context.params;
  const ev = getEvidence(evidenceId);
  if (!ev) return NextResponse.json({ success: false, error: "Asservat nicht gefunden" }, { status: 404 });

  const blob = getEvidenceBlob(evidenceId);
  if (!blob) {
    return NextResponse.json(
      { success: false, error: "Keine Rohdaten im Evidence Locker gespeichert (nur Hash registriert)." },
      { status: 404 }
    );
  }

  appendCustody(evidenceId, {
    actor: auth.username,
    action: "Asservat-Originaldatei exportiert",
    note: `Download durch ${auth.username} (Rolle ${auth.role})`,
  });
  appendAuditLog({
    level: "warning",
    action: "Asservat heruntergeladen",
    message: `${ev.fileName} (${ev.sha256.slice(0, 16)}…) durch ${auth.username} heruntergeladen`,
    source: "evidence",
    caseId: ev.caseId,
    user: auth.username,
  });

  return new NextResponse(new Uint8Array(blob), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(ev.fileName)}"`,
      "Content-Length": String(blob.length),
      "X-Evidence-SHA256": ev.sha256,
    },
  });
}
