/**
 * Module H — Signatur-Analyse
 *
 * DER-Parsing, r/s-Extraktion, Malleability-Check, BIP-62 Konformität.
 * Rein analytisch — keine Signatur-Manipulation.
 */

import { SECP256K1 } from "./ec-engine";
import type { ECDSASignature, SignatureAnalysis, SignaturePattern } from "./types";

// ============================================================================
// DER-Parsing
// ============================================================================

export function parseDERSignature(hex: string): ECDSASignature {
  const bytes = Buffer.from(hex, "hex");

  if (bytes.length < 8) {
    throw new Error("Signatur zu kurz für DER-Format");
  }

  let offset = 0;

  // Compound header
  if (bytes[offset] !== 0x30) {
    throw new Error(`Erwartetes DER SEQUENCE Tag 0x30, erhalten: 0x${bytes[offset].toString(16)}`);
  }
  offset++;

  // const totalLength = bytes[offset];
  offset++;

  // R-Wert
  if (bytes[offset] !== 0x02) {
    throw new Error(`Erwartetes DER INTEGER Tag 0x02 für r, erhalten: 0x${bytes[offset].toString(16)}`);
  }
  offset++;

  const rLength = bytes[offset];
  offset++;
  const rBytes = bytes.subarray(offset, offset + rLength);
  offset += rLength;

  // S-Wert
  if (bytes[offset] !== 0x02) {
    throw new Error(`Erwartetes DER INTEGER Tag 0x02 für s, erhalten: 0x${bytes[offset].toString(16)}`);
  }
  offset++;

  const sLength = bytes[offset];
  offset++;
  const sBytes = bytes.subarray(offset, offset + sLength);

  // Parse BigInt Werte (DER Integers sind signed, führende 0x00 bei positiven Werten)
  const r = BigInt("0x" + rBytes.toString("hex"));
  const s = BigInt("0x" + sBytes.toString("hex"));

  return {
    r,
    s,
    derEncoded: hex,
    rawHex: `${r.toString(16).padStart(64, "0")}${s.toString(16).padStart(64, "0")}`,
  };
}

export function parseRawSignature(hex: string): ECDSASignature {
  if (hex.length !== 128) {
    throw new Error("Raw Signatur muss exakt 128 Hex-Zeichen lang sein (64 Bytes)");
  }

  const r = BigInt("0x" + hex.slice(0, 64));
  const s = BigInt("0x" + hex.slice(64, 128));

  return {
    r,
    s,
    derEncoded: encodeToDER(r, s),
    rawHex: hex,
  };
}

function encodeToDER(r: bigint, s: bigint): string {
  const rHex = r.toString(16).padStart(64, "0");
  const sHex = s.toString(16).padStart(64, "0");

  // Entferne führende Nullen, füge 0x00 Prefix wenn höchstes Bit gesetzt
  const encodeInt = (h: string): string => {
    let clean = h.replace(/^0+/, "") || "0";
    if (clean.length % 2 !== 0) clean = "0" + clean;
    if (parseInt(clean[0], 16) >= 8) clean = "00" + clean;
    const len = (clean.length / 2).toString(16).padStart(2, "0");
    return "02" + len + clean;
  };

  const rDer = encodeInt(rHex);
  const sDer = encodeInt(sHex);
  const inner = rDer + sDer;
  const totalLen = (inner.length / 2).toString(16).padStart(2, "0");

  return "30" + totalLen + inner;
}

// ============================================================================
// Signatur-Analyse
// ============================================================================

export function analyzeSignature(sig: ECDSASignature): SignatureAnalysis {
  const n = SECP256K1.n;
  const halfN = n / 2n;

  const patterns: SignaturePattern[] = [];

  // Range-Validierung
  const validRange = sig.r > 0n && sig.r < n && sig.s > 0n && sig.s < n;

  // Low-S Check (BIP-62)
  const isLowS = sig.s <= halfN;

  // Malleability: Wenn s > n/2, kann (r, n-s) auch gültig sein
  const malleabilityRisk = !isLowS;

  // Bit-Längen
  const rBitLength = sig.r.toString(2).length;
  const sBitLength = sig.s.toString(2).length;

  // DER-Validierung
  let validDER = true;
  try {
    parseDERSignature(sig.derEncoded);
  } catch {
    validDER = false;
  }

  // Pattern-Erkennung
  // 1. Niedrige Entropy in r (könnte auf schwache Nonce hindeuten)
  if (rBitLength < 200) {
    patterns.push({
      type: "low_entropy_r",
      description: `r-Wert hat nur ${rBitLength} Bits (erwartet: ~256). Möglicherweise schwache Nonce-Generierung.`,
    });
  }

  // 2. Kleiner s-Wert
  if (sBitLength < 200) {
    patterns.push({
      type: "small_s",
      description: `s-Wert hat nur ${sBitLength} Bits. Ungewöhnlich niedrig.`,
    });
  }

  // 3. r == 1 oder s == 1 (bekannt schwache Nonce)
  if (sig.r === 1n || sig.s === 1n) {
    patterns.push({
      type: "known_weak_nonce",
      description: "r oder s hat den Wert 1 — deutet auf triviale Nonce hin.",
    });
  }

  return {
    signature: sig,
    validDER,
    validRange,
    isLowS,
    malleabilityRisk,
    rBitLength,
    sBitLength,
    patterns,
  };
}

// ============================================================================
// Batch-Signatur-Analyse
// ============================================================================

export function analyzeSignatures(signatures: ECDSASignature[]): SignatureAnalysis[] {
  const analyses = signatures.map(analyzeSignature);

  // r-Wert Reuse Detection über alle Signaturen
  const rCounts = new Map<string, number[]>();
  signatures.forEach((sig, idx) => {
    const rHex = sig.r.toString(16);
    const indices = rCounts.get(rHex) || [];
    indices.push(idx);
    rCounts.set(rHex, indices);
  });

  for (const [rHex, indices] of rCounts) {
    if (indices.length > 1) {
      for (const idx of indices) {
        analyses[idx].patterns.push({
          type: "repeated_r",
          description: `r-Wert ${rHex.slice(0, 16)}... wird in ${indices.length} Signaturen verwendet. NONCE REUSE DETEKTIERT!`,
          count: indices.length,
        });
      }
    }
  }

  return analyses;
}

// ============================================================================
// Auto-Detect und Parse
// ============================================================================

export function parseSignatureAuto(hex: string): ECDSASignature {
  const clean = hex.replace(/\s+/g, "").toLowerCase();

  if (clean.startsWith("30")) {
    return parseDERSignature(clean);
  }

  if (clean.length === 128) {
    return parseRawSignature(clean);
  }

  throw new Error(
    "Unbekanntes Signaturformat. Erwartet: DER-codiert (beginnt mit 30) oder Raw r||s (128 Hex-Zeichen)."
  );
}
