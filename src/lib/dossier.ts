/**
 * Signiertes Fall-Dossier (Ein-Klick-Export)
 * ==========================================
 * Bündelt alles, was ein gerichtsfestes Übergabedokument braucht, in einen
 * einzigen, kryptografisch signierten und unabhängig prüfbaren Datensatz:
 *
 *   • Fall-Metadaten (Nummer, Ermittler, Status, ggf. Nachlass-Kontext)
 *   • jedes Asservat mit Integritätsprüfung (SHA-256-Abgleich) und
 *     vollständiger, hash-verketteter Chain-of-Custody
 *   • die Integritätsaussage der globalen Audit-Log-Hashkette
 *   • optional beigelegte Ergebnis-Attestierungen (re-verifiziert)
 *
 * Das Dossier wird über Ed25519 signiert (siehe report-signer.ts) und kann
 * durch Dritte verifiziert werden — die Signatur trägt den Public Key.
 * Aus dem Dossier lässt sich zusätzlich ein menschenlesbarer Textbericht
 * rendern.
 */

import {
  getCase,
  getEvidenceForCase,
  getCustody,
  verifyEvidence,
  verifyCustodyChain,
  type CaseRecord,
  type CustodyEvent,
} from "./cases";
import { getAuditLogs, verifyChain, type LogEntry } from "./audit-log";
import { signData, verifyData, type Signature } from "./report-signer";
import { verifyAttestation, type Attestation } from "./attestation";

export interface DossierEvidence {
  id: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  md5: string;
  source: string;
  importedAt: number;
  blobStored: boolean;
  integrity: { match: boolean; source: string };
  custody: { valid: boolean; totalEvents: number };
  custodyEvents: CustodyEvent[];
}

export interface CaseDossier {
  version: "1";
  kind: "case-dossier";
  generatedAt: string;
  case: Pick<
    CaseRecord,
    "id" | "caseNumber" | "name" | "description" | "investigator" | "status" | "kind" | "beneficiary" | "createdAt"
  >;
  evidence: DossierEvidence[];
  auditLog: { verified: boolean; totalEntries: number; entries: LogEntry[] };
  attestations: Array<{ record: Attestation["record"]; signatureFingerprint: string; valid: boolean }>;
  summary: {
    evidenceCount: number;
    allEvidenceIntact: boolean;
    allCustodyIntact: boolean;
    auditIntact: boolean;
  };
}

export interface SignedDossier {
  dossier: CaseDossier;
  signature: Signature;
}

/** Deterministische Serialisierung fürs Signieren/Verifizieren. */
function canonical(d: CaseDossier): string {
  return JSON.stringify(d);
}

/** Baut und signiert das Fall-Dossier. Wirft, wenn der Fall nicht existiert. */
export function buildCaseDossier(caseId: string, attestations: Attestation[] = []): SignedDossier {
  const c = getCase(caseId);
  if (!c) throw new Error(`Fall nicht gefunden: ${caseId}`);

  const evidenceRecords = getEvidenceForCase(caseId);
  const evidence: DossierEvidence[] = evidenceRecords.map((ev) => {
    const integ = verifyEvidence(ev.id);
    const custodyChain = verifyCustodyChain(ev.id);
    return {
      id: ev.id,
      fileName: ev.fileName,
      fileSize: ev.fileSize,
      sha256: ev.sha256,
      md5: ev.md5,
      source: ev.source,
      importedAt: ev.importedAt,
      blobStored: ev.blobStored,
      integrity: { match: integ.match, source: integ.source },
      custody: { valid: custodyChain.valid, totalEvents: custodyChain.totalEvents },
      custodyEvents: getCustody(ev.id),
    };
  });

  const auditEntries = getAuditLogs({ caseId });
  const chain = verifyChain();

  const attest = attestations.map((a) => ({
    record: a.record,
    signatureFingerprint: a.signature.publicKeyFingerprint,
    valid: verifyAttestation(a).valid,
  }));

  const allEvidenceIntact = evidence.every((e) => e.integrity.match || !e.blobStored);
  const allCustodyIntact = evidence.every((e) => e.custody.valid);

  const dossier: CaseDossier = {
    version: "1",
    kind: "case-dossier",
    generatedAt: new Date().toISOString(),
    case: {
      id: c.id,
      caseNumber: c.caseNumber,
      name: c.name,
      description: c.description,
      investigator: c.investigator,
      status: c.status,
      kind: c.kind,
      beneficiary: c.beneficiary,
      createdAt: c.createdAt,
    },
    evidence,
    auditLog: { verified: chain.valid, totalEntries: chain.totalEntries, entries: auditEntries },
    attestations: attest,
    summary: {
      evidenceCount: evidence.length,
      allEvidenceIntact,
      allCustodyIntact,
      auditIntact: chain.valid,
    },
  };

  return { dossier, signature: signData(canonical(dossier)) };
}

/** Verifiziert Signatur und Inhalts-Hash eines Dossiers. */
export function verifyDossier(sd: SignedDossier): { valid: boolean; reason?: string } {
  const res = verifyData(canonical(sd.dossier), sd.signature);
  return { valid: res.valid, reason: res.reason };
}

/** Rendert ein Dossier als menschenlesbaren Textbericht. */
export function renderDossierText(sd: SignedDossier): string {
  const d = sd.dossier;
  const L: string[] = [];
  const ok = (b: boolean) => (b ? "OK" : "FEHLER");
  L.push("FORENSPROTO — FALL-DOSSIER");
  L.push("=".repeat(60));
  L.push(`Fall:         ${d.case.caseNumber} — ${d.case.name}`);
  L.push(`Ermittler:    ${d.case.investigator}`);
  L.push(`Status:       ${d.case.status}`);
  if (d.case.kind) L.push(`Fallart:      ${d.case.kind}`);
  if (d.case.beneficiary)
    L.push(`Begünstigte:  ${d.case.beneficiary.name} (${d.case.beneficiary.relationship}) — ${d.case.beneficiary.legalBasis}`);
  L.push(`Erstellt:     ${new Date(d.generatedAt).toLocaleString("de-DE")}`);
  L.push("");
  L.push("ZUSAMMENFASSUNG");
  L.push("-".repeat(60));
  L.push(`Asservate:              ${d.summary.evidenceCount}`);
  L.push(`Asservat-Integrität:    ${ok(d.summary.allEvidenceIntact)}`);
  L.push(`Chain-of-Custody:       ${ok(d.summary.allCustodyIntact)}`);
  L.push(`Audit-Log-Hashkette:    ${ok(d.summary.auditIntact)} (${d.auditLog.totalEntries} Einträge)`);
  L.push("");
  L.push("ASSERVATE");
  L.push("-".repeat(60));
  for (const e of d.evidence) {
    L.push(`• ${e.fileName}  (${e.fileSize} Bytes)`);
    L.push(`  SHA-256:   ${e.sha256}`);
    L.push(`  Integrität: ${ok(e.integrity.match)} [${e.integrity.source}] · Custody: ${ok(e.custody.valid)} (${e.custody.totalEvents} Ereignisse)`);
  }
  if (d.attestations.length) {
    L.push("");
    L.push("ERGEBNIS-ATTESTIERUNGEN");
    L.push("-".repeat(60));
    for (const a of d.attestations) {
      L.push(`• ${a.record.subject}: ${a.record.verification.detail} — Signatur ${ok(a.valid)}`);
    }
  }
  L.push("");
  L.push("-".repeat(60));
  L.push(`Signatur (Ed25519):  ${sd.signature.publicKeyFingerprint}`);
  L.push(`Inhalts-Hash:        ${sd.signature.contentSha256}`);
  L.push(`Signiert am:         ${new Date(sd.signature.signedAt).toLocaleString("de-DE")}`);
  L.push("");
  L.push("Unabhängig prüfbar über /api/cases/<id>/dossier (POST { verify }).");
  return L.join("\n");
}
