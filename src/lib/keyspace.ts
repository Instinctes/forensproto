/**
 * Keyspace-Berechnung & Splitting
 * ===============================
 * Grundlage für Multi-GPU-/verteilte Recovery. Hashcat liefert mit
 * `--keyspace` die Größe des Suchraums; dieser wird hier deterministisch
 * in N Shards (Skip/Limit-Bereiche) zerlegt.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { backendArgs } from "./hashcat-manager";

const execFileAsync = promisify(execFile);

export interface KeyspaceShard {
  index: number;
  skip: number; // -s
  limit: number; // -l (Anzahl Kandidaten in diesem Shard)
}

/**
 * Teilt einen Keyspace [0, total) gleichmäßig in `count` Shards.
 * Der Rest wird auf die ersten Shards verteilt (lückenlose Abdeckung).
 */
export function splitKeyspace(total: number, count: number): KeyspaceShard[] {
  if (!Number.isFinite(total) || total <= 0) throw new Error("Ungültiger Keyspace");
  const n = Math.max(1, Math.floor(count));
  const effective = Math.min(n, total); // nie mehr Shards als Kandidaten
  const base = Math.floor(total / effective);
  const remainder = total % effective;

  const shards: KeyspaceShard[] = [];
  let skip = 0;
  for (let i = 0; i < effective; i++) {
    const limit = base + (i < remainder ? 1 : 0);
    shards.push({ index: i, skip, limit });
    skip += limit;
  }
  return shards;
}

/** Verifiziert, dass Shards den gesamten Keyspace lückenlos & überlappungsfrei abdecken. */
export function verifyShardCoverage(total: number, shards: KeyspaceShard[]): boolean {
  if (shards.length === 0) return false;
  let cursor = 0;
  for (const s of shards) {
    if (s.skip !== cursor) return false;
    if (s.limit <= 0) return false;
    cursor += s.limit;
  }
  return cursor === total;
}

/**
 * Ruft `hashcat ... --keyspace` auf, um die Keyspace-Größe zu ermitteln.
 * Gibt null zurück, wenn Hashcat nicht verfügbar ist oder die Ausgabe
 * nicht geparst werden kann (Aufrufer sollte dann auf Single-Node ausweichen).
 */
export async function computeKeyspace(params: {
  hashcatMode: number;
  attackMode: number;
  wordlistFilePath?: string;
  mask?: string;
  ruleFiles?: string[];
}): Promise<number | null> {
  const args = ["-m", String(params.hashcatMode), "-a", String(params.attackMode)];
  if (params.attackMode === 0 && params.wordlistFilePath) {
    args.push(params.wordlistFilePath);
    for (const r of params.ruleFiles || []) args.push("-r", r);
  } else if (params.attackMode === 3 && params.mask) {
    args.push(params.mask);
  } else if (params.attackMode === 6 && params.wordlistFilePath && params.mask) {
    args.push(params.wordlistFilePath, params.mask);
  }
  args.push("--keyspace");
  // Backend-Auswahl konsistent zum eigentlichen Cracking-Lauf halten, damit
  // die Keyspace-Berechnung nicht an einem anderen/instabilen Backend
  // scheitert als der spätere Job (--keyspace selbst führt keinen Self-Test aus).
  args.push(...backendArgs());

  try {
    const { stdout } = await execFileAsync("hashcat", args, { timeout: 60000 });
    const line = stdout.trim().split("\n").filter(Boolean).pop() || "";
    const n = parseInt(line.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
