/**
 * Verteilte Recovery – Shard-Dispatch + Aggregation
 * =================================================
 * Zerlegt einen Recovery-Job per Keyspace-Splitting in N Shards und
 * führt sie als eigenständige Kind-Jobs über die Queue aus. Ein
 * Koordinator-(Eltern-)Job aggregiert Fortschritt und Ergebnis.
 *
 * Die lokale Mehr-Shard-Ausführung ist voll funktionsfähig und bildet
 * den realen Kern. Remote-Knoten (z.B. Vast.ai/SSH-Worker) sind über die
 * Shard-Abstraktion anschließbar: ein Knoten = ein Ausführungsziel eines
 * Shards. Der lokale Host ist dabei "Knoten 0".
 */

import { createJob, getJob, getChildJobs, updateJob, type Job } from "./job-store";
import { enqueueJob } from "./queue";
import { stopHashcatJob } from "./hashcat-manager";
import { computeKeyspace, splitKeyspace } from "./keyspace";
import { appendAuditLog } from "./audit-log";
import { bus, EVT_JOB_FINISHED, type JobFinishedPayload } from "./events";

export interface DistributedParams {
  parentJobId: string;
  walletName: string;
  walletType: string;
  hashcatMode: number;
  attackMode: number;
  hashFile: string;
  hashString: string;
  wordlist?: string; // Name (Resolver in queue)
  mask?: string;
  ruleFiles?: string[]; // Namen
  ruleFilePaths?: string[]; // absolute Pfade (nur für Keyspace-Berechnung)
  wordlistFilePath?: string; // absolut (nur für Keyspace-Berechnung)
  devices?: string;
  shardCount: number;
  caseId?: string;
  tenantId?: string;
}

export interface DistributedStartResult {
  ok: boolean;
  reason?: string;
  parentJobId?: string;
  shards?: number;
  keyspace?: number;
}

/**
 * Startet einen verteilten Job. Gibt {ok:false} zurück, wenn der Keyspace
 * nicht bestimmbar ist – der Aufrufer sollte dann auf einen Single-Job
 * ausweichen.
 */
export async function startDistributedJob(
  p: DistributedParams
): Promise<DistributedStartResult> {
  if (p.shardCount < 2) return { ok: false, reason: "shardCount < 2" };

  const keyspace = await computeKeyspace({
    hashcatMode: p.hashcatMode,
    attackMode: p.attackMode,
    wordlistFilePath: p.wordlistFilePath,
    mask: p.mask,
    ruleFiles: p.ruleFilePaths,
  });
  if (!keyspace) return { ok: false, reason: "Keyspace nicht bestimmbar (Hashcat nicht verfügbar?)" };

  const shards = splitKeyspace(keyspace, p.shardCount);

  // Koordinator-(Eltern-)Job
  createJob({
    id: p.parentJobId,
    walletName: p.walletName,
    walletType: p.walletType,
    hashcatMode: p.hashcatMode,
    method: "distributed",
    hashFile: p.hashFile,
    hashString: p.hashString,
    wordlist: p.wordlist,
    mask: p.mask,
    attackMode: p.attackMode,
    ruleFiles: p.ruleFiles,
    devices: p.devices,
    isDistributed: true,
    shardTotal: shards.length,
    caseId: p.caseId,
    tenantId: p.tenantId,
  });
  updateJob(p.parentJobId, { status: "running" });

  // Geräte ggf. round-robin auf Shards verteilen (Multi-GPU/Multi-Node)
  const deviceList = (p.devices || "").split(",").map((d) => d.trim()).filter(Boolean);

  for (const shard of shards) {
    const childId = `${p.parentJobId}-s${shard.index}`;
    const device = deviceList.length > 0 ? deviceList[shard.index % deviceList.length] : undefined;
    createJob({
      id: childId,
      walletName: `${p.walletName} [Shard ${shard.index + 1}/${shards.length}]`,
      walletType: p.walletType,
      hashcatMode: p.hashcatMode,
      method: "distributed-shard",
      hashFile: p.hashFile,
      hashString: p.hashString,
      wordlist: p.wordlist,
      mask: p.mask,
      attackMode: p.attackMode,
      ruleFiles: p.ruleFiles,
      devices: device,
      sessionName: `forensproto_${p.parentJobId}_s${shard.index}`,
      parentJobId: p.parentJobId,
      shardIndex: shard.index,
      shardTotal: shards.length,
      skip: shard.skip,
      limit: shard.limit,
      caseId: p.caseId,
      tenantId: p.tenantId,
    });
    enqueueJob(childId);
  }

  appendAuditLog({
    level: "info",
    action: "Verteilte Recovery gestartet",
    message: `Job ${p.parentJobId}: Keyspace ${keyspace} in ${shards.length} Shards aufgeteilt`,
    source: "distributed",
    caseId: p.caseId,
  });

  return { ok: true, parentJobId: p.parentJobId, shards: shards.length, keyspace };
}

const TERMINAL = ["completed", "failed", "stopped"];

/** Aggregierter Fortschritt/Status eines verteilten Jobs (auf Abruf). */
export function computeAggregate(parentJobId: string): {
  parent?: Job;
  shards: Job[];
  progress: number;
  speed: number;
  done: number;
  total: number;
} | null {
  const parent = getJob(parentJobId);
  if (!parent) return null;
  const shards = getChildJobs(parentJobId);
  const total = shards.length || parent.shardTotal || 0;
  const progress = total > 0 ? shards.reduce((s, c) => s + (c.progress || 0), 0) / total : 0;
  const speed = shards
    .filter((c) => c.status === "running")
    .reduce((s, c) => s + (c.speed || 0), 0);
  const done = shards.filter((c) => TERMINAL.includes(c.status)).length;
  return { parent, shards, progress, speed, done, total };
}

/** Aggregator: reagiert auf Shard-Abschlüsse und aktualisiert den Eltern-Job. */
function handleShardFinished(payload: JobFinishedPayload) {
  const child = getJob(payload.jobId);
  if (!child?.parentJobId) return;
  const parentId = child.parentJobId;
  const parent = getJob(parentId);
  if (!parent || parent.status === "completed") return;

  // Treffer in einem Shard → Gesamtjob erfolgreich, Geschwister stoppen
  if (payload.status === "completed" && payload.recoveredPassword) {
    updateJob(parentId, {
      status: "completed",
      recoveredPassword: payload.recoveredPassword,
      progress: 100,
      speed: 0,
    });
    for (const sib of getChildJobs(parentId)) {
      if (sib.id !== child.id && (sib.status === "running" || sib.status === "queued" || sib.status === "starting")) {
        stopHashcatJob(sib.id).catch(() => {});
        updateJob(sib.id, { status: "stopped", speed: 0 });
      }
    }
    appendAuditLog({
      level: "success",
      action: "Verteilte Recovery erfolgreich",
      message: `Job ${parentId}: Passwort in Shard ${child.shardIndex} gefunden`,
      source: "distributed",
      caseId: parent.caseId,
    });
    return;
  }

  // Sonst Aggregat aktualisieren; wenn alle Shards terminal → Gesamtergebnis
  const agg = computeAggregate(parentId);
  if (!agg) return;
  const allTerminal = agg.shards.length > 0 && agg.shards.every((c) => TERMINAL.includes(c.status));
  if (allTerminal) {
    const anyCompleted = agg.shards.some((c) => c.status === "completed");
    if (!anyCompleted) {
      updateJob(parentId, {
        status: "failed",
        error: "Alle Shards erschöpft – kein Passwort gefunden",
        speed: 0,
        progress: 100,
      });
      appendAuditLog({
        level: "error",
        action: "Verteilte Recovery erfolglos",
        message: `Job ${parentId}: alle ${agg.total} Shards erschöpft`,
        source: "distributed",
        caseId: parent.caseId,
      });
    }
  } else {
    updateJob(parentId, { progress: agg.progress, speed: agg.speed });
  }
}

// Aggregator einmalig registrieren.
const globalForDist = global as unknown as { __forensDistWired?: boolean };
if (!globalForDist.__forensDistWired) {
  globalForDist.__forensDistWired = true;
  bus.on(EVT_JOB_FINISHED, (payload: JobFinishedPayload) => {
    try {
      handleShardFinished(payload);
    } catch (e) {
      console.error("[Distributed] Aggregation fehlgeschlagen:", e);
    }
  });
}
