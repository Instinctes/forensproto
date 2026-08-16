/**
 * Monitoring – Health & Prometheus-Metriken
 * ==========================================
 */

import { existsSync } from "fs";
import { getAllJobs } from "./job-store";
import { getAuditLogs, verifyChain } from "./audit-log";
import { getQueueSnapshot } from "./queue";
import { getForensprotoStateDir } from "./data-dir";

const startedAt = Date.now();

export interface HealthStatus {
  app: "forensproto";
  status: "ok" | "degraded";
  uptimeSec: number;
  checks: { db: boolean; auditChain: boolean; dataDir: boolean };
}

export function healthCheck(): HealthStatus {
  let db = false;
  let auditChain = false;
  try {
    getAllJobs();
    db = true;
  } catch {
    db = false;
  }
  try {
    auditChain = verifyChain().valid;
  } catch {
    auditChain = false;
  }
  const dataDir = existsSync(getForensprotoStateDir());
  const status: HealthStatus["status"] = db && dataDir ? "ok" : "degraded";
  // "app": Erkennungsmarker für den nativen Tauri-Wrapper (main.rs), damit
  // dieser zuverlässig unterscheiden kann, ob ein auf dem gewählten Port
  // antwortender Dienst wirklich ForensProto ist — statt sich auf einen
  // reinen TCP-Connect-Erfolg zu verlassen (der auch bei einem völlig
  // fremden, zufällig denselben Port belegenden Prozess anschlagen würde).
  return {
    app: "forensproto",
    status,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    checks: { db, auditChain, dataDir },
  };
}

export interface Metrics {
  uptimeSec: number;
  jobsByStatus: Record<string, number>;
  jobsTotal: number;
  auditEntries: number;
  auditChainValid: number; // 1/0
  queueActive: number;
  queueDepth: number;
}

export function collectMetrics(): Metrics {
  const jobs = getAllJobs();
  const jobsByStatus: Record<string, number> = {};
  for (const j of jobs) jobsByStatus[j.status] = (jobsByStatus[j.status] || 0) + 1;
  const q = getQueueSnapshot();
  let auditEntries = 0;
  let chainValid = 0;
  try {
    auditEntries = getAuditLogs().length;
    chainValid = verifyChain().valid ? 1 : 0;
  } catch {
    /* ignore */
  }
  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    jobsByStatus,
    jobsTotal: jobs.length,
    auditEntries,
    auditChainValid: chainValid,
    queueActive: q.active,
    queueDepth: q.queued,
  };
}

/** Rendert die Metriken im Prometheus-Textformat (exposition format). */
export function renderPrometheus(m: Metrics = collectMetrics()): string {
  const lines: string[] = [];
  const add = (name: string, help: string, type: string, value: number, labels = "") => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    lines.push(`${name}${labels} ${value}`);
  };
  add("forensproto_uptime_seconds", "Prozess-Laufzeit", "gauge", m.uptimeSec);
  add("forensproto_jobs_total", "Gesamtzahl Jobs", "gauge", m.jobsTotal);
  // jobs by status als separate Serien
  lines.push(`# HELP forensproto_jobs_by_status Jobs nach Status`);
  lines.push(`# TYPE forensproto_jobs_by_status gauge`);
  for (const [status, count] of Object.entries(m.jobsByStatus)) {
    lines.push(`forensproto_jobs_by_status{status="${status}"} ${count}`);
  }
  add("forensproto_audit_entries", "Audit-Log-Einträge", "counter", m.auditEntries);
  add("forensproto_audit_chain_valid", "Audit-Hash-Chain gültig (1/0)", "gauge", m.auditChainValid);
  add("forensproto_queue_active", "Aktive Jobs", "gauge", m.queueActive);
  add("forensproto_queue_depth", "Wartende Jobs", "gauge", m.queueDepth);
  return lines.join("\n") + "\n";
}
