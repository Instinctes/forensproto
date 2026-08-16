/**
 * Ergebnis-Attestierung (Recovery-Verifikation + Signatur)
 * ========================================================
 * Macht ein Recovery-Ergebnis manipulationssicher belegbar statt nur
 * behauptet: Ein gefundenes Passwort/Geheimnis wird gegen das
 * Original-Asservat gegengeprüft und das Prüfergebnis als kryptografisch
 * signierter Datensatz attestiert.
 *
 * Wichtig — Datenschutz: Das Geheimnis selbst landet NICHT in der
 * Attestierung. Gespeichert werden nur Commitments (SHA-256 des Asservat-
 * Materials und des Geheimnisses), das Prüfschema und das Ergebnis. Wer die
 * Attestierung besitzt, kann die Aussage „dieses Geheimnis entschlüsselt
 * nachweislich dieses Asservat" unabhängig verifizieren, ohne das Geheimnis
 * zu kennen.
 *
 * Signatur: Ed25519 über die kanonisierte JSON-Serialisierung (siehe
 * report-signer.ts). Die Verifikation ist auch durch Dritte möglich, weil
 * der Public Key Teil der Signatur ist.
 */

import { createHash } from "crypto";
import { signData, verifyData, type Signature } from "./report-signer";
import { dumpEncryptedWallet } from "./wallet-dump";

function sha256(data: Buffer | string): string {
  return createHash("sha256")
    .update(Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8"))
    .digest("hex");
}

export interface AttestationRecord {
  version: "1";
  kind: "recovery-attestation";
  /** z. B. Wallet-Name oder Asservat-ID */
  subject: string;
  /** Verfahren, z. B. "Bitcoin Core wallet.dat (mkey AES-256-CBC / PBKDF2-SHA512)" */
  method: string;
  caseId?: string;
  verification: {
    verified: boolean;
    /** Beschreibung des Prüfschemas */
    scheme: string;
    /** menschenlesbares Prüfdetail */
    detail: string;
    verifiedCount?: number;
    totalCount?: number;
  };
  /** SHA-256 des Asservat-/Hash-Materials (Commitment, kein Klartext) */
  inputDigestSha256: string;
  /** SHA-256 des gefundenen Geheimnisses (Commitment, kein Klartext) */
  secretCommitmentSha256: string;
  attestedAt: string;
}

export interface Attestation {
  record: AttestationRecord;
  signature: Signature;
}

/**
 * Deterministische Serialisierung für Signatur/Verifikation. Die Reihenfolge
 * der Felder wird über eine feste Schlüsselliste erzwungen, damit Sign- und
 * Verify-Zeitpunkt exakt denselben String hashen — unabhängig davon, wie der
 * Datensatz erzeugt oder wieder eingelesen wurde.
 */
function canonical(record: AttestationRecord): string {
  const v = record.verification;
  return JSON.stringify([
    record.version,
    record.kind,
    record.subject,
    record.method,
    record.caseId ?? "",
    [v.verified, v.scheme, v.detail, v.verifiedCount ?? null, v.totalCount ?? null],
    record.inputDigestSha256,
    record.secretCommitmentSha256,
    record.attestedAt,
  ]);
}

/** Baut und signiert eine Attestierung aus einem bereits geprüften Ergebnis. */
export function buildAttestation(input: {
  subject: string;
  method: string;
  caseId?: string;
  verified: boolean;
  scheme: string;
  detail: string;
  verifiedCount?: number;
  totalCount?: number;
  inputMaterial: Buffer | string;
  secret: string;
}): Attestation {
  const record: AttestationRecord = {
    version: "1",
    kind: "recovery-attestation",
    subject: input.subject,
    method: input.method,
    caseId: input.caseId,
    verification: {
      verified: input.verified,
      scheme: input.scheme,
      detail: input.detail,
      verifiedCount: input.verifiedCount,
      totalCount: input.totalCount,
    },
    inputDigestSha256: sha256(input.inputMaterial),
    secretCommitmentSha256: sha256(input.secret),
    attestedAt: new Date().toISOString(),
  };
  return { record, signature: signData(canonical(record)) };
}

/** Verifiziert eine Attestierung (Signatur + Inhalts-Hash). */
export function verifyAttestation(att: Attestation): { valid: boolean; reason?: string } {
  const res = verifyData(canonical(att.record), att.signature);
  return { valid: res.valid, reason: res.reason };
}

/**
 * Attestiert die Wiederherstellung einer Bitcoin-Core-Wallet: prüft, ob das
 * Passwort die Wallet nachweislich entschlüsselt (mkey → AES-CBC →
 * secp256k1-Public-Key-Abgleich, siehe wallet-dump.ts), und signiert das
 * Ergebnis. Das Passwort selbst wird nur als Commitment gehasht.
 */
export function attestWalletRecovery(input: {
  subject: string;
  caseId?: string;
  walletBuffer: Buffer;
  password: string;
  method?: string;
}): Attestation {
  const dump = dumpEncryptedWallet(input.walletBuffer, input.password);
  const verified = dump.ok && dump.masterKeyDecrypted && dump.verifiedCount > 0;
  return buildAttestation({
    subject: input.subject,
    caseId: input.caseId,
    method: input.method || "Bitcoin Core wallet.dat (mkey AES-256-CBC, PBKDF2-SHA512)",
    verified,
    scheme: "Bitcoin-Core-mkey → AES-CBC-Entschlüsselung + secp256k1-Public-Key-Abgleich",
    detail: verified
      ? `${dump.verifiedCount}/${dump.totalCkeys} ckeys entschlüsselt und über den Public Key verifiziert`
      : dump.error || "Passwort entschlüsselt die Wallet NICHT",
    verifiedCount: dump.verifiedCount,
    totalCount: dump.totalCkeys,
    inputMaterial: input.walletBuffer,
    secret: input.password,
  });
}
