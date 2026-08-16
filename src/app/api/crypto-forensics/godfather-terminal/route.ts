import { NextResponse } from "next/server";
import { 
  SECP256K1, 
  mod, 
  modInverse, 
  getOppositeS, 
  encodeWIF
} from "@/lib/crypto-forensics/ec-engine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rHex, s1Hex, s2Hex, z1Hex, z2Hex } = body;

    if (!rHex || !s1Hex || !s2Hex || !z1Hex || !z2Hex) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const n = SECP256K1.n;
    const r = BigInt("0x" + rHex);
    const z1 = BigInt("0x" + z1Hex);
    const z2 = BigInt("0x" + z2Hex);

    const s1_orig = BigInt("0x" + s1Hex);
    const s2_orig = BigInt("0x" + s2Hex);

    const combos = [
      { name: "Combo 1 (+s1, +s2)", s1: s1_orig, s2: s2_orig },
      { name: "Combo 2 (-s1, +s2)", s1: getOppositeS(s1_orig), s2: s2_orig },
      { name: "Combo 3 (+s1, -s2)", s1: s1_orig, s2: getOppositeS(s2_orig) },
      { name: "Combo 4 (-s1, -s2)", s1: getOppositeS(s1_orig), s2: getOppositeS(s2_orig) },
    ];

    const results = [];
    let successfulRecovery = null;

    for (const combo of combos) {
      let dFound = null;
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
              dFound = dHex;
            }
          }
        }
      } catch {
        // Inverse failed or math error
      }

      if (dFound) {
        results.push({ name: combo.name, status: "MATCH", d: dFound });
        successfulRecovery = dFound;
      } else {
        results.push({ name: combo.name, status: "MISMATCH" });
      }
    }

    if (successfulRecovery) {
      const wifC = encodeWIF(successfulRecovery, true);
      const wifU = encodeWIF(successfulRecovery, false);
      return NextResponse.json({
        success: true,
        tests: results,
        recoveredKey: successfulRecovery,
        wifCompressed: wifC,
        wifUncompressed: wifU
      });
    } else {
      return NextResponse.json({
        success: false,
        tests: results,
        error: "All combinations failed (MISMATCH). Please check z-values."
      });
    }

  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Terminal Compute Error: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
