/**
 * Module H — Wallet Deep-Scan API (vollautomatisch)
 *
 * Workflow:
 *   1. Wallet-Struktur & Authentizität (Berkeley DB, MKey, CKeys)
 *   2. Key-Struktur-Analyse aller extrahierten ckeys
 *   3. DER-Signatur-Scan im Binary
 *   4. Entropy-Analyse
 *   5. Nonce-Reuse-Scan auf gefundenen Signaturen
 *   6. Blockchain-Auto-Fetch: Für jede Adresse → Blockstream API
 *      → Raw-TX parsen → SIGHASH_ALL berechnen → z-Werte gewinnen
 *   7. Private-Key-Recovery falls Nonce-Reuse + z-Werte vorhanden
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { WalletParser } from "@/lib/forensics/wallet-parser";
import { analyzeKeyStructure } from "@/lib/crypto-forensics/key-structure-analyzer";
import {
  parseSignatureAuto,
  analyzeSignature,
  analyzeSignatures,
} from "@/lib/crypto-forensics/signature-analyzer";
import { analyzeEntropy } from "@/lib/crypto-forensics/statistical-analyzer";
import { analyzeNonces } from "@/lib/crypto-forensics/nonce-analyzer";
import {
  parseBitcoinTx,
  computeSigHashAll,
  extractP2PKHSig,
  p2pkhScriptCodeFromPubkey,
} from "@/lib/crypto-forensics/bitcoin-tx-parser";
import type { ECDSASignature, SignatureAnalysis } from "@/lib/crypto-forensics/types";

// ============================================================================
// Blockstream API Helpers
// ============================================================================

const BS_API = "https://blockstream.info/api";
const FETCH_TIMEOUT = 8000;

async function bsFetch(url: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    headers: { "User-Agent": "ForensProto/WalletScan/1.0" },
  });
}

async function fetchTxsForAddress(address: string): Promise<{ txid: string }[]> {
  try {
    const res = await bsFetch(`${BS_API}/address/${address}/txs`);
    if (!res.ok) return [];
    return (await res.json()) as { txid: string }[];
  } catch {
    return [];
  }
}

async function fetchRawTxHex(txid: string): Promise<string | null> {
  try {
    const res = await bsFetch(`${BS_API}/tx/${txid}/hex`);
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

// ============================================================================
// Blockchain-basierte Signatur + z-Wert Extraktion
// ============================================================================

export interface RecoveredSig {
  txid: string;
  inputIndex: number;
  address: string;
  pubkeyHex: string;
  rHex: string;
  sHex: string;
  zHex: string; // SIGHASH_ALL
  derHex: string;
}

/**
 * Für eine gegebene Adresse + Pubkey:
 * Fetcht alle zugehörigen Transaktionen von Blockstream,
 * parst ihre Inputs und berechnet SIGHASH_ALL.
 * Gibt vollständige (r, s, z) Tupel zurück.
 */
async function fetchSignaturesForAddress(
  address: string,
  pubkeyHex: string
): Promise<RecoveredSig[]> {
  const results: RecoveredSig[] = [];

  const txList = await fetchTxsForAddress(address);
  if (!txList.length) return results;

  // Maximal 10 Transaktionen pro Adresse scannen
  const txsToCheck = txList.slice(0, 10);

  for (const { txid } of txsToCheck) {
    const rawHex = await fetchRawTxHex(txid);
    if (!rawHex) continue;

    let tx;
    try {
      tx = parseBitcoinTx(rawHex);
    } catch {
      continue;
    }

    // Jeden Input prüfen
    for (let i = 0; i < tx.inputs.length; i++) {
      const inp = tx.inputs[i];
      if (!inp.scriptSig || inp.scriptSig.length < 10) continue;

      const extracted = extractP2PKHSig(inp.scriptSig);
      if (!extracted) continue;

      // Prüfe ob der Pubkey zu unserer Adresse gehört
      if (
        extracted.pubkeyHex.toLowerCase() !== pubkeyHex.toLowerCase() &&
        // Auch komprimierte vs. unkomprimierte Variante erlauben (Länge unterschiedlich)
        !(pubkeyHex.startsWith("04") && extracted.pubkeyHex.length === 66) &&
        !(pubkeyHex.startsWith("02") || pubkeyHex.startsWith("03")) &&
        extracted.pubkeyHex.length !== pubkeyHex.length
      ) {
        // Strikte Prüfung: Pubkey muss übereinstimmen
        if (extracted.pubkeyHex.toLowerCase() !== pubkeyHex.toLowerCase()) continue;
      }

      // SIGHASH_ALL berechnen — scriptCode aus Pubkey ableiten
      let scriptCode: string;
      try {
        scriptCode = p2pkhScriptCodeFromPubkey(extracted.pubkeyHex);
      } catch {
        continue;
      }

      let zHex: string;
      try {
        zHex = computeSigHashAll(tx, i, scriptCode);
      } catch {
        continue;
      }

      results.push({
        txid,
        inputIndex: i,
        address,
        pubkeyHex: extracted.pubkeyHex,
        rHex: extracted.rHex,
        sHex: extracted.sHex,
        zHex,
        derHex: extracted.derHex,
      });
    }
  }

  return results;
}

// ============================================================================
// POST Handler
// ============================================================================

export async function POST(request: NextRequest) {
  let tempFilePath = "";

  try {
    const formData = await request.formData();
    const file = formData.get("wallet") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Keine Wallet-Datei hochgeladen" },
        { status: 400 }
      );
    }

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Datei zu groß (max. 100 MB)" },
        { status: 413 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "af-wallet-scan-"));
    tempFilePath = path.join(tempDir, file.name || "wallet.dat");
    await fs.writeFile(tempFilePath, buffer);

    const analysisId = `WS-${Date.now().toString(36).toUpperCase()}`;
    const startTime = Date.now();

    // ═══════════════════════════════════════════════════════════════
    // Phase 1: Wallet-Struktur-Parsing
    // ═══════════════════════════════════════════════════════════════
    const walletMeta = await WalletParser.parse(buffer);

    // ═══════════════════════════════════════════════════════════════
    // Phase 2: Key-Struktur-Analyse
    // ═══════════════════════════════════════════════════════════════
    const keyAnalyses = walletMeta.ckeys.map((ck) => {
      try {
        return {
          publicKey: ck.publicKey,
          address: ck.address,
          encrypted: ck.encrypted.slice(0, 32) + "...",
          analysis: analyzeKeyStructure(ck.publicKey),
        };
      } catch (err) {
        return {
          publicKey: ck.publicKey,
          address: ck.address,
          encrypted: ck.encrypted.slice(0, 32) + "...",
          error: err instanceof Error ? err.message : "Key-Analyse fehlgeschlagen",
        };
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Phase 3: DER-Signatur-Scan im Binary
    // ═══════════════════════════════════════════════════════════════
    const foundSigs: ECDSASignature[] = [];
    const sigLocations: Array<{ offset: number; hex: string }> = [];

    for (let i = 0; i < buffer.length - 70; i++) {
      if (buffer[i] === 0x30) {
        const totalLen = buffer[i + 1];
        if (totalLen >= 0x40 && totalLen <= 0x48 && buffer[i + 2] === 0x02) {
          const sigBytes = buffer.subarray(i, i + totalLen + 2);
          const sigHex = sigBytes.toString("hex");
          try {
            const parsed = parseSignatureAuto(sigHex);
            if (parsed.r > 0n && parsed.s > 0n) {
              foundSigs.push(parsed);
              sigLocations.push({ offset: i, hex: sigHex });
              i += totalLen + 1;
            }
          } catch {
            /* skip */
          }
        }
      }
    }

    let signatureAnalyses: SignatureAnalysis[] = [];
    if (foundSigs.length > 1) {
      signatureAnalyses = analyzeSignatures(foundSigs);
    } else if (foundSigs.length === 1) {
      signatureAnalyses = [analyzeSignature(foundSigs[0])];
    }

    const serializedSigAnalyses = signatureAnalyses.map((sa, idx) => ({
      index: idx,
      offset: sigLocations[idx]?.offset || 0,
      hex: sigLocations[idx]?.hex || "",
      validDER: sa.validDER,
      validRange: sa.validRange,
      isLowS: sa.isLowS,
      malleabilityRisk: sa.malleabilityRisk,
      rBitLength: sa.rBitLength,
      sBitLength: sa.sBitLength,
      r: sa.signature.r.toString(16),
      s: sa.signature.s.toString(16),
      patterns: sa.patterns,
    }));

    // ═══════════════════════════════════════════════════════════════
    // Phase 4: Entropy-Analyse
    // ═══════════════════════════════════════════════════════════════
    const hexData = buffer.toString("hex");
    const sampleHex = hexData.slice(0, 131072);

    let walletEntropyResult = null;
    try { walletEntropyResult = analyzeEntropy(sampleHex); } catch { /* skip */ }

    let mkeyEntropyResult = null;
    if (walletMeta.mkey?.encrypted) {
      try { mkeyEntropyResult = analyzeEntropy(walletMeta.mkey.encrypted); } catch { /* skip */ }
    }

    let saltEntropyResult = null;
    if (walletMeta.mkey?.salt) {
      try { saltEntropyResult = analyzeEntropy(walletMeta.mkey.salt); } catch { /* skip */ }
    }

    // ═══════════════════════════════════════════════════════════════
    // Phase 5: Nonce-Reuse-Scan (nur auf Binary-Sigs, ohne z-Werte)
    // ═══════════════════════════════════════════════════════════════
    let binaryNonceResult = null;
    if (foundSigs.length >= 2) {
      try {
        binaryNonceResult = analyzeNonces(foundSigs);
      } catch {
        binaryNonceResult = null;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Phase 6: Blockchain-Auto-Fetch → z-Werte → Key-Recovery
    // ═══════════════════════════════════════════════════════════════

    // Maximal 10 Adressen scannen (API-Limits)
    const addressesToScan = walletMeta.ckeys.slice(0, 10);
    const allBlockchainSigs: RecoveredSig[] = [];
    const blockchainFetchLog: string[] = [];

    for (const ck of addressesToScan) {
      if (!ck.address || !ck.publicKey) continue;
      try {
        const sigs = await fetchSignaturesForAddress(ck.address, ck.publicKey);
        if (sigs.length > 0) {
          allBlockchainSigs.push(...sigs);
          blockchainFetchLog.push(
            `✓ ${ck.address}: ${sigs.length} Signatur(en) mit z-Wert extrahiert`
          );
        } else {
          blockchainFetchLog.push(`○ ${ck.address}: Keine Transaktionen / nicht P2PKH`);
        }
      } catch (err) {
        blockchainFetchLog.push(
          `✗ ${ck.address}: Fetch-Fehler — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Konvertiere Blockchain-Sigs in ECDSASignature[] + string[] z-Werte
    const blockchainECDSASigs: ECDSASignature[] = allBlockchainSigs.map((sig) => {
      const r = BigInt("0x" + sig.rHex.replace(/^0+/, "") || "0");
      const s = BigInt("0x" + sig.sHex.replace(/^0+/, "") || "0");
      return {
        r,
        s,
        derEncoded: sig.derHex,
        rawHex: sig.rHex.padStart(64, "0") + sig.sHex.padStart(64, "0"),
      };
    });

    const blockchainZValues: string[] = allBlockchainSigs.map((sig) => sig.zHex);

    // Nonce-Analyse MIT z-Werten (key recovery möglich)
    let fullNonceResult = null;
    if (blockchainECDSASigs.length >= 2) {
      try {
        fullNonceResult = analyzeNonces(blockchainECDSASigs, blockchainZValues);
      } catch {
        fullNonceResult = null;
      }
    }

    // Kombiniere: bevorzuge fullNonceResult falls vorhanden, sonst binaryNonceResult
    const finalNonceResult = fullNonceResult ?? binaryNonceResult;

    // Serialize für JSON
    const serializedNonce = finalNonceResult
      ? {
          ...finalNonceResult,
          reusedNonces: finalNonceResult.reusedNonces.map((rn) => ({
            ...rn,
            rValue: String(rn.rValue),
          })),
          source: fullNonceResult ? "blockchain+z-values" : "binary-scan",
        }
      : null;

    // Key-Recovery-Ergebnisse zusammenfassen
    const recoveredKeys = finalNonceResult?.reusedNonces
      .filter((rn) => rn.extractedPrivateKey)
      .map((rn) => ({
        privateKeyHex: rn.extractedPrivateKey!,
        wifCompressed: rn.wifCompressed,
        wifUncompressed: rn.wifUncompressed,
        publicKey: rn.derivedPublicKey,
        address: rn.derivedAddress,
        rValue: rn.rValueFull,
        forensicNote: rn.forensicNote,
      })) ?? [];

    // ═══════════════════════════════════════════════════════════════
    // Zusammenfassung & Risikobewertung
    // ═══════════════════════════════════════════════════════════════
    const totalKeys = walletMeta.ckeys.length;
    const validKeys = keyAnalyses.filter((k) => k.analysis?.isValid).length;
    const malleableCount = serializedSigAnalyses.filter((s) => s.malleabilityRisk).length;
    const hasNonceReuse = (serializedNonce?.reusedNonces?.length ?? 0) > 0;
    const hasKeyRecovery = recoveredKeys.length > 0;

    const findings: string[] = [];
    if (walletMeta.authenticityStatus !== "valid") {
      findings.push(
        `Wallet-Authentizität: ${walletMeta.authenticityStatus.toUpperCase()} (Score: ${walletMeta.authenticityScore}/100)`
      );
    }
    walletMeta.warnings.forEach((w) => findings.push(w));
    if (malleableCount > 0) {
      findings.push(`${malleableCount} Signaturen mit Malleability-Risiko (BIP-62 nicht konform)`);
    }
    if (hasKeyRecovery) {
      findings.push(
        `🔓 KRITISCH: ${recoveredKeys.length} Private Key(s) durch Nonce-Reuse-Analyse vollständig extrahiert!`
      );
    } else if (hasNonceReuse) {
      findings.push(
        `🚨 KRITISCH: Nonce-Wiederverwendung detektiert! Blockchain-Fetch für vollständige Key-Recovery läuft.`
      );
    }
    if (allBlockchainSigs.length > 0) {
      findings.push(
        `Blockchain-Analyse: ${allBlockchainSigs.length} Signatur(en) mit SIGHASH-z-Werten über Blockstream extrahiert`
      );
    }
    if (walletEntropyResult && walletEntropyResult.shannonEntropy < 3.0) {
      findings.push(
        `Niedrige Wallet-Entropy (${walletEntropyResult.shannonEntropy.toFixed(2)} bit/byte) — Verdacht auf manipulierte Daten`
      );
    }

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      analysisId,
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}ms`,
      disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",

      wallet: {
        fileName: file.name,
        fileSize: file.size,
        fileSizeHuman:
          file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
            : `${(file.size / 1024).toFixed(1)} KB`,
        authenticityScore: walletMeta.authenticityScore,
        authenticityStatus: walletMeta.authenticityStatus,
        isEncrypted: !!walletMeta.mkey,
        hasValidBDB: walletMeta.authenticityScore >= 30,
        warnings: walletMeta.warnings,
      },

      masterKey: walletMeta.mkey
        ? {
            found: true,
            iterations: walletMeta.mkey.iterations,
            method: walletMeta.mkey.method,
            saltHex: walletMeta.mkey.salt,
            ivHex: walletMeta.mkey.iv,
            encryptedHex: walletMeta.mkey.encrypted.slice(0, 64) + "...",
          }
        : { found: false },

      intermediateHashes: walletMeta.intermediateHashes || null,

      keys: {
        totalFound: totalKeys,
        validAnalyzed: validKeys,
        analyses: keyAnalyses,
      },

      signatures: {
        totalFound: foundSigs.length,
        malleableCount,
        analyses: serializedSigAnalyses,
      },

      // Blockchain-Analyse Ergebnisse
      blockchainAnalysis: {
        addressesScanned: addressesToScan.length,
        signaturesExtracted: allBlockchainSigs.length,
        fetchLog: blockchainFetchLog,
        signatures: allBlockchainSigs.map((s) => ({
          txid: s.txid,
          inputIndex: s.inputIndex,
          address: s.address,
          rHex: s.rHex,
          sHex: s.sHex,
          zHex: s.zHex,
        })),
      },

      // Nonce-Analyse (mit z-Werten falls Blockchain-Fetch erfolgreich)
      nonceAnalysis: serializedNonce,

      // 🔓 Extrahierte Private Keys
      keyRecovery: {
        attempted: blockchainECDSASigs.length >= 2 || foundSigs.length >= 2,
        success: hasKeyRecovery,
        recoveredCount: recoveredKeys.length,
        keys: recoveredKeys,
      },

      entropy: {
        wallet: walletEntropyResult
          ? {
              shannon: walletEntropyResult.shannonEntropy,
              chiSquarePValue: walletEntropyResult.chiSquarePValue,
              monobitPass: walletEntropyResult.monobitPass,
              runsPass: walletEntropyResult.runsPass,
              assessment: walletEntropyResult.assessment,
            }
          : null,
        masterKey: mkeyEntropyResult
          ? { shannon: mkeyEntropyResult.shannonEntropy, assessment: mkeyEntropyResult.assessment }
          : null,
        salt: saltEntropyResult
          ? { shannon: saltEntropyResult.shannonEntropy, assessment: saltEntropyResult.assessment }
          : null,
      },

      findings,
      summary: `Wallet-Scan: ${totalKeys} Keys, ${foundSigs.length} Bin.-Sigs, ${allBlockchainSigs.length} Chain-Sigs, ${recoveredKeys.length} Keys recovered. Auth: ${walletMeta.authenticityStatus} (${walletMeta.authenticityScore}/100). ${elapsed}ms`,
    });
  } catch (error: unknown) {
    console.error("Wallet-Scan error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Interner Fehler bei der Wallet-Analyse",
      },
      { status: 500 }
    );
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(path.dirname(tempFilePath));
      } catch {
        /* cleanup best-effort */
      }
    }
  }
}
