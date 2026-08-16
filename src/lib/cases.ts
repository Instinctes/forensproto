/**
 * Case Management + Evidence Locker + Chain of Custody
 * ====================================================
 * - Fälle (cases) bündeln Asservate, Jobs und Audit-Einträge.
 * - Asservate (evidence) werden beim Import mit SHA-256 und MD5
 *   fingerprinted (Integritätsnachweis).
 * - Jede Asservat-Aktion erzeugt einen hash-verketteten
 *   Chain-of-Custody-Eintrag (wer / wann / was), tamper-evident.
 */

import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import { db } from "./db";
import { appendAuditLog } from "./audit-log";
import { getForensprotoStateDir } from "./data-dir";

const GENESIS = "0".repeat(64);

// ---------------------------------------------------------------------------
// Evidence-Blob-Speicher (Rohdaten-Ablage im Evidence Locker)
// ---------------------------------------------------------------------------
// Bislang wurden nur SHA-256/MD5 der Asservat-Datei registriert, nicht die
// Datei selbst — eine erneute Verifikation musste die Originaldatei von
// außen erneut bereitstellen. Das widerspricht dem Anspruch eines echten
// Beweismittel-Repositories. Ab jetzt wird die Rohdatei zusätzlich
// content-addressed (Dateiname = SHA-256) und write-once abgelegt:
// derselbe Inhalt landet nur einmal auf der Platte, ein Überschreiben
// vorhandener Blobs findet nie statt (Tamper-Evidence auf Dateisystemebene).
const BLOB_DIR = join(getForensprotoStateDir(), "evidence-blobs");

function ensureBlobDir(): void {
  if (!existsSync(BLOB_DIR)) mkdirSync(BLOB_DIR, { recursive: true });
}

function blobPath(sha256: string): string {
  return join(BLOB_DIR, `${sha256}.bin`);
}

/** Schreibt den Blob atomar und nur, wenn er noch nicht existiert (write-once). */
function storeBlob(sha256: string, buffer: Buffer): boolean {
  ensureBlobDir();
  const dest = blobPath(sha256);
  if (existsSync(dest)) return true; // identischer Inhalt bereits abgelegt
  const tmp = `${dest}.tmp-${randomUUID().slice(0, 8)}`;
  writeFileSync(tmp, buffer);
  renameSync(tmp, dest);
  return true;
}

/** Liest den gespeicherten Rohdaten-Blob eines Asservats, falls vorhanden. */
export function getEvidenceBlob(id: string): Buffer | null {
  const ev = getEvidence(id);
  if (!ev) return null;
  const p = blobPath(ev.sha256);
  if (!existsSync(p)) return null;
  return readFileSync(p);
}

export function hasEvidenceBlob(id: string): boolean {
  const ev = getEvidence(id);
  if (!ev) return false;
  return existsSync(blobPath(ev.sha256));
}

export type CaseStatus = "open" | "closed" | "archived";

export type CaseKind = "standard" | "inheritance";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  at?: number;
  by?: string;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  name: string;
  description: string;
  investigator: string;
  status: CaseStatus;
  tenantId: string;
  createdAt: number;
  updatedAt: number;
  // Nachlass-/Erben-Modus
  kind?: CaseKind;
  beneficiary?: { name: string; relationship: string; legalBasis: string };
  inheritanceChecklist?: ChecklistItem[];
}

/** Standard-Checkliste für beweissichere Nachlass-Recovery. */
export function defaultInheritanceChecklist(): ChecklistItem[] {
  return [
    { id: "death-cert", label: "Sterbeurkunde liegt vor", done: false },
    { id: "inheritance-cert", label: "Erbschein / Testament liegt vor", done: false },
    { id: "id-verified", label: "Identität der/des Erben verifiziert", done: false },
    { id: "authorization", label: "Berechtigung dokumentiert (Vollmacht/Beschluss)", done: false },
    { id: "legal-basis", label: "Rechtliche Grundlage geprüft", done: false },
  ];
}

export interface EvidenceRecord {
  id: string;
  caseId: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  md5: string;
  source: string;
  notes: string;
  importedAt: number;
  /** true, sobald die Rohdatei selbst (nicht nur ihr Hash) im Evidence-Blob-Speicher liegt. */
  blobStored: boolean;
}

export interface CustodyEvent {
  seq: number;
  id: string;
  evidenceId: string;
  timestamp: string;
  actor: string;
  action: string;
  note: string;
  prevHash: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
export function createCase(input: {
  name: string;
  description?: string;
  investigator?: string;
  caseNumber?: string;
  tenantId?: string;
  kind?: CaseKind;
  beneficiary?: { name: string; relationship: string; legalBasis: string };
}): CaseRecord {
  const now = Date.now();
  const isInheritance = input.kind === "inheritance";
  const rec: CaseRecord = {
    id: `case-${randomUUID().slice(0, 12)}`,
    caseNumber: input.caseNumber?.trim() || `FP-${new Date().getFullYear()}-${String(now).slice(-6)}`,
    name: input.name,
    description: input.description || "",
    investigator: input.investigator || "unbekannt",
    status: "open",
    tenantId: input.tenantId || "default",
    createdAt: now,
    updatedAt: now,
    kind: input.kind || "standard",
    beneficiary: input.beneficiary,
    inheritanceChecklist: isInheritance ? defaultInheritanceChecklist() : undefined,
  };
  db.put<CaseRecord>("cases", rec.id, rec);
  appendAuditLog({
    level: "info",
    action: "Fall angelegt",
    message: `Fall "${rec.name}" (${rec.caseNumber}) erstellt durch ${rec.investigator}`,
    source: "cases",
    caseId: rec.id,
  });
  return rec;
}

export function getCase(id: string): CaseRecord | undefined {
  return db.get<CaseRecord>("cases", id)?.data;
}

export function getAllCases(): CaseRecord[] {
  return db
    .all<CaseRecord>("cases")
    .map((r) => r.data)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function updateCase(
  id: string,
  updates: Partial<Pick<CaseRecord, "name" | "description" | "investigator" | "status" | "kind" | "beneficiary" | "inheritanceChecklist">>
): CaseRecord | undefined {
  const cur = getCase(id);
  if (!cur) return undefined;
  const next = { ...cur, ...updates, updatedAt: Date.now() };
  db.put<CaseRecord>("cases", id, next);
  appendAuditLog({
    level: "info",
    action: "Fall aktualisiert",
    message: `Fall ${cur.caseNumber} geändert: ${Object.keys(updates).join(", ")}`,
    source: "cases",
    caseId: id,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
export function addEvidence(input: {
  caseId: string;
  fileName: string;
  buffer: Buffer;
  source?: string;
  notes?: string;
  actor?: string;
}): EvidenceRecord {
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  const md5 = createHash("md5").update(input.buffer).digest("hex");
  const actor = input.actor || "system";

  // Rohdaten write-once, content-addressed ablegen (siehe storeBlob oben).
  // Ein Fehlschlag beim Blob-Schreiben darf die Registrierung des
  // Asservats nicht verhindern (z.B. read-only Dateisystem) – wird aber
  // klar über blobStored/Custody-Notiz sichtbar gemacht.
  let blobStored = false;
  try {
    blobStored = storeBlob(sha256, input.buffer);
  } catch (e) {
    console.error("[Evidence] Blob-Speicherung fehlgeschlagen:", e);
  }

  const rec: EvidenceRecord = {
    id: `ev-${randomUUID().slice(0, 12)}`,
    caseId: input.caseId,
    fileName: input.fileName,
    fileSize: input.buffer.length,
    sha256,
    md5,
    source: input.source || "Upload",
    notes: input.notes || "",
    importedAt: Date.now(),
    blobStored,
  };
  db.put<EvidenceRecord>("evidence", rec.id, rec);

  // Erster Chain-of-Custody-Eintrag = Sicherstellung/Import
  appendCustody(rec.id, {
    actor,
    action: "Asservat gesichert (Import)",
    note: `Datei "${rec.fileName}" (${rec.fileSize} Bytes) · SHA-256 ${sha256.slice(0, 16)}… · Rohdaten ${blobStored ? "im Evidence Locker gespeichert" : "NICHT gespeichert (nur Hash)"}`,
  });

  appendAuditLog({
    level: blobStored ? "success" : "warning",
    action: "Asservat importiert",
    message: `${rec.fileName} → Fall ${input.caseId} · SHA-256 ${sha256}${blobStored ? "" : " · WARNUNG: Rohdaten-Ablage fehlgeschlagen"}`,
    source: "evidence",
    caseId: input.caseId,
    user: actor,
  });
  return rec;
}

export function getEvidenceForCase(caseId: string): EvidenceRecord[] {
  return db
    .all<EvidenceRecord>("evidence")
    .map((r) => r.data)
    .filter((e) => e.caseId === caseId)
    .sort((a, b) => b.importedAt - a.importedAt);
}

export function getEvidence(id: string): EvidenceRecord | undefined {
  return db.get<EvidenceRecord>("evidence", id)?.data;
}

/**
 * Re-verifiziert ein Asservat gegen seinen registrierten SHA-256
 * (Soll-Ist-Abgleich) und protokolliert das Ergebnis.
 *
 * Wird kein Buffer übergeben, verifiziert die Funktion den intern im
 * Evidence Locker gespeicherten Blob gegen den registrierten Hash
 * (Selbstprüfung der Ablage, z.B. für periodische Integritäts-Checks).
 * Ist weder ein Buffer übergeben noch ein Blob gespeichert, ist keine
 * Verifikation möglich – das wird explizit als solches zurückgemeldet,
 * statt fälschlich "match: false" zu melden.
 */
export function verifyEvidence(
  id: string,
  buffer?: Buffer,
  actor = "system"
): { match: boolean; expected: string; actual: string; source: "supplied" | "stored-blob" | "unavailable" } {
  const ev = getEvidence(id);
  const expected = ev?.sha256 || "";

  let source: "supplied" | "stored-blob" | "unavailable" = "unavailable";
  let data: Buffer | null = buffer ?? null;
  if (data) {
    source = "supplied";
  } else if (ev) {
    data = getEvidenceBlob(id);
    if (data) source = "stored-blob";
  }

  if (!data) {
    if (ev) {
      appendCustody(id, {
        actor,
        action: "Verifikation nicht möglich",
        note: "Weder externe Datei noch gespeicherter Evidence-Blob verfügbar.",
      });
    }
    return { match: false, expected, actual: "", source: "unavailable" };
  }

  const actual = createHash("sha256").update(data).digest("hex");
  const match = !!ev && actual === expected;
  if (ev) {
    appendCustody(id, {
      actor,
      action: match ? "Integrität verifiziert (OK)" : "Integrität FEHLGESCHLAGEN",
      note: `Quelle: ${source === "supplied" ? "extern bereitgestellte Datei" : "gespeicherter Evidence-Blob"} · ${
        match ? "SHA-256 stimmt überein" : `Erwartet ${expected.slice(0, 16)}…, erhalten ${actual.slice(0, 16)}…`
      }`,
    });
    appendAuditLog({
      level: match ? "success" : "danger",
      action: "Asservat-Verifikation",
      message: `${ev.fileName}: ${match ? "Hash OK" : "HASH-ABWEICHUNG"} (Quelle: ${source})`,
      source: "evidence",
      caseId: ev.caseId,
      user: actor,
    });
  }
  return { match, expected, actual, source };
}

// ---------------------------------------------------------------------------
// Chain of Custody (hash-verkettet, je Asservat)
// ---------------------------------------------------------------------------
function canonicalCustody(e: Omit<CustodyEvent, "hash">): string {
  return JSON.stringify([
    e.seq,
    e.id,
    e.evidenceId,
    e.timestamp,
    e.actor,
    e.action,
    e.note,
    e.prevHash,
  ]);
}

function computeCustodyHash(e: Omit<CustodyEvent, "hash">): string {
  return createHash("sha256").update(canonicalCustody(e)).digest("hex");
}

export function appendCustody(
  evidenceId: string,
  input: { actor: string; action: string; note?: string }
): CustodyEvent {
  const chain = getCustody(evidenceId); // chronologisch
  const last = chain[chain.length - 1];
  const prevHash = last?.hash ?? GENESIS;
  const seq = (db.last<CustodyEvent>("custody")?.seq ?? 0) + 1;

  const base: Omit<CustodyEvent, "hash"> = {
    seq,
    id: `coc-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    evidenceId,
    timestamp: new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    note: input.note || "",
    prevHash,
  };
  const evt: CustodyEvent = { ...base, hash: computeCustodyHash(base) };
  db.append<CustodyEvent>("custody", evt.id, evt);
  return evt;
}

/** Custody-Kette eines Asservats in chronologischer Reihenfolge. */
export function getCustody(evidenceId: string): CustodyEvent[] {
  return db
    .all<CustodyEvent>("custody")
    .map((r) => r.data)
    .filter((c) => c.evidenceId === evidenceId)
    .sort((a, b) => a.seq - b.seq);
}

export function verifyCustodyChain(evidenceId: string): {
  valid: boolean;
  totalEvents: number;
  brokenAt?: { seq: number; reason: string };
} {
  const chain = getCustody(evidenceId);
  let expectedPrev = GENESIS;
  for (const e of chain) {
    if (e.prevHash !== expectedPrev) {
      return { valid: false, totalEvents: chain.length, brokenAt: { seq: e.seq, reason: "prevHash-Bruch" } };
    }
    const { hash, ...rest } = e;
    if (computeCustodyHash(rest) !== hash) {
      return { valid: false, totalEvents: chain.length, brokenAt: { seq: e.seq, reason: "Inhalt verändert" } };
    }
    expectedPrev = hash;
  }
  return { valid: true, totalEvents: chain.length };
}
