import { NextRequest, NextResponse } from "next/server";
import { buildCaseReport } from "@/lib/report";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const format = request.nextUrl.searchParams.get("format") || "pdf";

  const report = buildCaseReport(caseId);
  if (!report) return NextResponse.json({ success: false, error: "Fall nicht gefunden" }, { status: 404 });

  appendAuditLog({
    level: "info",
    action: "Forensik-Bericht erzeugt",
    message: `Signierter ${format.toUpperCase()}-Bericht für Fall ${caseId} (Fingerprint ${report.signature.publicKeyFingerprint})`,
    source: "report",
    caseId,
  });

  if (format === "json") {
    // Verifizierbares Paket: kanonische Daten + Signatur
    return NextResponse.json({
      success: true,
      manifest: report.manifest,
      canonical: report.canonical,
      signature: report.signature,
    });
  }

  const fileName = `forensproto_bericht_${caseId}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(report.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
