import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import {
  createAuthorization,
  listAuthorizations,
  isLegalBasis,
  LEGAL_BASIS_LABELS,
} from "@/lib/authorization";

export const dynamic = "force-dynamic";

/** Liste der Autorisierungen (optional nach Fall gefiltert). */
export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  const caseId = request.nextUrl.searchParams.get("caseId") || undefined;
  const rows = listAuthorizations({ caseId, tenantId: auth.tenantId === "default" ? undefined : auth.tenantId });
  return NextResponse.json({
    success: true,
    legalBases: LEGAL_BASIS_LABELS,
    authorizations: rows,
  });
}

/** Erteilt eine neue Fallautorisierung (mit Sanktions-Screening). */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:edit");
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { caseId, legalBasis, reference, subject, attestation, subjectConsent, expiresAt, screenNames, screenAddresses } = body;

    if (!isLegalBasis(legalBasis)) {
      return NextResponse.json({ error: "Ungültige oder fehlende rechtliche Grundlage (legalBasis)" }, { status: 400 });
    }
    if (typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json({ error: "Betroffenes Subjekt (subject) erforderlich" }, { status: 400 });
    }
    if (typeof attestation !== "string" || !attestation.trim()) {
      return NextResponse.json({ error: "Attestierung (attestation) erforderlich" }, { status: 400 });
    }

    const rec = createAuthorization({
      caseId: typeof caseId === "string" ? caseId : undefined,
      tenantId: auth.tenantId,
      legalBasis,
      reference: typeof reference === "string" ? reference : "",
      subject,
      authorizedBy: auth.userId,
      authorizedByName: auth.username,
      attestation,
      subjectConsent: !!subjectConsent,
      expiresAt: typeof expiresAt === "number" ? expiresAt : null,
      screenNames: Array.isArray(screenNames) ? screenNames.filter((s) => typeof s === "string") : undefined,
      screenAddresses: Array.isArray(screenAddresses) ? screenAddresses.filter((s) => typeof s === "string") : undefined,
    });

    return NextResponse.json({ success: true, authorization: rec, sanctionsClear: rec.sanctions.clear }, { status: 201 });
  } catch (e) {
    console.error("[compliance/authorizations] POST fehlgeschlagen:", e);
    return NextResponse.json({ error: "Autorisierung konnte nicht erstellt werden" }, { status: 500 });
  }
}
