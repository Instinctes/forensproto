/**
 * Module H — Wallet-Forensik Tools
 *
 * Analyse-Hilfsfunktionen für forensische Untersuchung von Wallet-Strukturen.
 * Address-Clustering, UTXO-Muster, zeitbasierte Analyse.
 */

import type {
  WalletForensicsResult,
  AddressCluster,
  UTXOPattern,
  TemporalPattern,
} from "./types";

// ============================================================================
// Address-Clustering (Input Heuristik)
// ============================================================================

interface SimpleTx {
  txid: string;
  inputs: Array<{ address: string }>;
  outputs: Array<{ address: string; value: number }>;
  timestamp?: string;
}

/**
 * Common-Input-Ownership Heuristik:
 * Adressen die als Inputs der gleichen Transaktion erscheinen,
 * gehören wahrscheinlich zum gleichen Wallet.
 */
export function clusterByCommonInput(transactions: SimpleTx[]): AddressCluster[] {
  const unionFind = new Map<string, string>();

  function find(addr: string): string {
    if (!unionFind.has(addr)) unionFind.set(addr, addr);
    let root = addr;
    while (unionFind.get(root) !== root) {
      root = unionFind.get(root)!;
    }
    // Path compression
    let current = addr;
    while (current !== root) {
      const next = unionFind.get(current)!;
      unionFind.set(current, root);
      current = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) unionFind.set(rootA, rootB);
  }

  // Alle Inputs einer TX zusammengruppieren
  for (const tx of transactions) {
    const inputAddrs = tx.inputs.map((i) => i.address).filter(Boolean);
    for (let i = 1; i < inputAddrs.length; i++) {
      union(inputAddrs[0], inputAddrs[i]);
    }
  }

  // Cluster extrahieren
  const groups = new Map<string, string[]>();
  for (const addr of unionFind.keys()) {
    const root = find(addr);
    const group = groups.get(root) || [];
    group.push(addr);
    groups.set(root, group);
  }

  return Array.from(groups.values())
    .filter((addrs) => addrs.length > 1)
    .map((addresses) => ({
      addresses,
      reason: "Common-Input-Ownership Heuristik",
      confidence: 0.85,
    }));
}

// ============================================================================
// UTXO-Muster-Erkennung
// ============================================================================

export function detectUTXOPatterns(transactions: SimpleTx[]): UTXOPattern[] {
  const patterns: UTXOPattern[] = [];

  for (const tx of transactions) {
    // 1. Round-Amount Detection (verdächtige runde Beträge)
    for (const output of tx.outputs) {
      const btcValue = output.value / 1e8;
      if (btcValue > 0 && btcValue === Math.round(btcValue * 10) / 10) {
        if (btcValue >= 0.1 && Number.isInteger(btcValue * 10)) {
          patterns.push({
            type: "round_amount",
            description: `Runder Betrag: ${btcValue} BTC an ${output.address || "unknown"}`,
            affectedTxIds: [tx.txid],
          });
        }
      }
    }

    // 2. Change Detection (ein Output deutlich kleiner als der andere)
    if (tx.outputs.length === 2) {
      const [a, b] = tx.outputs;
      const ratio = Math.min(a.value, b.value) / Math.max(a.value, b.value);
      if (ratio < 0.05 && Math.min(a.value, b.value) > 0) {
        const changeOutput = a.value < b.value ? a : b;
        patterns.push({
          type: "change_detection",
          description: `Wahrscheinliches Wechselgeld: ${(changeOutput.value / 1e8).toFixed(8)} BTC an ${changeOutput.address || "unknown"}`,
          affectedTxIds: [tx.txid],
        });
      }
    }

    // 3. Consolidation (viele Inputs, ein Output)
    if (tx.inputs.length > 5 && tx.outputs.length <= 2) {
      patterns.push({
        type: "consolidation",
        description: `Konsolidierung: ${tx.inputs.length} Inputs → ${tx.outputs.length} Output(s)`,
        affectedTxIds: [tx.txid],
      });
    }

    // 4. Peeling Chain (gleiche Adresse in Inputs und Outputs)
    const inputAddrs = new Set(tx.inputs.map((i) => i.address));
    const outputAddrs = tx.outputs.map((o) => o.address);
    const selfSpends = outputAddrs.filter((a) => inputAddrs.has(a));
    if (selfSpends.length > 0) {
      patterns.push({
        type: "peeling_chain",
        description: `Self-Spend/Peeling: Adressen in Input und Output identisch (${selfSpends.length} Treffer)`,
        affectedTxIds: [tx.txid],
      });
    }
  }

  // Deduplizieren nach txid
  const seen = new Set<string>();
  return patterns.filter((p) => {
    const key = `${p.type}:${p.affectedTxIds.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// Zeitbasierte Analyse
// ============================================================================

export function analyzeTemporalPatterns(transactions: SimpleTx[]): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const withTime = transactions
    .filter((tx) => tx.timestamp)
    .map((tx) => ({
      ...tx,
      date: new Date(tx.timestamp!),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (withTime.length < 2) return patterns;

  // 1. Regelmäßige Intervalle
  const intervals: number[] = [];
  for (let i = 1; i < withTime.length; i++) {
    intervals.push(withTime[i].date.getTime() - withTime[i - 1].date.getTime());
  }

  if (intervals.length >= 3) {
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
    );
    const cv = stdDev / avgInterval; // Variationskoeffizient

    if (cv < 0.3 && avgInterval > 0) {
      const minutes = Math.round(avgInterval / 60000);
      patterns.push({
        type: "regular_interval",
        description: `Regelmäßiges Transaktionsmuster: ~${minutes} Minuten Intervall (CV: ${(cv * 100).toFixed(1)}%). Deutet auf automatisiertes Script hin.`,
        timeRange: {
          start: withTime[0].date.toISOString(),
          end: withTime[withTime.length - 1].date.toISOString(),
        },
      });
    }
  }

  // 2. Burst-Aktivität (viele TX in kurzem Zeitraum)
  const windowMs = 60 * 60 * 1000; // 1 Stunde
  for (let i = 0; i < withTime.length; i++) {
    const windowEnd = withTime[i].date.getTime() + windowMs;
    let count = 0;
    for (let j = i; j < withTime.length && withTime[j].date.getTime() <= windowEnd; j++) {
      count++;
    }
    if (count >= 10) {
      patterns.push({
        type: "burst_activity",
        description: `Burst-Aktivität: ${count} Transaktionen innerhalb von 1 Stunde`,
        timeRange: {
          start: withTime[i].date.toISOString(),
          end: new Date(windowEnd).toISOString(),
        },
      });
      break; // Nur den größten Burst melden
    }
  }

  // 3. Dormancy (lange Inaktivität)
  for (let i = 1; i < withTime.length; i++) {
    const gapDays = (withTime[i].date.getTime() - withTime[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
    if (gapDays >= 90) {
      patterns.push({
        type: "dormancy",
        description: `Lange Inaktivität: ${Math.round(gapDays)} Tage zwischen Transaktionen`,
        timeRange: {
          start: withTime[i - 1].date.toISOString(),
          end: withTime[i].date.toISOString(),
        },
      });
    }
  }

  // 4. Timezone-Hint (Aktivitätszeiten-Analyse)
  const hourCounts = new Array(24).fill(0);
  for (const tx of withTime) {
    hourCounts[tx.date.getUTCHours()]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const quietHours = hourCounts.filter((c) => c === 0).length;
  if (quietHours >= 6) {
    patterns.push({
      type: "timezone_hint",
      description: `Aktivitätspeak: ${peakHour}:00 UTC. ${quietHours} Stunden ohne Transaktionen. Möglicher Zeitzonen-Hinweis.`,
    });
  }

  return patterns;
}

// ============================================================================
// Vollständige Wallet-Forensik
// ============================================================================

export function analyzeWalletForensics(transactions: SimpleTx[]): WalletForensicsResult {
  const addressClusters = clusterByCommonInput(transactions);
  const utxoPatterns = detectUTXOPatterns(transactions);
  const temporalAnalysis = analyzeTemporalPatterns(transactions);

  const totalAddresses = new Set(
    transactions.flatMap((tx) => [
      ...tx.inputs.map((i) => i.address),
      ...tx.outputs.map((o) => o.address),
    ]).filter(Boolean)
  ).size;

  const summary =
    `Analyse von ${transactions.length} Transaktionen mit ${totalAddresses} einzigartigen Adressen. ` +
    `${addressClusters.length} Adress-Cluster identifiziert, ` +
    `${utxoPatterns.length} UTXO-Muster erkannt, ` +
    `${temporalAnalysis.length} zeitliche Auffälligkeiten.`;

  return {
    addressClusters,
    utxoPatterns,
    temporalAnalysis,
    summary,
  };
}
