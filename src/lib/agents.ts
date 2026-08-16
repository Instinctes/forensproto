/**
 * Remote-Agent-Protokoll (verteilte/Cloud-Recovery, Hashtopolis-Stil)
 * ==================================================================
 * Entfernte oder Cloud-GPUs registrieren sich als Agenten, ziehen
 * Keyspace-Chunks (Shards eines verteilten Jobs), rechnen und melden
 * Ergebnisse zurück. Server-Seite ist hier vollständig implementiert;
 * der Referenz-Agent liegt unter scripts/forensproto-agent.py.
 */

import { randomUUID } from "crypto";
import { db } from "./db";
import { getJob, updateJob, getAllJobs, type Job } from "./job-store";
import { bus, EVT_JOB_FINISHED } from "./events";

export interface Agent {
  id: string;
  name: string;
  gpu: string;
  benchmarkHps: number;
  status: "idle" | "working" | "offline";
  registeredAt: number;
  lastSeen: number;
}

const ONLINE_WINDOW_MS = 60_000;

export function executionMode(): "local" | "agents" {
  return (process.env.FORENSPROTO_EXECUTION_MODE || "local").toLowerCase() === "agents" ? "agents" : "local";
}

export function registerAgent(input: { name?: string; gpu?: string; benchmarkHps?: number }): Agent {
  const agent: Agent = {
    id: `agent-${randomUUID().slice(0, 12)}`,
    name: input.name || "agent",
    gpu: input.gpu || "unknown",
    benchmarkHps: input.benchmarkHps || 0,
    status: "idle",
    registeredAt: Date.now(),
    lastSeen: Date.now(),
  };
  db.put<Agent>("agents", agent.id, agent);
  return agent;
}

export function heartbeat(id: string, patch: Partial<Pick<Agent, "benchmarkHps" | "status">>): Agent | undefined {
  const a = db.get<Agent>("agents", id)?.data;
  if (!a) return undefined;
  const next = { ...a, ...patch, lastSeen: Date.now() };
  db.put<Agent>("agents", id, next);
  return next;
}

export function listAgents(): Array<Agent & { online: boolean }> {
  const now = Date.now();
  return db
    .all<Agent>("agents")
    .map((r) => r.data)
    .map((a) => ({ ...a, online: now - a.lastSeen < ONLINE_WINDOW_MS }))
    .sort((x, y) => y.lastSeen - x.lastSeen);
}

export interface ChunkAssignment {
  jobId: string;
  parentJobId?: string;
  hashString: string;
  hashcatMode: number;
  attackMode: number;
  skip?: number;
  limit?: number;
  wordlist?: string;
  mask?: string;
  ruleFiles?: string[];
}

/**
 * Weist einem Agenten den nächsten freien Shard-Chunk zu (atomar:
 * queued → running + assignedAgent).
 */
export function assignChunk(agentId: string): ChunkAssignment | null {
  const agent = db.get<Agent>("agents", agentId)?.data;
  if (!agent) return null;

  const shard = getAllJobs()
    .filter((j) => j.method === "distributed-shard" && j.status === "queued" && !j.assignedAgent)
    .sort((a, b) => (a.shardIndex ?? 0) - (b.shardIndex ?? 0))[0];
  if (!shard) return null;

  updateJob(shard.id, { status: "running", assignedAgent: agentId });
  heartbeat(agentId, { status: "working" });

  return {
    jobId: shard.id,
    parentJobId: shard.parentJobId,
    hashString: shard.hashString,
    hashcatMode: shard.hashcatMode,
    attackMode: shard.attackMode ?? 0,
    skip: shard.skip,
    limit: shard.limit,
    wordlist: shard.wordlist,
    mask: shard.mask,
    ruleFiles: shard.ruleFiles,
  };
}

/** Verarbeitet das Ergebnis eines Agenten und triggert die Aggregation. */
export function submitResult(
  agentId: string,
  jobId: string,
  result: { found?: boolean; password?: string; exhausted?: boolean; error?: string }
): { ok: boolean; error?: string } {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "Job nicht gefunden" };
  if (job.assignedAgent && job.assignedAgent !== agentId) return { ok: false, error: "Job einem anderen Agenten zugewiesen" };

  if (result.found && result.password) {
    updateJob(jobId, { status: "completed", recoveredPassword: result.password, progress: 100, speed: 0 });
    bus.emit(EVT_JOB_FINISHED, { jobId, status: "completed", recoveredPassword: result.password });
  } else if (result.error) {
    updateJob(jobId, { status: "failed", error: result.error, speed: 0 });
    bus.emit(EVT_JOB_FINISHED, { jobId, status: "failed" });
  } else {
    // Chunk erschöpft, kein Treffer
    updateJob(jobId, { status: "failed", error: "Chunk erschöpft (kein Treffer)", speed: 0, progress: 100 });
    bus.emit(EVT_JOB_FINISHED, { jobId, status: "failed" });
  }
  heartbeat(agentId, { status: "idle" });
  return { ok: true };
}

/** Job-Fortschritt eines Agenten (Heartbeat mit Speed/Progress). */
export function reportProgress(jobId: string, patch: { speed?: number; progress?: number; temperature?: number; utilization?: number }) {
  const job = getJob(jobId) as Job | undefined;
  if (!job) return;
  updateJob(jobId, { ...patch, restorable: true });
}
