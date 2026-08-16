import { describe, it, expect } from "vitest";
import { analyzeSignature } from "@/lib/crypto-forensics/signature-analyzer";
import { SECP256K1 } from "@/lib/crypto-forensics/ec-engine";

/**
 * Signatur-Analyse: Low-S (BIP62/Malleability) und Wertebereichsprüfung.
 * Diese Merkmale entscheiden über Malleability-Risiko und Gültigkeit.
 */
const n = SECP256K1.n;
const sig = (r: bigint, s: bigint) => ({ r, s, derEncoded: "", rawHex: "" });

describe("ECDSA-Signatur-Analyse", () => {
  it("erkennt Low-S als kanonisch", () => {
    expect(analyzeSignature(sig(1n, 2n)).isLowS).toBe(true);
  });

  it("erkennt High-S (n−2) als nicht-kanonisch (Malleability)", () => {
    const a = analyzeSignature(sig(1n, n - 2n));
    expect(a.isLowS).toBe(false);
    expect(a.malleabilityRisk).toBe(true);
  });

  it("markiert r=0 als außerhalb des gültigen Bereichs", () => {
    expect(analyzeSignature(sig(0n, 2n)).validRange).toBe(false);
  });

  it("akzeptiert gültige r/s im Bereich [1, n−1]", () => {
    expect(analyzeSignature(sig(1n, 2n)).validRange).toBe(true);
  });
});
