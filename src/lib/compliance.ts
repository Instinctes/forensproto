/**
 * Compliance-Status & Datenaufbewahrung
 * =====================================
 * Aggregiert nachweisrelevante Kontrollen in einer Übersicht und
 * implementiert eine konfigurierbare Aufbewahrungs-Bereinigung für
 * flüchtige Daten (abgeschlossene Jobs). Das Audit-Log bleibt als
 * append-only Beweismittel ausdrücklich von der Löschung ausgenommen.
 */

import { existsSync } from "fs";
import { join } from "path";
import { getAllJobs, deleteJob } from "./job-store";
import { verifyChain } from "./audit-log";
import { authEnabled } from "./auth/context";
import { complianceEnforced, authorizationSummary } from "./authorization";
import { getForensprotoStateDir } from "./data-dir";

export interface ComplianceConfig {
  jobRetentionDays: number; // 0 = unbegrenzt
  auditImmutable: boolean;
  authEnforced: boolean;
  authorizationEnforced: boolean;
}

export function getComplianceConfig(): ComplianceConfig {
  const days = parseInt(process.env.FORENSPROTO_JOB_RETENTION_DAYS || "0", 10);
  return {
    jobRetentionDays: Number.isFinite(days) && days > 0 ? days : 0,
    auditImmutable: true,
    authEnforced: authEnabled(),
    authorizationEnforced: complianceEnforced(),
  };
}

export interface ComplianceStatus {
  config: ComplianceConfig;
  auditChainValid: boolean;
  auditEntries: number;
  encryptionAtRest: { signingKeyPresent: boolean; serverSecretPresent: boolean };
  authorizations: ReturnType<typeof authorizationSummary>;
  controls: Array<{ id: string; label: string; ok: boolean; note: string }>;
}

export function getComplianceStatus(): ComplianceStatus {
  const config = getComplianceConfig();
  const chain = verifyChain();
  const dir = getForensprotoStateDir();
  const signingKeyPresent = existsSync(join(dir, "signing-key.json"));
  const serverSecretPresent = existsSync(join(dir, "server-secret"));

  const az = authorizationSummary();

  const controls = [
    { id: "audit-integrity", label: "Audit-Trail Hash-Chain intakt", ok: chain.valid, note: `${chain.totalEntries} Einträge` },
    { id: "audit-immutable", label: "Audit-Log append-only (unveränderlich)", ok: true, note: "keine Löschfunktion" },
    { id: "report-signing", label: "Berichtssignatur-Schlüssel vorhanden", ok: signingKeyPresent, note: "Ed25519" },
    { id: "access-control", label: "Zugriffskontrolle (RBAC) erzwungen", ok: config.authEnforced, note: config.authEnforced ? "aktiv" : "deaktiviert (FORENSPROTO_AUTH)" },
    { id: "coc", label: "Chain of Custody je Asservat", ok: true, note: "hash-verkettet" },
    { id: "retention", label: "Aufbewahrungsrichtlinie definiert", ok: config.jobRetentionDays > 0, note: config.jobRetentionDays > 0 ? `${config.jobRetentionDays} Tage` : "unbegrenzt" },
    { id: "authorization", label: "Fallautorisierung vor Recovery erzwungen", ok: config.authorizationEnforced, note: config.authorizationEnforced ? "aktiv (FORENSPROTO_COMPLIANCE)" : "deaktiviert" },
    { id: "authorization-chain", label: "Autorisierungs-Kette intakt", ok: az.chainValid, note: `${az.total} Autorisierungen, ${az.active} aktiv` },
    { id: "sanctions-list", label: "Sanktions-/OFAC-Liste geladen", ok: az.sanctionsListPresent, note: az.sanctionsListPresent ? `${az.sanctionsListEntries} Einträge` : "keine Liste (.forensproto/sanctions.json)" },
    { id: "sanctions-clear", label: "Keine offenen Sanktionstreffer", ok: az.sanctionsHits === 0, note: az.sanctionsHits === 0 ? "sauber" : `${az.sanctionsHits} Treffer` },
  ];

  return {
    config,
    auditChainValid: chain.valid,
    auditEntries: chain.totalEntries,
    encryptionAtRest: { signingKeyPresent, serverSecretPresent },
    authorizations: az,
    controls,
  };
}

/** Wendet die Job-Aufbewahrung an: löscht abgeschlossene/fehlgeschlagene Jobs jenseits der Frist. */
export function applyRetention(): { deleted: number } {
  const cfg = getComplianceConfig();
  if (cfg.jobRetentionDays <= 0) return { deleted: 0 };
  const cutoff = Date.now() - cfg.jobRetentionDays * 86_400_000;
  let deleted = 0;
  for (const j of getAllJobs()) {
    if (["completed", "failed", "stopped"].includes(j.status) && j.startTime < cutoff) {
      deleteJob(j.id);
      deleted++;
    }
  }
  return { deleted };
}
