import { NextRequest, NextResponse } from "next/server";
import { buildCaseDossier, verifyDossier, renderDossierText, type SignedDossier } from "@/lib/dossier";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/cases/:caseId/dossier            → signiertes Fall-Dossier (JSON)
 * GET /api/cases/:caseId/dossier?format=text → menschenlesbarer Textbericht
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await context.params;
  try {
    const signed = buildCaseDossier(caseId);
    appendAuditLog({
      level: "info",
      action: "Fall-Dossier exportiert",
      message: `Dossier für Fall ${signed.dossier.case.caseNumber} signiert (fp ${signed.signature.publicKeyFingerprint})`,
      source: "dossier",
      caseId,
    });

    const format = request.nextUrl.searchParams.get("format");
    if (format === "text") {
      return new NextResponse(renderDossierText(signed), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="dossier_${signed.dossier.case.caseNumber || caseId}.txt"`,
        },
      });
    }
    return NextResponse.json({ success: true, ...signed });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Dossier-Erstellung fehlgeschlagen" },
      { status: 404 }
    );
  }
}

/**
 * POST /api/cases/:caseId/dossier   Body: { verify: <SignedDossier> }
 * → prüft Signatur und Inhalts-Hash eines vorliegenden Dossiers.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.verify) {
    return NextResponse.json({ success: false, error: "{ verify: <Dossier> } erforderlich" }, { status: 400 });
  }
  try {
    const result = verifyDossier(body.verify as SignedDossier);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Verifikation fehlgeschlagen" },
      { status: 400 }
    );
  }
}
