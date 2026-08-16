/**
 * Persistente In-Process Job-Queue mit Concurrency-Steuerung
 * ==========================================================
 * Ersetzt das direkte, unkontrollierte Spawnen von Hashcat-Prozessen.
 * Für einen lokalen Single-Host (Hashcat nutzt intern bereits alle GPUs)
 * ist eine schlanke In-Process-Queue die realistische Lösung – kein
 * externer Broker (Redis/BullMQ) nötig. Der Runner ist austauschbar,
 * wodurch das Scheduling unabhängig von Hashcat testbar bleibt.
 *
 * Zustand wird über den persistenten Job-Store gehalten (Status
 * "queued"), die Kette überlebt damit Neustarts.
 */

import { join } from "path";
import { getAllJobs, getJob, updateJob, type Job } from "./job-store";
import { startHashcatJob } from "./hashcat-manager";
import { resolveRuleFile } from "./rules-store";
import { executionMode } from "./agents";
import { bus, EVT_JOB_FINISHED } from "./events";
import { getWordlistsDir } from "./data-dir";

export type Runner = (job: Job) => Promise<void>;

/** Standard-Runner: übersetzt einen Job in Hashcat-Startparameter. */
function defaultRunner(job: Job): Promise<void> {
  const wordlistFilePath = job.wordlist ? join(getWordlistsDir(), job.wordlist) : undefined;
  const ruleFiles = (job.ruleFiles || [])
    .map((r) => resolveRuleFile(r))
    .filter((p): p is string => !!p);
  return startHashcatJob(job.id, {
    hashFilePath: job.hashFile,
    hashcatMode: job.hashcatMode,
    attackMode: job.attackMode ?? 0,
    wordlistFilePath,
    mask: job.mask,
    sessionName: job.sessionName || `forensproto_${job.id}`,
    ruleFiles,
    devices: job.devices,
    skip: job.skip,
    limit: job.limit,
  });
}

interface QueueState {
  runner: Runner;
  wired: boolean;
  ticking: boolean;
}
const globalForQueue = global as unknown as { __forensQueue?: QueueState };
const state: QueueState =
  globalForQueue.__forensQueue || { runner: defaultRunner, wired: false, ticking: false };
if (process.env.NODE_ENV !== "production") globalForQueue.__forensQueue = state;

/** Runner austauschen (z.B. für Tests). */
export function setRunner(fn: Runner) {
  state.runner = fn;
}

export function getConcurrency(): number {
  const n = parseInt(process.env.FORENSPROTO_MAX_CONCURRENT || "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function activeCount(): number {
  // Verteilte Koordinator-Jobs (isDistributed) belegen keinen Ausführungs-Slot,
  // nur ihre Shards tun das.
  return getAllJobs().filter(
    (j) => (j.status === "running" || j.status === "starting") && !j.isDistributed
  ).length;
}

function queuedJobs(): Job[] {
  const agentsMode = executionMode() === "agents";
  return getAllJobs()
    .filter((j) => j.status === "queued")
    // Im Agenten-Modus werden Shards von Remote-Agenten ausgeführt, nicht lokal.
    .filter((j) => !(agentsMode && j.method === "distributed-shard"))
    .sort((a, b) => a.startTime - b.startTime); // FIFO
}

/** Reiht einen bereits angelegten Job ein und stößt das Scheduling an. */
export function enqueueJob(jobId: string) {
  updateJob(jobId, { status: "queued" });
  tick();
}

/** Scheduler-Durchlauf: füllt freie Slots mit wartenden Jobs (FIFO). */
export function tick() {
  if (state.ticking) return; // Reentrancy-Schutz
  state.ticking = true;
  try {
    const concurrency = getConcurrency();
    while (activeCount() < concurrency) {
      const next = queuedJobs()[0];
      if (!next) break;
      // Slot belegen: Status sofort auf "starting" (zählt in activeCount)
      updateJob(next.id, { status: "starting" });
      const job = getJob(next.id);
      if (!job) continue;
      Promise.resolve(state.runner(job)).catch((err) => {
        console.error("[Queue] Runner-Fehler:", err);
        updateJob(next.id, { status: "failed", error: String(err), speed: 0 });
        bus.emit(EVT_JOB_FINISHED, { jobId: next.id, status: "failed" });
      });
    }
  } finally {
    state.ticking = false;
  }
}

export interface QueueSnapshot {
  concurrency: number;
  active: number;
  queued: number;
  jobs: Array<Pick<Job, "id" | "walletName" | "status" | "progress" | "startTime">>;
}

export function getQueueSnapshot(): QueueSnapshot {
  const all = getAllJobs();
  return {
    concurrency: getConcurrency(),
    active: activeCount(),
    queued: all.filter((j) => j.status === "queued").length,
    jobs: all
      .filter((j) => ["queued", "starting", "running"].includes(j.status))
      .map((j) => ({
        id: j.id,
        walletName: j.walletName,
        status: j.status,
        progress: j.progress,
        startTime: j.startTime,
      })),
  };
}

// Bei jedem Job-Ende den nächsten wartenden Job nachrücken lassen.
if (!state.wired) {
  state.wired = true;
  bus.on(EVT_JOB_FINISHED, () => {
    try {
      tick();
    } catch (e) {
      console.error("[Queue] tick nach Job-Ende fehlgeschlagen:", e);
    }
  });
}
