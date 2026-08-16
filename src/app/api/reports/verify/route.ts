import { NextRequest, NextResponse } from "next/server";
import { verifyData, type Signature } from "@/lib/report-signer";
import { stableStringify, type ReportManifest } from "@/lib/report";

export const dynamic = "force-dynamic";

/**
 * Verifiziert ein exportiertes Berichtspaket unabhängig:
 * Body = { manifest?, canonical?, signature }.
 * Wird `manifest` übergeben, wird die kanonische Form neu berechnet und
 * mit der mitgelieferten verglichen (Schutz gegen Manifest-Manipulation).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const signature = body.signature as Signature | undefined;
    if (!signature?.signatureB64 || !signature.publicKeyPem) {
      return NextResponse.json({ success: false, error: "Signatur fehlt/unvollständig" }, { status: 400 });
    }

    let canonical: string | undefined = typeof body.canonical === "string" ? body.canonical : undefined;
    let recomputedMatches: boolean | undefined;

    if (body.manifest) {
      const recomputed = stableStringify(body.manifest as ReportManifest);
      recomputedMatches = canonical ? recomputed === canonical : true;
      canonical = recomputed;
    }
    if (!canonical) {
      return NextResponse.json({ success: false, error: "Weder canonical noch manifest übergeben" }, { status: 400 });
    }

    const result = verifyData(canonical, signature);
    return NextResponse.json({
      success: true,
      valid: result.valid && recomputedMatches !== false,
      signatureValid: result.signatureValid,
      contentSha256Match: result.contentSha256Match,
      manifestCanonicalMatch: recomputedMatches,
      fingerprint: signature.publicKeyFingerprint,
      reason: recomputedMatches === false ? "Manifest weicht von signierter kanonischer Form ab" : result.reason,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Verifikation fehlgeschlagen" }, { status: 500 });
  }
}
