/**
 * Compliance- & Autorisierungs-Schicht (Phase 1)
 * ==============================================
 * Verwandelt ForensProto von „technisch missbrauchbar" zu „reguliert
 * einsetzbar". Kern ist eine verpflichtende, hash-verkettete
 * Fallautorisierung: Vor jeder Recovery muss eine gültige rechtliche
 * Grundlage erfasst, der Operator attestiert und ein Sanktions-/OFAC-
 * Abgleich durchgeführt worden sein. Die Freigabekette ist tamper-evident
 * (wie Audit-Log & Chain of Custody) und damit nachträglich nicht
 * unbemerkt veränderbar.
 *
 * Gating: Wie bei der Auth-Schicht ist die Erzwingung per Flag schaltbar
 * (FORENSPROTO_COMPLIANCE). Im Default (Research-Preview) bleibt alles
 * lauffähig; produktiv/behördlich wird die Pflicht scharf geschaltet.
 *
 * Local-first: Das Sanktions-Screening prüft gegen eine lokal gepflegte
 * Liste (.forensproto/sanctions.json). Es ist bewusst KEIN Live-Feed –
 * die Struktur erlaubt das spätere Anbinden einer offiziellen Quelle
 * (z. B. OFAC SDN, EU-Konsolidierte Liste), ohne dass Schlüssel/Asservate
 * das System verlassen.
 */

import { createHash, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "./db";
import { appendAuditLog } from "./audit-log";
import { getForensprotoStateDir } from "./data-dir";

const GENESIS = "0".repeat(64);

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Zulässige rechtliche Grundlagen für eine Recovery. */
export type LegalBasis =
  | "owner-data" // Wiederherstellung eigener Daten
  | "court-order" // richterlicher Beschluss / Gerichtsanordnung
  | "law-enforcement" // Strafverfolgung (autorisierte Behörde)
  | "estate-inheritance" // Nachlass / Erbfall
  | "incident-response" // Vorfallsbearbeitung der eigenen Organisation
  | "pentest-authorized"; // beauftragter, autorisierter Sicherheitstest

export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
  "owner-data": "Eigene Daten",
  "court-order": "Gerichtsbeschluss",
  "law-enforcement": "Strafverfolgung",
  "estate-inheritance": "Nachlass / Erbfall",
  "incident-response": "Incident Response (eigene Organisation)",
  "pentest-authorized": "Autorisierter Sicherheitstest",
};

export function isLegalBasis(x: unknown): x is LegalBasis {
  return typeof x === "string" && x in LEGAL_BASIS_LABELS;
}

export interface SanctionsMatch {
  list: string; // Quelle der Liste (z. B. "OFAC-SDN", "lokal")
  value: string; // getroffener Wert
  matchedOn: "name" | "address";
  ref?: string; // optionaler Verweis (z. B. SDN-ID)
}

export interface SanctionsResult {
  screened: boolean; // wurde überhaupt geprüft?
  listPresent: boolean; // war eine Liste geladen?
  listEntries: number; // Größe der geladenen Liste
  matches: SanctionsMatch[];
  clear: boolean; // true = keine Treffer
}

export type AuthorizationStatus = "active" | "revoked" | "expired";

export interface AuthorizationRecord {
  seq: number;
  id: string;
  caseId?: string;
  tenantId: string;
  legalBasis: LegalBasis;
  reference: string; // Aktenzeichen / Beschluss-Nr. / Auftrags-ID
  subject: string; // betroffene Person/Organisation/Asset (frei)
  authorizedBy: string; // userId des freigebenden Operators
  authorizedByName: string; // username
  attestation: string; // Bestätigungstext des Operators
  subjectConsent: boolean; // liegt Einwilligung/Berechtigung vor?
  sanctions: SanctionsResult;
  status: AuthorizationStatus;
  createdAt: number;
  expiresAt: number | null; // 0/null = unbefristet
  revokedAt?: number;
  revokedBy?: string;
  revokeReason?: string;
  prevHash: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

/** Ist die Compliance-Erzwingung scharf geschaltet? */
export function complianceEnforced(): boolean {
  const v = (process.env.FORENSPROTO_COMPLIANCE || "").toLowerCase();
  return v === "enabled" || v === "1" || v === "true";
}

// ---------------------------------------------------------------------------
// Sanktions-/OFAC-Screening (lokale Liste)
// ---------------------------------------------------------------------------

interface SanctionsListEntry {
  type: "name" | "address";
  value: string;
  list?: string;
  ref?: string;
}

function sanctionsFile(): string {
  return join(getForensprotoStateDir(), "sanctions.json");
}

/** Normalisiert Namen für robusten Abgleich (Groß/Klein, Mehrfach-Spaces). */
function normName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function loadSanctionsList(): SanctionsListEntry[] {
  try {
    const f = sanctionsFile();
    if (!existsSync(f)) return [];
    const raw = JSON.parse(readFileSync(f, "utf-8"));
    const arr: unknown[] = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    const out: SanctionsListEntry[] = [];
    for (const e of arr) {
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        const type = o.type === "address" ? "address" : "name";
        const value = typeof o.value === "string" ? o.value : "";
        if (!value) continue;
        out.push({ type, value, list: typeof o.list === "string" ? o.list : "lokal", ref: typeof o.ref === "string" ? o.ref : undefined });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Gleicht Namen (unscharf-normalisiert) und Adressen (exakt) gegen die
 * lokale Sanktionsliste ab. Ohne Liste: screened=true, listPresent=false,
 * clear=true (es kann nichts getroffen werden) – wird im Status sichtbar
 * gemacht, damit das Fehlen der Liste nicht als „sauber" missverstanden wird.
 */
export function screenSanctions(input: { names?: string[]; addresses?: string[] }): SanctionsResult {
  const list = loadSanctionsList();
  const matches: SanctionsMatch[] = [];

  const names = (input.names || []).map(normName).filter(Boolean);
  const addresses = (input.addresses || []).map((a) => a.trim()).filter(Boolean);

  for (const e of list) {
    if (e.type === "name") {
      const target = normName(e.value);
      if (!target) continue;
      for (const n of names) {
        // Treffer, wenn ein Name den anderen vollständig enthält (Token-robust)
        if (n === target || n.includes(target) || target.includes(n)) {
          matches.push({ list: e.list || "lokal", value: e.value, matchedOn: "name", ref: e.ref });
          break;
        }
      }
    } else {
      for (const a of addresses) {
        if (a.toLowerCase() === e.value.toLowerCase()) {
          matches.push({ list: e.list || "lokal", value: e.value, matchedOn: "address", ref: e.ref });
          break;
        }
      }
    }
  }

  return {
    screened: true,
    listPresent: list.length > 0,
    listEntries: list.length,
    matches,
    clear: matches.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Hash-Kette
// ---------------------------------------------------------------------------

/**
 * Hash über den UNVERÄNDERLICHEN Bewilligungskern. Statuswechsel
 * (Widerruf, Ablauf) sind administrative Metadaten und bewusst NICHT
 * Teil des Integritäts-Hashes – sonst würde ein legitimer Widerruf die
 * Kette brechen. Der Widerruf selbst wird im append-only Audit-Log
 * (eigene Hash-Chain) tamper-evident festgehalten.
 */
function canonical(e: Omit<AuthorizationRecord, "hash">): string {
  const sanc = `${e.sanctions.clear ? 1 : 0}:${e.sanctions.matches
    .map((m) => `${m.matchedOn}=${m.value}`)
    .sort()
    .join("|")}`;
  return JSON.stringify([
    e.seq,
    e.id,
    e.caseId ?? "",
    e.tenantId,
    e.legalBasis,
    e.reference,
    e.subject,
    e.authorizedBy,
    e.authorizedByName,
    e.attestation,
    e.subjectConsent ? 1 : 0,
    sanc,
    e.createdAt,
    e.expiresAt ?? 0,
    e.prevHash,
  ]);
}

function computeHash(e: Omit<AuthorizationRecord, "hash">): string {
  return createHash("sha256").update(canonical(e)).digest("hex");
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateAuthorizationInput {
  caseId?: string;
  tenantId?: string;
  legalBasis: LegalBasis;
  reference: string;
  subject: string;
  authorizedBy: string;
  authorizedByName: string;
  attestation: string;
  subjectConsent: boolean;
  expiresAt?: number | null;
  /** zusätzliche Namen/Adressen fürs Screening (subject wird automatisch geprüft) */
  screenNames?: string[];
  screenAddresses?: string[];
}

/** Legt eine neue, gehashte Autorisierung an und protokolliert sie. */
export function createAuthorization(input: CreateAuthorizationInput): AuthorizationRecord {
  const last = db.last<AuthorizationRecord>("authorizations");
  const prevHash = last?.data.hash ?? GENESIS;
  const seq = (last?.seq ?? 0) + 1;

  const sanctions = screenSanctions({
    names: [input.subject, ...(input.screenNames || [])],
    addresses: input.screenAddresses || [],
  });

  const base: Omit<AuthorizationRecord, "hash"> = {
    seq,
    id: `az-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    caseId: input.caseId,
    tenantId: input.tenantId || "default",
    legalBasis: input.legalBasis,
    reference: input.reference.trim(),
    subject: input.subject.trim(),
    authorizedBy: input.authorizedBy,
    authorizedByName: input.authorizedByName,
    attestation: input.attestation.trim(),
    subjectConsent: !!input.subjectConsent,
    sanctions,
    status: "active",
    createdAt: Date.now(),
    expiresAt: input.expiresAt && input.expiresAt > 0 ? input.expiresAt : null,
    prevHash,
  };

  const rec: AuthorizationRecord = { ...base, hash: computeHash(base) };
  db.append<AuthorizationRecord>("authorizations", rec.id, rec);

  appendAuditLog({
    level: sanctions.clear ? "success" : "danger",
    action: "Autorisierung erteilt",
    message:
      `Fallautorisierung ${rec.id} · Grundlage: ${LEGAL_BASIS_LABELS[rec.legalBasis]} · Ref: ${rec.reference || "—"}` +
      (sanctions.clear ? " · Sanktions-Check: sauber" : ` · SANKTIONSTREFFER (${sanctions.matches.length})`) +
      (sanctions.listPresent ? "" : " · WARNUNG: keine Sanktionsliste geladen"),
    source: "compliance/authorization",
    caseId: rec.caseId,
    user: rec.authorizedByName,
  });

  return rec;
}

export function getAuthorization(id: string): AuthorizationRecord | undefined {
  return db.get<AuthorizationRecord>("authorizations", id)?.data;
}

export function listAuthorizations(opts?: { caseId?: string; tenantId?: string }): AuthorizationRecord[] {
  let rows = db.all<AuthorizationRecord>("authorizations").map((r) => r.data);
  if (opts?.caseId) rows = rows.filter((a) => a.caseId === opts.caseId);
  if (opts?.tenantId) rows = rows.filter((a) => a.tenantId === opts.tenantId);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Effektiver Status unter Berücksichtigung des Ablaufdatums. */
export function effectiveStatus(rec: AuthorizationRecord, now = Date.now()): AuthorizationStatus {
  if (rec.status === "revoked") return "revoked";
  if (rec.expiresAt && rec.expiresAt > 0 && now > rec.expiresAt) return "expired";
  return rec.status;
}

/**
 * Widerruft eine Autorisierung. Nur die administrativen Statusfelder
 * (status, revoked*) werden gesetzt – diese sind nicht Teil des
 * Integritäts-Hashes, sodass die Bewilligungskette intakt bleibt. Der
 * Widerruf wird zusätzlich im append-only Audit-Log (eigene Hash-Chain)
 * tamper-evident protokolliert.
 */
export function revokeAuthorization(id: string, by: string, reason: string): AuthorizationRecord | undefined {
  const cur = getAuthorization(id);
  if (!cur) return undefined;
  if (cur.status === "revoked") return cur;

  const updated: AuthorizationRecord = {
    ...cur,
    status: "revoked",
    revokedAt: Date.now(),
    revokedBy: by,
    revokeReason: reason.trim(),
  };
  db.put<AuthorizationRecord>("authorizations", id, updated);

  appendAuditLog({
    level: "warning",
    action: "Autorisierung widerrufen",
    message: `Autorisierung ${id} widerrufen durch ${by}: ${reason || "(kein Grund)"}`,
    source: "compliance/authorization",
    caseId: cur.caseId,
    user: by,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Kettenprüfung
// ---------------------------------------------------------------------------

export interface AuthChainVerification {
  valid: boolean;
  totalEntries: number;
  brokenAt?: { seq: number; id: string; reason: string };
}

/**
 * Prüft die Verkettung in Anlege-Reihenfolge: jeder Eintrag muss auf den
 * Hash seines Vorgängers zeigen, und sein Bewilligungskern muss zum
 * gespeicherten Hash passen. Da der Hash nur den unveränderlichen Kern
 * abdeckt, bleibt die Kette über Widerrufe/Ablauf hinweg gültig –
 * Manipulationen am Kern (Grundlage, Subjekt, Referenz, Sanktionsergebnis)
 * werden hingegen sofort erkannt.
 */
export function verifyAuthorizationChain(): AuthChainVerification {
  const rows = db.all<AuthorizationRecord>("authorizations").map((r) => r.data);
  let expectedPrev = GENESIS;
  for (const e of rows) {
    if (e.prevHash !== expectedPrev) {
      return { valid: false, totalEntries: rows.length, brokenAt: { seq: e.seq, id: e.id, reason: "prevHash-Bruch" } };
    }
    const { hash, ...rest } = e;
    if (computeHash(rest) !== hash) {
      return { valid: false, totalEntries: rows.length, brokenAt: { seq: e.seq, id: e.id, reason: "Inhalts-Hash stimmt nicht" } };
    }
    expectedPrev = hash;
  }
  return { valid: true, totalEntries: rows.length };
}

// ---------------------------------------------------------------------------
// Recovery-Gate
// ---------------------------------------------------------------------------

export interface AuthorizationCheck {
  ok: boolean;
  reason: string;
  authorization?: AuthorizationRecord;
}

/**
 * Zentrale Gate-Funktion: Darf eine Recovery starten?
 * Sucht eine gültige (aktiv, nicht abgelaufen, sanktions-sauber)
 * Autorisierung – entweder explizit per authorizationId oder über den
 * zugeordneten Fall (caseId).
 */
export function isRecoveryAuthorized(opts: {
  caseId?: string;
  authorizationId?: string;
  tenantId?: string;
}): AuthorizationCheck {
  const now = Date.now();

  const validate = (a: AuthorizationRecord): AuthorizationCheck => {
    if (opts.tenantId && a.tenantId !== opts.tenantId) {
      return { ok: false, reason: "Autorisierung gehört zu anderem Mandanten" };
    }
    const st = effectiveStatus(a, now);
    if (st === "revoked") return { ok: false, reason: "Autorisierung wurde widerrufen", authorization: a };
    if (st === "expired") return { ok: false, reason: "Autorisierung ist abgelaufen", authorization: a };
    if (!a.sanctions.clear) return { ok: false, reason: `Sanktionstreffer – Freigabe blockiert (${a.sanctions.matches.length})`, authorization: a };
    return { ok: true, reason: "autorisiert", authorization: a };
  };

  if (opts.authorizationId) {
    const a = getAuthorization(opts.authorizationId);
    if (!a) return { ok: false, reason: "Referenzierte Autorisierung nicht gefunden" };
    return validate(a);
  }

  if (opts.caseId) {
    const candidates = listAuthorizations({ caseId: opts.caseId })
      .filter((a) => effectiveStatus(a, now) === "active" && a.sanctions.clear);
    if (candidates.length === 0) {
      return { ok: false, reason: "Keine gültige Fallautorisierung vorhanden" };
    }
    return validate(candidates[0]); // jüngste zuerst (listAuthorizations sortiert desc)
  }

  return { ok: false, reason: "Keine Fallautorisierung referenziert (caseId oder authorizationId erforderlich)" };
}

/** Zusammenfassung für den Compliance-Status. */
export function authorizationSummary(): {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  sanctionsHits: number;
  chainValid: boolean;
  sanctionsListPresent: boolean;
  sanctionsListEntries: number;
} {
  const rows = listAuthorizations();
  const now = Date.now();
  let active = 0,
    revoked = 0,
    expired = 0,
    sanctionsHits = 0;
  for (const a of rows) {
    const st = effectiveStatus(a, now);
    if (st === "active") active++;
    else if (st === "revoked") revoked++;
    else if (st === "expired") expired++;
    if (!a.sanctions.clear) sanctionsHits++;
  }
  const probe = screenSanctions({ names: [] });
  return {
    total: rows.length,
    active,
    revoked,
    expired,
    sanctionsHits,
    chainValid: verifyAuthorizationChain().valid,
    sanctionsListPresent: probe.listPresent,
    sanctionsListEntries: probe.listEntries,
  };
}
