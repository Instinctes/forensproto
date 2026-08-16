/**
 * Forensik-Bericht & Timeline-Generator
 * =====================================
 * Stellt aus Fall, Asservaten, Chain-of-Custody, Recovery-Jobs und
 * Audit-Trail ein gerichtsfestes, kryptographisch signiertes
 * Berichtspaket zusammen (Manifest-JSON + PDF) und rekonstruiert die
 * chronologische Fall-Timeline.
 */

import { createPdf, type PdfLine } from "./pdf-writer";
import { signData, type Signature } from "./report-signer";
import {
  getCase,
  getEvidenceForCase,
  getCustody,
  verifyCustodyChain,
  type EvidenceRecord,
  type CustodyEvent,
} from "./cases";
import { getAuditLogs, verifyChain, type LogEntry } from "./audit-log";
import { getAllJobs, type Job } from "./job-store";

// ---------------------------------------------------------------------------
// Kanonische, deterministische JSON-Serialisierung (stabile Schlüssel)
// ---------------------------------------------------------------------------
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export interface ReportManifest {
  reportVersion: string;
  generatedAt: string;
  case: ReturnType<typeof getCase>;
  evidence: Array<{
    record: EvidenceRecord;
    custody: CustodyEvent[];
    custodyVerification: ReturnType<typeof verifyCustodyChain>;
  }>;
  jobs: Job[];
  audit: LogEntry[];
  integrity: {
    auditChain: ReturnType<typeof verifyChain>;
    allCustodyChainsValid: boolean;
  };
}

export interface SignedReport {
  manifest: ReportManifest;
  canonical: string;
  signature: Signature;
  pdf: Buffer;
}

function fmt(ts: number | string): string {
  return new Date(ts).toLocaleString("de-DE");
}

export function buildCaseReportData(caseId: string): ReportManifest | null {
  const rec = getCase(caseId);
  if (!rec) return null;

  const evidenceRecords = getEvidenceForCase(caseId);
  const evidence = evidenceRecords.map((e) => ({
    record: e,
    custody: getCustody(e.id),
    custodyVerification: verifyCustodyChain(e.id),
  }));
  const allCustodyChainsValid = evidence.every((e) => e.custodyVerification.valid);

  const jobs = getAllJobs().filter((j) => j.caseId === caseId);
  const audit = getAuditLogs({ caseId });

  return {
    reportVersion: "1.0",
    generatedAt: new Date().toISOString(),
    case: rec,
    evidence,
    jobs,
    audit,
    integrity: { auditChain: verifyChain(), allCustodyChainsValid },
  };
}

/** Baut die PDF-Zeilen aus dem Manifest + Signaturblock. */
function renderPdfLines(m: ReportManifest, sig: Signature): PdfLine[] {
  const L: PdfLine[] = [];
  const c = m.case!;
  L.push({ type: "title", text: "ForensProto – Forensischer Abschlussbericht" });
  L.push({ type: "small", text: `Erstellt: ${fmt(m.generatedAt)} · Berichtsversion ${m.reportVersion}` });
  L.push({ type: "sep" });

  L.push({ type: "h2", text: "1. Fallinformationen" });
  L.push({ type: "text", text: `Fall: ${c.name} (${c.caseNumber})` });
  L.push({ type: "text", text: `Ermittler: ${c.investigator} · Status: ${c.status}` });
  L.push({ type: "text", text: `Angelegt: ${fmt(c.createdAt)}` });
  if (c.description) L.push({ type: "text", text: `Beschreibung: ${c.description}` });
  L.push({ type: "spacer" });

  L.push({ type: "h2", text: `2. Asservate (${m.evidence.length})` });
  if (m.evidence.length === 0) L.push({ type: "text", text: "Keine Asservate erfasst." });
  m.evidence.forEach((ev, i) => {
    const r = ev.record;
    L.push({ type: "text", text: `2.${i + 1}  ${r.fileName}  (${r.fileSize} Bytes, Quelle: ${r.source})` });
    L.push({ type: "mono", text: `      SHA-256: ${r.sha256}` });
    L.push({ type: "mono", text: `      MD5:     ${r.md5}` });
    L.push({ type: "small", text: `      Importiert: ${fmt(r.importedAt)} · Custody-Kette: ${ev.custodyVerification.valid ? "INTAKT" : "GEBROCHEN"} (${ev.custody.length} Ereignisse)` });
    ev.custody.forEach((co) => {
      L.push({ type: "small", text: `        • ${fmt(co.timestamp)} — ${co.action} [${co.actor}] ${co.note}` });
    });
    L.push({ type: "spacer" });
  });

  L.push({ type: "h2", text: `3. Recovery-Jobs (${m.jobs.length})` });
  if (m.jobs.length === 0) L.push({ type: "text", text: "Keine Jobs diesem Fall zugeordnet." });
  m.jobs.forEach((j) => {
    L.push({ type: "text", text: `• ${j.walletName} — ${j.method} (Modus ${j.hashcatMode}) · Status: ${j.status}` });
    if (j.recoveredPassword) L.push({ type: "mono", text: `      Ergebnis: ${j.recoveredPassword}` });
  });
  L.push({ type: "spacer" });

  L.push({ type: "h2", text: `4. Audit-Trail (${m.audit.length} Einträge)` });
  L.push({ type: "small", text: `Hash-Chain global: ${m.integrity.auditChain.valid ? "INTAKT" : "GEBROCHEN"} (${m.integrity.auditChain.totalEntries} Einträge gesamt)` });
  m.audit.slice(0, 60).forEach((a) => {
    L.push({ type: "small", text: `  ${fmt(a.timestamp)} [${a.level}] ${a.action} — ${a.message}` });
  });
  L.push({ type: "sep" });

  L.push({ type: "h2", text: "5. Integrität & digitale Signatur" });
  L.push({ type: "text", text: `Audit-Chain: ${m.integrity.auditChain.valid ? "gültig" : "UNGÜLTIG"} · Custody-Ketten: ${m.integrity.allCustodyChainsValid ? "alle gültig" : "MINDESTENS EINE GEBROCHEN"}` });
  L.push({ type: "text", text: `Signaturverfahren: ${sig.algorithm}` });
  L.push({ type: "text", text: `Schlüssel-Fingerprint: ${sig.publicKeyFingerprint}` });
  L.push({ type: "mono", text: `Inhalts-SHA-256: ${sig.contentSha256}` });
  L.push({ type: "mono", text: `Signatur (Base64): ${sig.signatureB64}` });
  L.push({ type: "small", text: `Signiert am: ${fmt(sig.signedAt)}` });
  L.push({ type: "spacer" });
  L.push({ type: "small", text: "Verifikation: Das zugehörige JSON-Manifest kann über POST /api/reports/verify unabhängig geprüft werden." });

  return L;
}

export function buildCaseReport(caseId: string): SignedReport | null {
  const manifest = buildCaseReportData(caseId);
  if (!manifest) return null;
  const canonical = stableStringify(manifest);
  const signature = signData(canonical);
  const pdf = createPdf(renderPdfLines(manifest, signature));
  return { manifest, canonical, signature, pdf };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
export interface TimelineEntry {
  timestamp: string;
  epoch: number;
  type: "audit" | "custody" | "job";
  actor: string;
  action: string;
  detail: string;
}

export function buildTimeline(caseId: string): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const a of getAuditLogs({ caseId })) {
    entries.push({
      timestamp: a.timestamp,
      epoch: new Date(a.timestamp).getTime(),
      type: "audit",
      actor: a.user,
      action: a.action,
      detail: a.message,
    });
  }

  for (const ev of getEvidenceForCase(caseId)) {
    for (const co of getCustody(ev.id)) {
      entries.push({
        timestamp: co.timestamp,
        epoch: new Date(co.timestamp).getTime(),
        type: "custody",
        actor: co.actor,
        action: co.action,
        detail: `${ev.fileName}: ${co.note}`,
      });
    }
  }

  for (const j of getAllJobs().filter((x) => x.caseId === caseId)) {
    entries.push({
      timestamp: new Date(j.startTime).toISOString(),
      epoch: j.startTime,
      type: "job",
      actor: "system",
      action: `Recovery-Job (${j.status})`,
      detail: `${j.walletName} · ${j.method} · Modus ${j.hashcatMode}${j.recoveredPassword ? ` · Fund: ${j.recoveredPassword}` : ""}`,
    });
  }

  return entries.sort((a, b) => a.epoch - b.epoch);
}

export function timelineToCsv(entries: TimelineEntry[]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [
    "Zeitstempel,Typ,Akteur,Aktion,Detail",
    ...entries.map((e) => [e.timestamp, e.type, e.actor, e.action, e.detail].map(esc).join(",")),
  ];
  return rows.join("\n");
}
