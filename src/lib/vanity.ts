/**
 * Vanity-Adress-Generator (Bitcoin)
 * ==================================
 * Erzeugt neue Schlüsselpaare, bis die abgeleitete Adresse ein gewünschtes
 * Präfix trägt („Wunschadresse"). Liefert das vollständige Schlüsselmaterial
 * (Private Key HEX, WIF komprimiert/unkomprimiert, Public Key, Adresse).
 *
 * SICHERHEIT — nicht verhandelbar:
 * Die Schlüssel stammen ausschließlich aus `crypto.randomBytes` (CSPRNG).
 * Ein Vanity-Generator, der `Math.random()` oder einen abgeleiteten
 * Zähler benutzt, erzeugt vorhersagbare und damit wertlose bzw. gefährliche
 * Schlüssel. Jeder Kandidat wird zusätzlich gegen den gültigen
 * secp256k1-Skalarbereich [1, n-1] geprüft.
 *
 * Aufwand: Jedes zusätzliche Zeichen multipliziert die erwartete Anzahl
 * Versuche mit 58 (Base58 / Legacy + P2SH) bzw. 32 (Bech32). Lange Präfixe
 * werden praktisch unerreichbar — die UI weist den geschätzten Aufwand aus.
 */

import { randomBytes } from "crypto";
import {
  SECP256K1,
  mod,
  modInverse,
  pointAdd,
  getGenerator,
  publicKeyFromPrivate,
  encodePublicKey,
  publicKeyToP2PKH,
  publicKeyToP2SH,
  encodeWIF,
} from "./crypto-forensics/ec-engine";
import { hash160 } from "./crypto-forensics/bip143";
import { encodeSegwitAddress } from "./multisig";

export type VanityAddressType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh";

/** Base58 ohne die mehrdeutigen Zeichen 0, O, I, l. */
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Bech32-Zeichensatz (nur Kleinbuchstaben). */
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** Feste, technisch vorgegebene Anfänge je Adresstyp (Mainnet). */
export const FIXED_PREFIX: Record<VanityAddressType, string> = {
  p2pkh: "1",
  "p2sh-p2wpkh": "3",
  p2wpkh: "bc1q",
};

export interface PrefixValidation {
  ok: boolean;
  error?: string;
  /** Nur der frei wählbare Teil (ohne den technisch festen Anfang). */
  custom: string;
  /** Erwartete Anzahl Versuche (Erwartungswert). */
  expectedAttempts: number;
}

/**
 * Prüft ein Wunschpräfix gegen den Adresstyp und schätzt den Aufwand.
 * Das Präfix wird inklusive des festen Anfangs erwartet (z. B. "1Love").
 */
export function validatePrefix(
  type: VanityAddressType,
  prefix: string,
  caseSensitive = true
): PrefixValidation {
  const fixed = FIXED_PREFIX[type];
  const isBech32 = type === "p2wpkh";
  const p = isBech32 ? prefix.trim().toLowerCase() : prefix.trim();

  if (!p.startsWith(fixed)) {
    return { ok: false, error: `Präfix muss mit "${fixed}" beginnen.`, custom: "", expectedAttempts: 0 };
  }
  const custom = p.slice(fixed.length);
  if (custom.length === 0) {
    return { ok: false, error: "Bitte mindestens ein Zeichen nach dem festen Anfang angeben.", custom: "", expectedAttempts: 0 };
  }

  const alphabet = isBech32 ? BECH32 : BASE58;
  for (const ch of custom) {
    const probe = isBech32 || !caseSensitive ? ch.toLowerCase() : ch;
    const inAlphabet = isBech32
      ? alphabet.includes(probe)
      : alphabet.includes(ch) || (!caseSensitive && alphabet.toLowerCase().includes(probe));
    if (!inAlphabet) {
      return {
        ok: false,
        error: isBech32
          ? `Zeichen "${ch}" ist in Bech32 nicht erlaubt (gültig: ${BECH32}).`
          : `Zeichen "${ch}" ist in Base58 nicht erlaubt (0, O, I, l entfallen).`,
        custom,
        expectedAttempts: 0,
      };
    }
  }

  // Erwartungswert: Alphabetgröße^Länge. Bei Groß-/Kleinschreibung-Ignoranz
  // sind Buchstaben doppelt belegt → effektiv kleinerer Suchraum.
  const base = isBech32 ? 32 : caseSensitive ? 58 : 33; // 33 ≈ 58 abzgl. Doppelbelegung der 25 Buchstabenpaare
  const expectedAttempts = Math.pow(base, custom.length);
  return { ok: true, custom, expectedAttempts };
}

export interface VanityResult {
  type: VanityAddressType;
  prefix: string;
  address: string;
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  attempts: number;
  foundAt: string;
}

/** Leitet die gesuchte Adresse aus einem Public Key ab (nur der nötige Typ). */
function addressFor(type: VanityAddressType, pubCompressed: string): string {
  if (type === "p2pkh") return publicKeyToP2PKH(pubCompressed);
  if (type === "p2sh-p2wpkh") return publicKeyToP2SH(pubCompressed);
  return encodeSegwitAddress("bc", 0, hash160(Buffer.from(pubCompressed, "hex")));
}

/** Zieht einen kryptografisch sicheren, gültigen secp256k1-Skalar. */
function randomScalar(): bigint {
  for (;;) {
    const d = BigInt("0x" + randomBytes(32).toString("hex"));
    if (d > 0n && d < SECP256K1.n) return d;
  }
}

// ── Beschleunigter Suchkern ────────────────────────────────────────────────
//
// Naiv kostet jeder Versuch eine volle 256-Bit-Skalarmultiplikation
// (~384 Punktoperationen mit je einer teuren modularen Inversion) — das
// begrenzte die Rate auf wenige hundert Versuche/s.
//
// Stattdessen (Verfahren wie in vanitygen):
//   1. EINE Skalarmultiplikation je Block: P0 = d0·G mit zufälligem d0.
//   2. Danach nur noch Additionen P0 + j·G für j = 1..BATCH gegen eine
//      einmalig vorberechnete Tabelle der Vielfachen j·G. Diese Additionen
//      sind voneinander unabhängig und daher batch-invertierbar.
//   3. Batch-Inversion (Montgomery-Trick): statt BATCH modularer Inversionen
//      nur EINE, plus ~3·BATCH Multiplikationen.
// Der zugehörige private Schlüssel ist d0 + j.
//
// Sicherheit: Der Blockstart d0 stammt weiterhin aus `crypto.randomBytes`.
// Innerhalb eines Blocks sind die Schlüssel fortlaufend — das ist bei
// Vanity-Suchen Standard und unkritisch, solange nur der Treffer selbst
// herausgegeben wird und der Blockstart geheim bleibt. Wer maximale
// Konservativität braucht, kann BATCH auf 1 setzen (dann exakt der alte,
// langsame Pfad).
const BATCH = 1024;

/** Vorberechnete Tabelle j·G für j = 1..BATCH (einmalig, lazy). */
let gMultiples: { x: bigint; y: bigint }[] | null = null;
function generatorTable(): { x: bigint; y: bigint }[] {
  if (gMultiples) return gMultiples;
  const G = getGenerator();
  const tbl: { x: bigint; y: bigint }[] = [];
  let cur = G;
  for (let j = 1; j <= BATCH; j++) {
    tbl.push({ x: cur.x, y: cur.y });
    cur = pointAdd(cur, G);
  }
  gMultiples = tbl;
  return tbl;
}

/**
 * Montgomery-Batch-Inversion: invertiert alle Werte mit EINER modularen
 * Inversion statt n Stück (Präfixprodukte vorwärts, dann rückwärts auflösen).
 */
function batchInvert(vals: bigint[], p: bigint): bigint[] {
  const n = vals.length;
  const prefix: bigint[] = new Array(n);
  let acc = 1n;
  for (let i = 0; i < n; i++) {
    prefix[i] = acc;
    acc = mod(acc * vals[i], p);
  }
  let inv = modInverse(acc, p);
  const out: bigint[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = mod(prefix[i] * inv, p);
    inv = mod(inv * vals[i], p);
  }
  return out;
}

/**
 * Rechnet einen Block von BATCH Kandidaten durch und liefert den ersten
 * Treffer (oder null). `onAttempt` zählt die tatsächlich geprüften Kandidaten.
 */
function runBatch(
  type: VanityAddressType,
  prefix: string,
  caseSensitive: boolean,
  onAttempts: (n: number) => void
): { d: bigint; pub: string; address: string } | null {
  const p = SECP256K1.p;
  const tbl = generatorTable();
  const d0 = randomScalar();
  const P0 = publicKeyFromPrivate(d0); // einzige Skalarmultiplikation im Block

  // Nenner (x_j − x_P0) für alle unabhängigen Additionen sammeln …
  const dens: bigint[] = new Array(tbl.length);
  for (let j = 0; j < tbl.length; j++) dens[j] = mod(tbl[j].x - P0.x, p);
  // … und in einem Rutsch invertieren.
  const invs = batchInvert(dens, p);

  const needle = caseSensitive ? prefix : prefix.toLowerCase();

  for (let j = 0; j < tbl.length; j++) {
    // λ = (y_j − y_P0) · (x_j − x_P0)^(-1); x3 = λ² − x_P0 − x_j
    const lam = mod(mod(tbl[j].y - P0.y, p) * invs[j], p);
    const x3 = mod(lam * lam - P0.x - tbl[j].x, p);
    const y3 = mod(lam * (P0.x - x3) - P0.y, p);

    const pub = encodePublicKey({ x: x3, y: y3 }, true);
    const address = addressFor(type, pub);
    const cmp = caseSensitive ? address : address.toLowerCase();
    if (cmp.startsWith(needle)) {
      onAttempts(j + 1);
      const d = mod(d0 + BigInt(j + 1), SECP256K1.n);
      return { d, pub, address };
    }
  }
  onAttempts(tbl.length);
  return null;
}

// ── Hintergrund-Suche mit Fortschritt (Modul-global, wie pattern-scan) ──

export type VanityPhase = "idle" | "searching" | "found" | "stopped" | "error";

export interface VanityState {
  phase: VanityPhase;
  type: VanityAddressType;
  prefix: string;
  caseSensitive: boolean;
  attempts: number;
  expectedAttempts: number;
  startedAt: number;
  finishedAt?: number;
  result?: VanityResult;
  error?: string;
}

const g = global as unknown as { __forensVanity?: { state: VanityState | null; stop: boolean } };
if (!g.__forensVanity) g.__forensVanity = { state: null, stop: false };

export function getVanityState(): VanityState | null {
  return g.__forensVanity!.state;
}

export function requestVanityStop(): void {
  g.__forensVanity!.stop = true;
}

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/**
 * Startet die Suche im Hintergrund (nicht awaited). Wirft nur bei sofort
 * erkennbaren Vorbedingungsfehlern (läuft bereits / ungültiges Präfix).
 */
export function startVanitySearch(opts: {
  type: VanityAddressType;
  prefix: string;
  caseSensitive?: boolean;
}): void {
  const cur = g.__forensVanity!.state;
  if (cur && cur.phase === "searching") throw new Error("Es läuft bereits eine Suche.");

  const caseSensitive = opts.caseSensitive !== false;
  const v = validatePrefix(opts.type, opts.prefix, caseSensitive);
  if (!v.ok) throw new Error(v.error || "Ungültiges Präfix");

  const prefix = opts.type === "p2wpkh" ? opts.prefix.trim().toLowerCase() : opts.prefix.trim();

  g.__forensVanity!.stop = false;
  g.__forensVanity!.state = {
    phase: "searching",
    type: opts.type,
    prefix,
    caseSensitive,
    attempts: 0,
    expectedAttempts: v.expectedAttempts,
    startedAt: Date.now(),
  };

  void run(opts.type, prefix, caseSensitive);
}

async function run(type: VanityAddressType, prefix: string, caseSensitive: boolean) {
  const state = g.__forensVanity!.state!;
  try {
    for (;;) {
      if (g.__forensVanity!.stop) {
        state.phase = "stopped";
        state.finishedAt = Date.now();
        return;
      }
      // Einen Block rechnen, dann den Event-Loop freigeben, damit
      // Status-Abfragen und Stop-Wünsche bedient werden.
      const found = runBatch(type, prefix, caseSensitive, (n) => {
        state.attempts += n;
      });
      if (found) {
        const privateKeyHex = found.d.toString(16).padStart(64, "0");
        state.result = {
          type,
          prefix,
          address: found.address,
          privateKeyHex,
          wifCompressed: encodeWIF(privateKeyHex, true),
          wifUncompressed: encodeWIF(privateKeyHex, false),
          publicKeyCompressed: found.pub,
          attempts: state.attempts,
          foundAt: new Date().toISOString(),
        };
        state.phase = "found";
        state.finishedAt = Date.now();
        return;
      }
      await yieldToLoop();
    }
  } catch (e) {
    state.phase = "error";
    state.error = e instanceof Error ? e.message : String(e);
    state.finishedAt = Date.now();
  }
}
