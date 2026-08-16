import { NextRequest, NextResponse } from "next/server";
import {
  attestWalletRecovery,
  verifyAttestation,
  type Attestation,
} from "@/lib/attestation";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * POST /api/recovery/attest
 *
 * Attestieren (Standard):
 *   { subject, password, walletBase64, caseId?, method? }
 *   → prüft, ob das Passwort die Bitcoin-Core-Wallet nachweislich
 *     entschlüsselt, und liefert eine signierte Attestierung.
 *
 * Verifizieren:
 *   { verify: <Attestation> }
 *   → prüft Signatur und Inhalts-Hash einer vorliegenden Attestierung.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  // ── Verifikationsmodus ──
  if (body?.verify) {
    try {
      const result = verifyAttestation(body.verify as Attestation);
      return NextResponse.json({ success: true, ...result });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : "Verifikation fehlgeschlagen" },
        { status: 400 }
      );
    }
  }

  // ── Attestierungsmodus ──
  const subject = typeof body?.subject === "string" ? body.subject : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const walletBase64 = typeof body?.walletBase64 === "string" ? body.walletBase64 : "";
  if (!subject || !password || !walletBase64) {
    return NextResponse.json(
      { success: false, error: "subject, password und walletBase64 erforderlich (oder {verify})" },
      { status: 400 }
    );
  }

  let walletBuffer: Buffer;
  try {
    walletBuffer = Buffer.from(walletBase64, "base64");
  } catch {
    return NextResponse.json({ success: false, error: "walletBase64 ungültig" }, { status: 400 });
  }

  const attestation = attestWalletRecovery({
    subject,
    caseId: typeof body?.caseId === "string" ? body.caseId : undefined,
    walletBuffer,
    password,
    method: typeof body?.method === "string" ? body.method : undefined,
  });

  appendAuditLog({
    level: attestation.record.verification.verified ? "success" : "warning",
    action: "Recovery-Attestierung erstellt",
    message: `${subject}: ${attestation.record.verification.detail} · fp ${attestation.signature.publicKeyFingerprint}`,
    source: "attestation",
    caseId: typeof body?.caseId === "string" ? body.caseId : undefined,
  });

  return NextResponse.json({ success: true, attestation });
}
