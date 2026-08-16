/**
 * Verteilte Recovery — Simulations- & Benchmark-Harness (Phase 2, #6)
 * ==================================================================
 * Echte GPU-Flotten lassen sich nur im Feld benchmarken. Diese Harness
 * beweist deterministisch den *code-seitigen* Teil: dass die verteilte
 * Orchestrierung korrekt ist — d. h.
 *   1. die Keyspace-Partitionierung deckt den Suchraum lückenlos &
 *      überlappungsfrei ab (verifyShardCoverage),
 *   2. die Aggregation der Shard-Ergebnisse liefert exakt dasselbe Resultat
 *      wie ein Single-Job (gleicher Treffer-Index),
 *   3. Agentenausfälle werden durch Re-Zuweisung der Shards aufgefangen
 *      (Fehlertoleranz) — der Treffer geht nicht verloren,
 *   4. der Durchsatz skaliert (aggregierte H/s, Speedup vs. Single-Node).
 *
 * Die Harness ist außerdem die Vorlage, um eine ECHTE Flotte zu vermessen:
 * dieselbe Report-Struktur, gespeist aus realen Agent-Benchmarks.
 * Rein deterministisch & abhängigkeitsfrei.
 */

import { splitKeyspace, verifyShardCoverage, type KeyspaceShard } from "./keyspace";

export interface SimAgent {
  id: string;
  hps: number; // Hashes pro Sekunde (Benchmark)
}

export interface SimOptions {
  keyspaceTotal: number;
  agents: SimAgent[];
  /** Globaler Index des Passworts im Keyspace, oder null/undefined = nicht enthalten. */
  secretIndex?: number | null;
  /** IDs ausgefallener Agenten (ihre Shards werden neu zugewiesen). */
  faultyAgentIds?: string[];
}

export interface AgentSimResult {
  id: string;
  healthy: boolean;
  shardIndices: number[];
  candidates: number; // tatsächlich abgesuchte Kandidaten
  simSeconds: number;
  hps: number;
  found: boolean;
}

export interface Reassignment {
  shardIndex: number;
  from: string;
  to: string;
}

export interface DistributedSimReport {
  keyspaceTotal: number;
  agentCount: number;
  healthyAgents: number;
  shards: KeyspaceShard[];
  coverageValid: boolean;
  reassignments: Reassignment[];
  found: boolean;
  foundByAgent?: string;
  foundGlobalIndex?: number;
  expectedIndex: number | null;
  matchesExpected: boolean;
  aggregateHps: number;
  wallClockSec: number;
  singleNodeSec: number;
  speedup: number;
  perAgent: AgentSimResult[];
  generatedAt: string;
}

/**
 * Simuliert einen verteilten Recovery-Lauf. Deterministisch: keine
 * Zufallszahlen; gleiche Eingaben → gleiches Ergebnis.
 */
export function simulateDistributedRecovery(opts: SimOptions): DistributedSimReport {
  const total = opts.keyspaceTotal;
  if (!Number.isFinite(total) || total <= 0) throw new Error("Ungültiger Keyspace");
  if (opts.agents.length === 0) throw new Error("Keine Agenten");

  const faulty = new Set(opts.faultyAgentIds ?? []);
  const healthy = opts.agents.filter((a) => !faulty.has(a.id));
  if (healthy.length === 0) throw new Error("Keine gesunden Agenten — Ausführung nicht möglich");

  const shards = splitKeyspace(total, opts.agents.length);
  const coverageValid = verifyShardCoverage(total, shards);

  // Ursprüngliche Zuweisung: Shard i → Agent i (round-robin über alle Agenten).
  // Shards ausgefallener Agenten werden auf gesunde Agenten re-verteilt.
  const owner = new Map<number, string>();
  const reassignments: Reassignment[] = [];
  let rr = 0;
  for (const shard of shards) {
    const origAgent = opts.agents[shard.index % opts.agents.length];
    if (faulty.has(origAgent.id)) {
      const target = healthy[rr % healthy.length];
      rr++;
      owner.set(shard.index, target.id);
      reassignments.push({ shardIndex: shard.index, from: origAgent.id, to: target.id });
    } else {
      owner.set(shard.index, origAgent.id);
    }
  }

  const secretIndex = opts.secretIndex ?? null;
  const inRange = secretIndex !== null && secretIndex >= 0 && secretIndex < total;

  // Pro Agent abgesuchte Kandidaten & Trefferermittlung.
  const hpsOf = new Map(opts.agents.map((a) => [a.id, a.hps]));
  const perAgentMap = new Map<string, AgentSimResult>();
  for (const a of healthy) {
    perAgentMap.set(a.id, { id: a.id, healthy: true, shardIndices: [], candidates: 0, simSeconds: 0, hps: a.hps, found: false });
  }
  for (const a of opts.agents) {
    if (faulty.has(a.id)) perAgentMap.set(a.id, { id: a.id, healthy: false, shardIndices: [], candidates: 0, simSeconds: 0, hps: a.hps, found: false });
  }

  let found = false;
  let foundByAgent: string | undefined;
  let foundGlobalIndex: number | undefined;

  for (const shard of shards) {
    const agentId = owner.get(shard.index)!;
    const res = perAgentMap.get(agentId)!;
    res.shardIndices.push(shard.index);
    const hitInShard = inRange && secretIndex! >= shard.skip && secretIndex! < shard.skip + shard.limit;
    if (hitInShard) {
      const localPos = secretIndex! - shard.skip; // 0-basiert
      res.candidates += localPos + 1; // bis zum Treffer abgesucht
      res.found = true;
      found = true;
      foundByAgent = agentId;
      foundGlobalIndex = shard.skip + localPos;
    } else {
      res.candidates += shard.limit; // vollständig abgesucht
    }
  }

  // Zeiten berechnen.
  for (const res of perAgentMap.values()) {
    res.simSeconds = res.hps > 0 ? res.candidates / res.hps : Infinity;
  }

  const aggregateHps = healthy.reduce((s, a) => s + a.hps, 0);
  const fastest = Math.max(...opts.agents.map((a) => a.hps));

  // Wall-Clock: bei Treffer Zeit bis der findende Agent den Treffer erreicht;
  // sonst längste Agentenlaufzeit (Erschöpfung).
  let wallClockSec: number;
  if (found && foundByAgent) {
    wallClockSec = perAgentMap.get(foundByAgent)!.simSeconds;
  } else {
    wallClockSec = Math.max(...[...perAgentMap.values()].filter((r) => r.healthy).map((r) => r.simSeconds));
  }

  const candidatesSingle = found ? (foundGlobalIndex! + 1) : total;
  const singleNodeSec = fastest > 0 ? candidatesSingle / fastest : Infinity;
  const speedup = wallClockSec > 0 ? singleNodeSec / wallClockSec : 0;

  const matchesExpected = found ? foundGlobalIndex === secretIndex : !inRange;

  return {
    keyspaceTotal: total,
    agentCount: opts.agents.length,
    healthyAgents: healthy.length,
    shards,
    coverageValid,
    reassignments,
    found,
    foundByAgent,
    foundGlobalIndex,
    expectedIndex: secretIndex,
    matchesExpected,
    aggregateHps,
    wallClockSec,
    singleNodeSec,
    speedup,
    perAgent: [...perAgentMap.values()],
    generatedAt: new Date().toISOString(),
  };
}

/** Reiner Durchsatz-Benchmark einer (realen oder simulierten) Flotte. */
export function fleetThroughput(agents: SimAgent[], keyspaceTotal: number): {
  aggregateHps: number;
  fastestHps: number;
  estExhaustiveSec: number;
  speedupVsSingle: number;
} {
  const aggregateHps = agents.reduce((s, a) => s + a.hps, 0);
  const fastest = Math.max(0, ...agents.map((a) => a.hps));
  const estExhaustiveSec = aggregateHps > 0 ? keyspaceTotal / aggregateHps : Infinity;
  const singleSec = fastest > 0 ? keyspaceTotal / fastest : Infinity;
  return { aggregateHps, fastestHps: fastest, estExhaustiveSec, speedupVsSingle: estExhaustiveSec > 0 ? singleSec / estExhaustiveSec : 0 };
}
