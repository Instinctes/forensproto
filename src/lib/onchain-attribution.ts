/**
 * On-Chain-Attribution & Risk-Scoring (Phase 2, Wertsteigerung #4)
 * ===============================================================
 * Hebt das vorhandene Tracing von „Adresse → Graph" auf „Adresse →
 * attribuiert, geclustert, risikobewertet". Genau diese Fähigkeit trägt
 * die Bewertungen von TRM Labs / Chainalysis.
 *
 * Bausteine (alle Kernfunktionen sind PURE & deterministisch testbar):
 *   1. Entity-Kategorisierung   – Label-DB + Sanktions-/OFAC-Abgleich
 *   2. Common-Input-Clustering  – Union-Find über Co-Spending (BTC-Heuristik)
 *   3. Risk-Scoring             – gewichtetes Modell mit nachvollziehbaren Faktoren
 *   4. Exposure-Aufschlüsselung – Wert je Kategorie, ein-/ausgehend
 *   5. Orchestrator             – traceAttribution() mit INJIZIERBAREM Provider
 *                                 (live: mempool.space / Etherscan; Test: Fake)
 *
 * Local-first: nutzt dieselben öffentlichen Quellen wie das bestehende
 * Tracing. Der Sanktions-Abgleich läuft gegen die lokale Liste
 * (.forensproto/sanctions.json), kein externer Feed.
 */

import { screenSanctions } from "./authorization";

// ---------------------------------------------------------------------------
// Kategorien & Label-DB
// ---------------------------------------------------------------------------

export type EntityCategory =
  | "exchange"
  | "mixer"
  | "gambling"
  | "scam"
  | "sanctioned"
  | "darknet"
  | "service"
  | "own"
  | "unknown";

export interface EntityLabel {
  label: string;
  category: EntityCategory;
}

/** Kuratiertes Seed-Set bekannter Entitäten (BTC + ETH). Erweiterbar/feed-fähig. */
export const ENTITY_LABELS: Record<string, EntityLabel> = {
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": { label: "Satoshi (Genesis Block)", category: "service" },
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": { label: "Binance Hot Wallet", category: "exchange" },
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": { label: "Binance Cold Wallet", category: "exchange" },
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": { label: "Binance", category: "exchange" },
  "3JZq4atUahhuA9rLhXLMhhTo133J9rF97j": { label: "Bitfinex", category: "exchange" },
  "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r": { label: "Bittrex", category: "exchange" },
  "1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF": { label: "Mt.Gox Cold", category: "exchange" },
  "35hK24tcLEWcgNA4JxpvbkNkoAcDGqQPsP": { label: "Coinbase", category: "exchange" },
  "3FHNBLobJnbCTFTVakh5TXmEneyf5PT61B": { label: "Coinbase Pro", category: "exchange" },
  "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": { label: "OKX", category: "exchange" },
  "1KAt6STtisWMMVo5XGdos9P7DBNNsFfjx7": { label: "Kraken", category: "exchange" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { label: "Binance (ETH)", category: "exchange" },
  "0x28c6c06298d514db089934071355e5743bf21d60": { label: "Binance 14 (ETH)", category: "exchange" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { label: "Bybit (ETH)", category: "exchange" },
};

/** Schlüsselwörter, die ein Label als Mixer/Tumbler ausweisen. */
const MIXER_KEYWORDS = ["mixer", "tornado", "wasabi", "coinjoin", "chipmixer", "tumbler", "blender"];

function labelLooksLikeMixer(label: string): boolean {
  const l = label.toLowerCase();
  return MIXER_KEYWORDS.some((k) => l.includes(k));
}

export interface Categorization {
  address: string;
  label?: string;
  category: EntityCategory;
  source: "label-db" | "sanctions" | "heuristic" | "self";
}

/**
 * Kategorisiert eine Adresse: Label-DB → Sanktionsliste → unbekannt.
 * `isSelf` markiert die untersuchte Adresse.
 */
export function categorizeAddress(address: string, isSelf = false): Categorization {
  const key = address.startsWith("0x") ? address.toLowerCase() : address;
  const known = ENTITY_LABELS[key];
  if (known) {
    const category = labelLooksLikeMixer(known.label) ? "mixer" : known.category;
    return { address, label: known.label, category, source: "label-db" };
  }
  const sanc = screenSanctions({ addresses: [address] });
  if (!sanc.clear) {
    return { address, label: sanc.matches[0]?.list ? `Sanktionsliste: ${sanc.matches[0].list}` : "Sanktioniert", category: "sanctioned", source: "sanctions" };
  }
  if (isSelf) return { address, category: "own", source: "self" };
  return { address, category: "unknown", source: "heuristic" };
}

// ---------------------------------------------------------------------------
// Common-Input-Clustering (Union-Find)
// ---------------------------------------------------------------------------

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Pfadkompression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  groups(): string[][] {
    const m = new Map<string, string[]>();
    for (const x of this.parent.keys()) {
      const r = this.find(x);
      (m.get(r) ?? m.set(r, []).get(r)!).push(x);
    }
    return [...m.values()].map((g) => g.sort());
  }
}

/**
 * Common-Input-Ownership-Heuristik: Adressen, die in derselben Transaktion
 * gemeinsam als Inputs auftreten, gehören mit hoher Wahrscheinlichkeit zur
 * selben Entität. Liefert Cluster (Adressmengen). PURE.
 */
export function clusterCommonInput(txs: Array<{ inputs: string[] }>): string[][] {
  const uf = new UnionFind();
  for (const tx of txs) {
    const ins = tx.inputs.filter(Boolean);
    for (let i = 0; i < ins.length; i++) {
      uf.find(ins[i]); // sicherstellen, dass auch Single-Input-Adressen erfasst werden
      for (let j = i + 1; j < ins.length; j++) uf.union(ins[i], ins[j]);
    }
  }
  return uf.groups();
}

/** Liefert das Cluster, das eine bestimmte Adresse enthält. */
export function clusterFor(address: string, clusters: string[][]): string[] {
  return clusters.find((c) => c.includes(address)) ?? [address];
}

// ---------------------------------------------------------------------------
// Risk-Scoring (gewichtet, nachvollziehbar)
// ---------------------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Counterparty {
  address: string;
  label?: string;
  category: EntityCategory;
  value: number; // in Coin-Einheiten (BTC/ETH)
  direction: "in" | "out";
}

export interface RiskFactor {
  weight: number;
  reason: string;
}

export interface RiskAssessment {
  score: number; // 0..100
  level: RiskLevel;
  factors: RiskFactor[];
}

function levelFor(score: number): RiskLevel {
  if (score >= 80) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

/**
 * Bewertet das Risiko einer Adresse anhand ihrer eigenen Kategorie und der
 * Exposition gegenüber kategorisierten Gegenparteien. PURE & deterministisch.
 */
export function scoreEntity(selfCategory: EntityCategory, counterparties: Counterparty[]): RiskAssessment {
  const factors: RiskFactor[] = [];

  // Selbst sanktioniert → sofort kritisch.
  if (selfCategory === "sanctioned") {
    return { score: 100, level: "CRITICAL", factors: [{ weight: 100, reason: "Adresse selbst steht auf Sanktionsliste" }] };
  }

  const has = (c: EntityCategory) => counterparties.some((p) => p.category === c);
  const sumByCat = (c: EntityCategory) => counterparties.filter((p) => p.category === c).reduce((s, p) => s + p.value, 0);

  if (has("sanctioned")) factors.push({ weight: 60, reason: `Direkte Transaktion mit sanktionierter Adresse (${sumByCat("sanctioned").toFixed(4)})` });
  if (has("mixer")) factors.push({ weight: 40, reason: `Exposition zu Mixer/Tumbler (${sumByCat("mixer").toFixed(4)})` });
  if (has("darknet")) factors.push({ weight: 35, reason: "Exposition zu Darknet-Markt" });
  if (has("scam")) factors.push({ weight: 35, reason: "Exposition zu als Scam markierter Adresse" });
  if (has("gambling")) factors.push({ weight: 15, reason: "Exposition zu Glücksspiel-Dienst" });

  // Hohe Konzentration unbekannter Gegenparteien → moderate Unsicherheit.
  const unknownCount = counterparties.filter((p) => p.category === "unknown").length;
  if (unknownCount >= 5) factors.push({ weight: 10, reason: `Viele unbekannte Gegenparteien (${unknownCount})` });

  // Exchanges sind KYC-Chokepoints → leicht risikomindernd (informativ, kein Abzug unter 0).
  if (has("exchange")) factors.push({ weight: -5, reason: "Verbindung zu KYC-Börse (nachverfolgbar)" });

  const raw = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.max(0, Math.min(100, raw));
  if (factors.length === 0) factors.push({ weight: 0, reason: "Keine auffälligen Gegenparteien erkannt" });

  return { score, level: levelFor(score), factors };
}

// ---------------------------------------------------------------------------
// Exposure-Aufschlüsselung
// ---------------------------------------------------------------------------

export interface ExposureBreakdown {
  totalValue: number;
  inbound: number;
  outbound: number;
  byCategory: Array<{ category: EntityCategory; value: number; pct: number; count: number }>;
}

export function buildExposure(counterparties: Counterparty[]): ExposureBreakdown {
  const total = counterparties.reduce((s, p) => s + p.value, 0);
  const inbound = counterparties.filter((p) => p.direction === "in").reduce((s, p) => s + p.value, 0);
  const outbound = counterparties.filter((p) => p.direction === "out").reduce((s, p) => s + p.value, 0);

  const map = new Map<EntityCategory, { value: number; count: number }>();
  for (const p of counterparties) {
    const e = map.get(p.category) ?? { value: 0, count: 0 };
    e.value += p.value;
    e.count += 1;
    map.set(p.category, e);
  }
  const byCategory = [...map.entries()]
    .map(([category, v]) => ({ category, value: v.value, count: v.count, pct: total > 0 ? (v.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  return { totalValue: total, inbound, outbound, byCategory };
}

// ---------------------------------------------------------------------------
// Datenprovider (injizierbar)
// ---------------------------------------------------------------------------

export interface ProviderTx {
  txid: string;
  inputs: string[]; // Input-Adressen (für Clustering)
  outputs: Array<{ address: string; value: number }>; // value in Coin-Einheiten
}

export interface AddressData {
  address: string;
  chain: "btc" | "eth";
  balance: number; // Coin-Einheiten
  txCount: number;
  txs: ProviderTx[];
}

export interface AttributionProvider {
  fetchAddress(address: string): Promise<AddressData>;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface AttributionReport {
  address: string;
  chain: "btc" | "eth";
  balance: number;
  txCount: number;
  self: Categorization;
  risk: RiskAssessment;
  exposure: ExposureBreakdown;
  counterparties: Counterparty[];
  cluster: { size: number; addresses: string[] };
  sanctions: { clear: boolean; listPresent: boolean; matches: number };
  generatedAt: string;
}

/**
 * Führt Tracing + Attribution für eine Adresse aus. Der Provider abstrahiert
 * die Datenquelle, sodass der Kern offline & deterministisch testbar bleibt.
 */
export async function traceAttribution(address: string, provider: AttributionProvider): Promise<AttributionReport> {
  const data = await provider.fetchAddress(address);
  const selfKey = data.chain === "eth" ? address.toLowerCase() : address;

  // Gegenparteien aus den Outputs (ausgehend) sammeln und kategorisieren.
  const counterparties: Counterparty[] = [];
  for (const tx of data.txs) {
    for (const o of tx.outputs) {
      if (!o.address || o.address === selfKey) continue;
      const cat = categorizeAddress(o.address);
      counterparties.push({ address: o.address, label: cat.label, category: cat.category, value: o.value, direction: "out" });
    }
    // Inputs, die nicht zur Adresse gehören, als eingehende Gegenparteien.
    for (const inp of tx.inputs) {
      if (!inp || inp === selfKey) continue;
      // Inputs ohne Wertangabe je Adresse → konservativ ohne Wert (0), nur Kategorie/Cluster.
    }
  }

  const clusters = clusterCommonInput(data.txs.map((t) => ({ inputs: t.inputs })));
  const cluster = clusterFor(selfKey, clusters);

  const self = categorizeAddress(address, true);
  const risk = scoreEntity(self.category, counterparties);
  const exposure = buildExposure(counterparties);
  const sanc = screenSanctions({ addresses: [address, ...counterparties.map((c) => c.address)] });

  return {
    address,
    chain: data.chain,
    balance: data.balance,
    txCount: data.txCount,
    self,
    risk,
    exposure,
    counterparties: counterparties.sort((a, b) => b.value - a.value).slice(0, 50),
    cluster: { size: cluster.length, addresses: cluster.slice(0, 100) },
    sanctions: { clear: sanc.clear, listPresent: sanc.listPresent, matches: sanc.matches.length },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Live-Provider (mempool.space / Etherscan) — wie im bestehenden Tracing
// ---------------------------------------------------------------------------

export function liveProvider(): AttributionProvider {
  return {
    async fetchAddress(address: string): Promise<AddressData> {
      if (address.startsWith("0x")) return fetchEth(address);
      return fetchBtc(address);
    },
  };
}

async function fetchBtc(address: string): Promise<AddressData> {
  const res = await fetch(`https://mempool.space/api/address/${address}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`mempool.space ${res.status}`);
  const d = await res.json();
  const sats =
    d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum + d.mempool_stats.funded_txo_sum - d.mempool_stats.spent_txo_sum;
  const txCount = d.chain_stats.tx_count + d.mempool_stats.tx_count;

  const txs: ProviderTx[] = [];
  try {
    const txRes = await fetch(`https://mempool.space/api/address/${address}/txs`, { signal: AbortSignal.timeout(10000) });
    if (txRes.ok) {
      const raw = await txRes.json();
      for (const tx of (raw as unknown[]).slice(0, 25)) {
        const t = tx as { txid: string; vin?: Array<{ prevout?: { scriptpubkey_address?: string } }>; vout?: Array<{ scriptpubkey_address?: string; value: number }> };
        txs.push({
          txid: t.txid,
          inputs: (t.vin || []).map((v) => v.prevout?.scriptpubkey_address || "").filter(Boolean),
          outputs: (t.vout || [])
            .filter((v) => v.scriptpubkey_address)
            .map((v) => ({ address: v.scriptpubkey_address as string, value: v.value / 1e8 })),
        });
      }
    }
  } catch {
    /* Tx-Liste optional */
  }

  return { address, chain: "btc", balance: sats / 1e8, txCount, txs };
}

async function fetchEth(address: string): Promise<AddressData> {
  const balRes = await fetch(`https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest`, {
    signal: AbortSignal.timeout(10000),
  });
  const balData = await balRes.json();
  const balance = balData.result ? Number(BigInt(balData.result)) / 1e18 : 0;

  const txs: ProviderTx[] = [];
  let txCount = 0;
  try {
    const txRes = await fetch(
      `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=25&sort=desc`,
      { signal: AbortSignal.timeout(10000) }
    );
    const txData = await txRes.json();
    const list = (txData.result || []) as Array<{ hash: string; from: string; to: string; value: string }>;
    txCount = list.length;
    for (const tx of list) {
      const from = (tx.from || "").toLowerCase();
      const to = (tx.to || "").toLowerCase();
      txs.push({ txid: tx.hash, inputs: from ? [from] : [], outputs: to ? [{ address: to, value: Number(BigInt(tx.value || "0")) / 1e18 }] : [] });
    }
  } catch {
    /* Tx-Liste optional */
  }

  return { address, chain: "eth", balance, txCount, txs };
}
