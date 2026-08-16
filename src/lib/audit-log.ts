/**
 * Forensisches Audit-Log mit echter Hash-Verkettung (Tamper-Evidence)
 * ===================================================================
 * Append-only, serverseitig persistiert. Jeder Eintrag bindet den Hash
 * seines Vorgängers ein (Blockchain-artige Kette). Eine nachträgliche
 * Manipulation eines Eintrags bricht die Kette ab dem geänderten Eintrag
 * und ist über `verifyChain()` nachweisbar.
 *
 * Ersetzt den früheren Zufalls-"Hash" aus dem localStorage-Hook.
 */

import { createHash, randomUUID } from "crypto";
import { db } from "./db";

export type LogLevel = "info" | "success" | "warning" | "error" | "danger";

export interface LogEntry {
  seq: number;
  id: string;
  timestamp: string; // ISO-8601
  level: LogLevel;
  action: string;
  message: string;
  source: string;
  user: string;
  caseId?: string;
  prevHash: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

/** Kanonische, schlüssel-stabile Serialisierung für die Hash-Berechnung. */
function canonical(e: Omit<LogEntry, "hash">): string {
  return JSON.stringify([
    e.seq,
    e.id,
    e.timestamp,
    e.level,
    e.action,
    e.message,
    e.source,
    e.user,
    e.caseId ?? "",
    e.prevHash,
  ]);
}

function computeHash(e: Omit<LogEntry, "hash">): string {
  return createHash("sha256").update(canonical(e)).digest("hex");
}

export interface NewLog {
  level: LogLevel;
  action: string;
  message: string;
  source: string;
  user?: string;
  caseId?: string;
}

/** Hängt einen neuen, gehashten Eintrag an die Kette an. */
export function appendAuditLog(input: NewLog): LogEntry {
  const last = db.last<LogEntry>("audit_log");
  const prevHash = last?.data.hash ?? GENESIS;
  const seq = (last?.seq ?? 0) + 1;

  const base: Omit<LogEntry, "hash"> = {
    seq,
    id: `log-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    level: input.level,
    action: input.action,
    message: input.message,
    source: input.source,
    user: input.user || "system",
    caseId: input.caseId,
    prevHash,
  };

  const entry: LogEntry = { ...base, hash: computeHash(base) };
  db.append<LogEntry>("audit_log", entry.id, entry);
  return entry;
}

/** Alle Einträge in chronologischer (seq-) Reihenfolge. */
export function getAuditLogs(opts?: { caseId?: string; limit?: number }): LogEntry[] {
  let rows = db.all<LogEntry>("audit_log").map((r) => r.data);
  if (opts?.caseId) rows = rows.filter((e) => e.caseId === opts.caseId);
  if (opts?.limit) rows = rows.slice(-opts.limit);
  return rows.reverse(); // neueste zuerst (für die UI)
}

export interface ChainVerification {
  valid: boolean;
  totalEntries: number;
  brokenAt?: { seq: number; id: string; reason: string };
}

/** Prüft die Integrität der gesamten Kette. */
export function verifyChain(): ChainVerification {
  const rows = db.all<LogEntry>("audit_log").map((r) => r.data);
  let expectedPrev = GENESIS;

  for (const e of rows) {
    if (e.prevHash !== expectedPrev) {
      return {
        valid: false,
        totalEntries: rows.length,
        brokenAt: { seq: e.seq, id: e.id, reason: "prevHash stimmt nicht mit Vorgänger überein" },
      };
    }
    const { hash, ...rest } = e;
    if (computeHash(rest) !== hash) {
      return {
        valid: false,
        totalEntries: rows.length,
        brokenAt: { seq: e.seq, id: e.id, reason: "Eintrags-Hash stimmt nicht (Inhalt verändert)" },
      };
    }
    expectedPrev = hash;
  }

  return { valid: true, totalEntries: rows.length };
}
