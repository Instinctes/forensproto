/**
 * Chromaspace Lattice v1 (CL-1)
 * =============================
 * Research-Algorithmus: visuelles Gitter-Muster → secp256k1 Private Key.
 *
 * Zweck (ForensProto): Demonstration & Analyse von „Visual Brainwallets“ —
 * wie aus zeichnerischen Mustern (geringe Entropie, menschliche Symmetrie-
 * Vorlieben) deterministische Schlüssel entstehen und welche On-Chain-
 * Kollisions-/Nutzungsrisiken daraus folgen.
 *
 * Pipeline:
 *   1. Rasterisierung — Boustrophedon-Serialisierung der Zellen
 *   2. Topologie     — Komponenten, Dichte, Zentroid, H/V/D-Symmetrie
 *   3. Lattice-Mix   — 8 Runden Rule-90-CA + rotationsgebundene XOR-Faltung
 *   4. Domain-Absorb — multi-round SHA-256 mit Domain-Separator
 *   5. Scalar-Reduce — digest → [1, n−1] für secp256k1
 *
 * Deterministisch: gleiches Muster + Salt → gleicher Key.
 * Keine externen Krypto-Dependencies (Node crypto + bestehende EC-Engine).
 */

import { createHash, createHmac } from "crypto";
import {
  SECP256K1,
  publicKeyFromPrivate,
  encodePublicKey,
  publicKeyToP2PKH,
  publicKeyToP2SH,
  encodeWIF,
} from "./crypto-forensics/ec-engine";
import { hash160 } from "./crypto-forensics/bip143";
import { encodeSegwitAddress } from "./multisig";

// ─── Konstanten ─────────────────────────────────────────────────────────────

export const CL1_DOMAIN = "ForensProto/CL-1/v1";
export const CL1_VERSION = "1.0.0";
export const SUPPORTED_SIZES = [8, 12, 16] as const;
export type GridSize = (typeof SUPPORTED_SIZES)[number];

/** Zelle: 0 = leer, 1–3 = Intensität (farbige Pinselstufen). */
export type Cell = 0 | 1 | 2 | 3;

export interface VisualPattern {
  size: GridSize;
  /** row-major, length = size² */
  cells: Cell[];
  /** optionales Passphrase-Salt (z. B. Erinnerungs-Hinweis) */
  salt?: string;
}

export interface PatternFeatures {
  density: number;
  activeCells: number;
  components: number;
  centroidX: number;
  centroidY: number;
  symmetryH: number;
  symmetryV: number;
  symmetryD: number;
  /** Shannon-Entropie der Zellen (0–2 bit bei 4 Zuständen) */
  shannonBits: number;
  /** geschätzte Muster-Entropie (Aktiv-Bits + Topologie-Bonus, capped) */
  estimatedEntropyBits: number;
}

export interface VisualKeyResult {
  algorithm: "CL-1";
  version: string;
  patternFingerprint: string;
  features: PatternFeatures;
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  publicKeyUncompressed: string;
  addresses: {
    p2pkh: string;
    p2pkhUncompressed: string;
    p2shP2wpkh: string;
    p2wpkh: string;
  };
  warnings: string[];
}

// ─── Validierung ────────────────────────────────────────────────────────────

export function isGridSize(n: number): n is GridSize {
  return (SUPPORTED_SIZES as readonly number[]).includes(n);
}

export function normalizePattern(input: {
  size: number;
  cells: number[];
  salt?: string;
}): VisualPattern {
  if (!isGridSize(input.size)) {
    throw new Error(`Ungültige Grid-Größe (erlaubt: ${SUPPORTED_SIZES.join(", ")})`);
  }
  const expected = input.size * input.size;
  if (!Array.isArray(input.cells) || input.cells.length !== expected) {
    throw new Error(`cells muss Länge ${expected} haben`);
  }
  const cells: Cell[] = input.cells.map((c) => {
    const v = Math.max(0, Math.min(3, Math.floor(Number(c) || 0))) as Cell;
    return v;
  });
  if (!cells.some((c) => c > 0)) {
    throw new Error("Muster ist leer — mindestens eine Zelle aktivieren");
  }
  return {
    size: input.size,
    cells,
    salt: input.salt?.trim() || undefined,
  };
}

// ─── Serialisierung ─────────────────────────────────────────────────────────

/** Boustrophedon (Schlangenlinien): gerade Zeilen L→R, ungerade R→L. */
export function serializeBoustrophedon(size: number, cells: Cell[]): number[] {
  const out: number[] = [];
  for (let y = 0; y < size; y++) {
    if (y % 2 === 0) {
      for (let x = 0; x < size; x++) out.push(cells[y * size + x]);
    } else {
      for (let x = size - 1; x >= 0; x--) out.push(cells[y * size + x]);
    }
  }
  return out;
}

/** 2 Bit pro Zelle → Bitstring-Bytes (MSB first innerhalb 4er-Packs). */
function packCells(stream: number[]): Buffer {
  const bits: number[] = [];
  for (const c of stream) {
    bits.push((c >> 1) & 1, c & 1);
  }
  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
  }
  return bytes;
}

// ─── Topologie ──────────────────────────────────────────────────────────────

function neighbors4(size: number, i: number): number[] {
  const x = i % size;
  const y = (i / size) | 0;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < size - 1) out.push(i + 1);
  if (y > 0) out.push(i - size);
  if (y < size - 1) out.push(i + size);
  return out;
}

export function extractFeatures(size: number, cells: Cell[]): PatternFeatures {
  const n = size * size;
  const activeCells = cells.filter((c) => c > 0).length;
  const density = activeCells / n;

  // Connected components (4-connected, any intensity > 0)
  const seen = new Uint8Array(n);
  let components = 0;
  for (let i = 0; i < n; i++) {
    if (cells[i] === 0 || seen[i]) continue;
    components++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of neighbors4(size, cur)) {
        if (!seen[nb] && cells[nb] > 0) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
  }

  let sumX = 0;
  let sumY = 0;
  let sumW = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w = cells[y * size + x];
      if (w > 0) {
        sumX += x * w;
        sumY += y * w;
        sumW += w;
      }
    }
  }
  const centroidX = sumW > 0 ? sumX / sumW / (size - 1 || 1) : 0.5;
  const centroidY = sumW > 0 ? sumY / sumW / (size - 1 || 1) : 0.5;

  let matchH = 0;
  let matchV = 0;
  let matchD = 0;
  let pairs = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = cells[y * size + x];
      const h = cells[y * size + (size - 1 - x)];
      const v = cells[(size - 1 - y) * size + x];
      const d = cells[x * size + y]; // main diagonal reflection (transpose)
      if (a === h) matchH++;
      if (a === v) matchV++;
      if (a === d) matchD++;
      pairs++;
    }
  }
  const symmetryH = matchH / pairs;
  const symmetryV = matchV / pairs;
  const symmetryD = matchD / pairs;

  // Shannon over 4-state alphabet
  const hist = [0, 0, 0, 0];
  for (const c of cells) hist[c]++;
  let shannonBits = 0;
  for (const h of hist) {
    if (h === 0) continue;
    const p = h / n;
    shannonBits -= p * Math.log2(p);
  }

  // Heuristic usable entropy: active cells * ~1.5 bit + intensity + topology
  // (intentionally conservative for research warnings)
  const intensityBonus = cells.reduce((s: number, c) => s + (c > 1 ? 0.5 : 0), 0);
  const topoBonus = Math.min(8, components * 1.2);
  const symmetryPenalty =
    (symmetryH + symmetryV + symmetryD) / 3 > 0.85 ? 4 : 0;
  const estimatedEntropyBits = Math.max(
    1,
    Math.min(
      128,
      activeCells * 1.5 + intensityBonus + topoBonus - symmetryPenalty
    )
  );

  return {
    density: round4(density),
    activeCells,
    components,
    centroidX: round4(centroidX),
    centroidY: round4(centroidY),
    symmetryH: round4(symmetryH),
    symmetryV: round4(symmetryV),
    symmetryD: round4(symmetryD),
    shannonBits: round4(shannonBits),
    estimatedEntropyBits: round4(estimatedEntropyBits),
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Lattice-Mix (Rule 90 CA + feature binding) ─────────────────────────────

/** Elementary CA Rule 90: next[i] = left XOR right (on a bit ring). */
function rule90Step(bits: Uint8Array): Uint8Array {
  const n = bits.length;
  const next = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const L = bits[(i - 1 + n) % n];
    const R = bits[(i + 1) % n];
    next[i] = L ^ R;
  }
  return next;
}

function bitsFromBuffer(buf: Buffer): Uint8Array {
  const bits = new Uint8Array(buf.length * 8);
  for (let i = 0; i < buf.length; i++) {
    for (let b = 0; b < 8; b++) {
      bits[i * 8 + b] = (buf[i] >> (7 - b)) & 1;
    }
  }
  return bits;
}

function bufferFromBits(bits: Uint8Array): Buffer {
  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
  }
  return bytes;
}

function rotateLeft(buf: Buffer, bits: number): Buffer {
  if (buf.length === 0) return buf;
  const total = buf.length * 8;
  const k = ((bits % total) + total) % total;
  const src = bitsFromBuffer(buf);
  const dst = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    dst[i] = src[(i + k) % src.length];
  }
  return bufferFromBits(dst);
}

function featureBlob(f: PatternFeatures): Buffer {
  const parts = [
    f.density,
    f.activeCells,
    f.components,
    f.centroidX,
    f.centroidY,
    f.symmetryH,
    f.symmetryV,
    f.symmetryD,
    f.shannonBits,
  ];
  const buf = Buffer.alloc(parts.length * 8);
  for (let i = 0; i < parts.length; i++) {
    buf.writeDoubleBE(parts[i], i * 8);
  }
  return buf;
}

/**
 * 8 Runden Lattice-Mix:
 *   state₀ = SHA256(domain || packed_pattern || salt)
 *   state_{r+1} = SHA256( state_r || Rule90⁸(state_r) || rot(features, r·7) || r )
 */
function latticeMix(packed: Buffer, salt: string, features: PatternFeatures): Buffer {
  const saltBuf = Buffer.from(salt || "", "utf8");
  const feat = featureBlob(features);

  let state = createHash("sha256")
    .update(CL1_DOMAIN)
    .update(Buffer.from([0x01]))
    .update(packed)
    .update(Buffer.from([0x02]))
    .update(saltBuf)
    .digest();

  for (let r = 0; r < 8; r++) {
    let caBits = bitsFromBuffer(state);
    for (let s = 0; s < 8; s++) caBits = rule90Step(caBits);
    const ca = bufferFromBits(caBits);
    const rotFeat = rotateLeft(feat, r * 7 + 3);

    state = createHash("sha256")
      .update(state)
      .update(Buffer.from([0x10 + r]))
      .update(ca)
      .update(rotFeat)
      .update(Buffer.from([r]))
      .digest();
  }

  // Final domain-separated extract (HMAC-SHA256 style)
  return createHmac("sha256", state)
    .update(CL1_DOMAIN)
    .update("|scalar")
    .update(packed)
    .digest();
}

// ─── Scalar + Addresses ─────────────────────────────────────────────────────

function digestToScalar(digest: Buffer): bigint {
  const x = BigInt("0x" + digest.toString("hex"));
  const n = SECP256K1.n;
  // Map uniformly into [1, n-1]
  return (x % (n - 1n)) + 1n;
}

function privateKeyHex(scalar: bigint): string {
  return scalar.toString(16).padStart(64, "0");
}

function publicKeyToP2WPKH(pubKeyHex: string): string {
  const h = hash160(Buffer.from(pubKeyHex, "hex"));
  return encodeSegwitAddress("bc", 0, h);
}

export function patternFingerprint(pattern: VisualPattern): string {
  const packed = packCells(serializeBoustrophedon(pattern.size, pattern.cells));
  return createHash("sha256")
    .update(CL1_DOMAIN)
    .update("|fp")
    .update(Buffer.from([pattern.size]))
    .update(packed)
    .update(Buffer.from(pattern.salt || "", "utf8"))
    .digest("hex")
    .slice(0, 16);
}

export function deriveVisualKey(raw: {
  size: number;
  cells: number[];
  salt?: string;
}): VisualKeyResult {
  const pattern = normalizePattern(raw);
  const features = extractFeatures(pattern.size, pattern.cells);
  const stream = serializeBoustrophedon(pattern.size, pattern.cells);
  const packed = packCells(stream);
  const digest = latticeMix(packed, pattern.salt || "", features);
  const scalar = digestToScalar(digest);
  const pkHex = privateKeyHex(scalar);

  const point = publicKeyFromPrivate(scalar);
  const pubC = encodePublicKey(point, true);
  const pubU = encodePublicKey(point, false);

  const warnings: string[] = [
    "Nur für legale Forschungs-/Forensik-Zwecke. Visual Keys sind oft niedrig-entropisch.",
  ];
  if (features.estimatedEntropyBits < 40) {
    warnings.push(
      `Geschätzte Muster-Entropie ~${features.estimatedEntropyBits} bit — leicht brute-forcebar.`
    );
  }
  if ((features.symmetryH + features.symmetryV + features.symmetryD) / 3 > 0.9) {
    warnings.push("Hohe Symmetrie reduziert den effektiven Suchraum.");
  }
  if (features.activeCells < 4) {
    warnings.push("Sehr sparsames Muster — Kollisionsrisiko bei naiven Varianten.");
  }

  return {
    algorithm: "CL-1",
    version: CL1_VERSION,
    patternFingerprint: patternFingerprint(pattern),
    features,
    privateKeyHex: pkHex,
    wifCompressed: encodeWIF(pkHex, true),
    wifUncompressed: encodeWIF(pkHex, false),
    publicKeyCompressed: pubC,
    publicKeyUncompressed: pubU,
    addresses: {
      p2pkh: publicKeyToP2PKH(pubC),
      p2pkhUncompressed: publicKeyToP2PKH(pubU),
      p2shP2wpkh: publicKeyToP2SH(pubC),
      p2wpkh: publicKeyToP2WPKH(pubC),
    },
    warnings,
  };
}

// ─── Presets (Forschung / UI) ───────────────────────────────────────────────

/**
 * Leitet Adressen/WIF direkt aus einem vom Nutzer eingegebenen rohen
 * HEX-Private-Key ab (Modus „Visualize my own HEX private key"). Anders als
 * deriveVisualKey wird hier NICHTS aus einem Muster erzeugt — der Schlüssel
 * kommt unverändert vom Nutzer, wir berechnen nur die zugehörigen Adressen.
 *
 * Validierung: exakt 64 Hex-Zeichen (256 bit) und Skalar im gültigen
 * secp256k1-Bereich [1, n-1]. Wirft bei ungültiger Eingabe.
 */
export function addressesFromPrivateHex(hexInput: string): {
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  publicKeyUncompressed: string;
  addresses: { p2pkh: string; p2pkhUncompressed: string; p2shP2wpkh: string; p2wpkh: string };
} {
  const hex = hexInput.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("Private Key muss genau 64 Hex-Zeichen (256 bit) sein.");
  }
  const scalar = BigInt("0x" + hex);
  if (scalar < 1n || scalar >= SECP256K1.n) {
    throw new Error("Private Key liegt außerhalb des gültigen secp256k1-Bereichs [1, n-1].");
  }
  const pkHex = scalar.toString(16).padStart(64, "0");
  const point = publicKeyFromPrivate(scalar);
  const pubC = encodePublicKey(point, true);
  const pubU = encodePublicKey(point, false);
  return {
    privateKeyHex: pkHex,
    wifCompressed: encodeWIF(pkHex, true),
    wifUncompressed: encodeWIF(pkHex, false),
    publicKeyCompressed: pubC,
    publicKeyUncompressed: pubU,
    addresses: {
      p2pkh: publicKeyToP2PKH(pubC),
      p2pkhUncompressed: publicKeyToP2PKH(pubU),
      p2shP2wpkh: publicKeyToP2SH(pubC),
      p2wpkh: publicKeyToP2WPKH(pubC),
    },
  };
}

export function emptyGrid(size: GridSize): Cell[] {
  return Array(size * size).fill(0) as Cell[];
}

export function presetPattern(
  name: "checker" | "diamond" | "spiral" | "cross" | "random" | "smile",
  size: GridSize,
  intensity: Cell = 2
): Cell[] {
  const cells = emptyGrid(size);
  const set = (x: number, y: number, v: Cell = intensity) => {
    if (x >= 0 && x < size && y >= 0 && y < size) cells[y * size + x] = v;
  };

  if (name === "checker") {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if ((x + y) % 2 === 0) set(x, y);
  } else if (name === "diamond") {
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (Math.abs(x - c) + Math.abs(y - c) <= size / 3) set(x, y);
  } else if (name === "cross") {
    const m = (size / 2) | 0;
    for (let i = 0; i < size; i++) {
      set(m, i);
      set(i, m);
    }
  } else if (name === "spiral") {
    let x = 0,
      y = 0,
      dx = 1,
      dy = 0;
    const visited = new Set<string>();
    for (let i = 0; i < size * size; i++) {
      if (i % 2 === 0) set(x, y, ((i % 3) + 1) as Cell);
      visited.add(`${x},${y}`);
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || visited.has(`${nx},${ny}`)) {
        const t = dx;
        dx = -dy;
        dy = t;
      }
      x += dx;
      y += dy;
    }
  } else if (name === "smile") {
    // simple face for demos
    const e1x = Math.floor(size * 0.3),
      e2x = Math.floor(size * 0.7),
      ey = Math.floor(size * 0.35);
    set(e1x, ey, 3);
    set(e2x, ey, 3);
    const my = Math.floor(size * 0.65);
    for (let x = Math.floor(size * 0.25); x <= Math.floor(size * 0.75); x++) {
      const dy = Math.abs(x - size / 2) > size * 0.2 ? 1 : 0;
      set(x, my + dy, 2);
    }
  } else if (name === "random") {
    for (let i = 0; i < cells.length; i++) {
      if (Math.random() < 0.35) cells[i] = ((Math.random() * 3) | 0) + 1 as Cell;
    }
  }
  return cells;
}
