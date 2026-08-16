import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { signedValidationReport, canonicalReport, type ValidationReport } from "@/lib/validation";
import { createPdf, type PdfLine } from "@/lib/pdf-writer";
import type { Signature } from "@/lib/report-signer";

export const dynamic = "force-dynamic";

/**
 * Gerichtsfeste Validierung.
 *   GET                      → signierter Validierungs-Report (JSON)
 *   GET ?format=pdf          → signierter Validierungs-Report (PDF-Download)
 *
 * Der Report prüft die Krypto-Kernfunktionen gegen offizielle Testvektoren
 * (BIP-32/39/143/173, secp256k1, WIF, ECDSA-Nonce-Reuse) und weist eine
 * Fehlerrate aus (Daubert/NIST-CFTT-Stil). Die Ed25519-Signatur erlaubt die
 * unabhängige Verifikation des Reports über /api/reports/verify.
 */
export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "audit:view");
  if (isAuthError(auth)) return auth;

  const { report, signature } = signedValidationReport();

  if (request.nextUrl.searchParams.get("format") === "pdf") {
    const pdf = createPdf(buildPdfLines(report, signature));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="forensproto_validation_${Date.now()}.pdf"`,
      },
    });
  }

  return NextResponse.json({ success: true, report, signature, canonical: canonicalReport(report) });
}

function buildPdfLines(report: ValidationReport, sig: Signature): PdfLine[] {
  const l: PdfLine[] = [];
  const pct = (report.summary.errorRate * 100).toFixed(2);

  l.push({ type: "title", text: "ForensProto — Validierungsbericht" });
  l.push({ type: "small", text: "Tool-Validierung im Stil NIST CFTT / Daubert-Standard — gegen offizielle Testvektoren" });
  l.push({ type: "sep" });

  l.push({ type: "h2", text: "Methodik" });
  l.push({
    type: "text",
    text:
      "Die kryptografischen Kernfunktionen werden deterministisch gegen öffentliche, " +
      "standardisierte Testvektoren geprüft. Für jeden Fall wird Soll- und Ist-Wert " +
      "dokumentiert; die Gesamt-Fehlerrate ergibt sich aus fehlgeschlagenen / gesamten Fällen. " +
      "Der Report ist reproduzierbar und Ed25519-signiert (unabhängig prüfbar).",
  });
  l.push({ type: "spacer" });

  l.push({ type: "h2", text: "Kennzahlen" });
  l.push({ type: "text", text: `Werkzeug: ${report.tool} v${report.version}  ·  Laufzeit: Node ${report.nodeVersion}` });
  l.push({ type: "text", text: `Erstellt: ${report.generatedAt}` });
  l.push({ type: "text", text: `Fälle gesamt: ${report.summary.total}  ·  bestanden: ${report.summary.passed}  ·  fehlgeschlagen: ${report.summary.failed}` });
  l.push({ type: "text", text: `Fehlerrate: ${pct} %  ·  Gesamturteil: ${report.summary.valid ? "VALIDIERT (0 Fehler)" : "NICHT VALIDIERT"}` });
  l.push({ type: "spacer" });

  l.push({ type: "h2", text: "Ergebnisse nach Kategorie" });
  for (const [cat, b] of Object.entries(report.summary.byCategory)) {
    l.push({ type: "text", text: `• ${cat}: ${b.passed}/${b.total} bestanden` });
  }
  l.push({ type: "spacer" });

  l.push({ type: "h2", text: "Einzelfälle (Soll / Ist)" });
  for (const c of report.cases) {
    l.push({ type: "text", text: `[${c.pass ? "PASS" : "FAIL"}] ${c.id} — ${c.standard}` });
    l.push({ type: "mono", text: `soll: ${c.expected}` });
    l.push({ type: "mono", text: `ist : ${c.actual}` });
    if (c.error) l.push({ type: "mono", text: `err : ${c.error}` });
    l.push({ type: "spacer" });
  }

  l.push({ type: "sep" });
  l.push({ type: "h2", text: "Digitale Signatur (Ed25519)" });
  l.push({ type: "mono", text: `Fingerprint:   ${sig.publicKeyFingerprint}` });
  l.push({ type: "mono", text: `SHA-256:       ${sig.contentSha256}` });
  l.push({ type: "mono", text: `Signatur:      ${sig.signatureB64}` });
  l.push({ type: "mono", text: `Signiert:      ${sig.signedAt}` });
  l.push({ type: "small", text: "Verifikation: POST /api/reports/verify mit { canonical, signature }." });

  return l;
}
