/**
 * Persistenter Job-Store (SQLite/JSON via lib/db)
 *
 * Ersetzt den früheren In-Memory-Store. Jobs überleben jetzt Server-
 * Neustarts. Die exportierte Funktions-Signatur bleibt synchron und
 * abwärtskompatibel, damit bestehende API-Routen unverändert laufen.
 */

import { db } from "./db";

export type JobStatus =
  | "queued"
  | "starting"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "stopped";

export interface Job {
  id: string;
  walletName: string;
  walletType: string;
  hashcatMode: number;
  method: string;
  startTime: number;
  endTime?: number; // gesetzt bei terminalem Status (für Laufzeit/Energie)
  status: JobStatus;

  // Real-time metrics
  progress: number;
  speed: number;
  eta: number;
  temperature: number;
  utilization?: number; // GPU-Auslastung % (aus Hashcat device.util)

  // Results
  recoveredPassword?: string;
  error?: string;

  // Internal OS metrics
  pid?: number;
  hashFile: string;
  hashString: string;
  wordlist?: string;
  mask?: string;

  // Checkpoint / Resume
  sessionName?: string; // Hashcat --session Name
  restorable?: boolean; // true, sobald ein Restore-Punkt existiert
  attackMode?: number; // hashcat -a Code (für Resume benötigt)

  // Recovery-Engine (Phase 2)
  ruleFiles?: string[]; // Hashcat -r Regeldateien
  devices?: string; // Hashcat -d Geräteauswahl, z.B. "1,2"

  // Verteilte Recovery / Shards
  parentJobId?: string; // gesetzt, wenn dies ein Shard eines verteilten Jobs ist
  shardIndex?: number;
  shardTotal?: number;
  skip?: number; // Hashcat -s
  limit?: number; // Hashcat -l
  isDistributed?: boolean; // true für den Eltern-(Koordinator-)Job
  assignedAgent?: string; // Remote-Agent, der diesen Shard bearbeitet

  // Forensik-Verknüpfung
  caseId?: string;
  tenantId?: string;

  // Wallet-Dump (nach Treffer)
  walletFilePath?: string; // Pfad der hochgeladenen wallet.dat (für Dump)
  dumpAvailable?: boolean; // true, sobald ein Dump erzeugt wurde
}

type NewJob = Pick<
  Job,
  | "id"
  | "walletName"
  | "walletType"
  | "hashcatMode"
  | "method"
  | "hashFile"
  | "hashString"
  | "wordlist"
  | "mask"
> &
  Partial<
    Pick<
      Job,
      | "sessionName"
      | "attackMode"
      | "caseId"
      | "ruleFiles"
      | "devices"
      | "parentJobId"
      | "shardIndex"
      | "shardTotal"
      | "skip"
      | "limit"
      | "isDistributed"
      | "tenantId"
      | "walletFilePath"
    >
  >;

export function createJob(jobData: NewJob): Job {
  const newJob: Job = {
    ...jobData,
    startTime: Date.now(),
    status: "starting",
    progress: 0,
    speed: 0,
    eta: 0,
    temperature: 0,
    restorable: false,
  };
  db.put<Job>("jobs", newJob.id, newJob);
  return newJob;
}

const TERMINAL_STATUS: JobStatus[] = ["completed", "failed", "stopped"];

export function updateJob(id: string, updates: Partial<Job>) {
  const row = db.get<Job>("jobs", id);
  if (row) {
    const merged = { ...row.data, ...updates };
    // Laufzeit-Ende einmalig festhalten, sobald der Job terminal wird
    if (updates.status && TERMINAL_STATUS.includes(updates.status) && !merged.endTime) {
      merged.endTime = Date.now();
    }
    db.put<Job>("jobs", id, merged);
  }
}

export function getJob(id: string): Job | undefined {
  return db.get<Job>("jobs", id)?.data;
}

export function getAllJobs(): Job[] {
  return db
    .all<Job>("jobs")
    .map((r) => r.data)
    .sort((a, b) => b.startTime - a.startTime);
}

export function deleteJob(id: string) {
  db.remove("jobs", id);
}

/** Alle Shard-Kindjobs eines verteilten Eltern-Jobs. */
export function getChildJobs(parentJobId: string): Job[] {
  return db
    .all<Job>("jobs")
    .map((r) => r.data)
    .filter((j) => j.parentJobId === parentJobId)
    .sort((a, b) => (a.shardIndex ?? 0) - (b.shardIndex ?? 0));
}

/** Beim Server-Start: verwaiste "running"/"starting" Jobs markieren.
 *  Da der Hashcat-Prozess den Neustart nicht überlebt, sind sie
 *  unterbrochen – aber dank --session ggf. fortsetzbar. */
export function reconcileOrphanJobs() {
  for (const row of db.all<Job>("jobs")) {
    const j = row.data;
    if (j.status === "running" || j.status === "starting") {
      db.put<Job>("jobs", j.id, {
        ...j,
        status: "stopped",
        speed: 0,
        pid: undefined,
        error: "Durch Server-Neustart unterbrochen (fortsetzbar, falls Restore-Punkt vorhanden)",
      });
    }
  }
}

// Einmalige Bereinigung verwaister Jobs pro Server-Prozess.
const globalForReconcile = global as unknown as { __forensReconciled?: boolean };
if (!globalForReconcile.__forensReconciled) {
  globalForReconcile.__forensReconciled = true;
  try {
    reconcileOrphanJobs();
  } catch (e) {
    console.error("[ForensProto] Job-Reconcile fehlgeschlagen:", e);
  }
}
