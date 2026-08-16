import { describe, it, expect } from "vitest";
import { analyzeNonces } from "@/lib/crypto-forensics/nonce-analyzer";
import {
  SECP256K1,
  mod,
  modInverse,
  scalarMultiply,
  getGenerator,
  publicKeyFromPrivate,
  encodePublicKey,
} from "@/lib/crypto-forensics/ec-engine";
import type { ECDSASignature } from "@/lib/crypto-forensics/types";

/**
 * ECDSA-Nonce-Reuse-Recovery gegen einen selbst konstruierten, mathematisch
 * exakten Vektor: derselbe private Schlüssel d signiert zwei Nachrichten mit
 * demselben Nonce k. Aus (r, s1, s2, z1, z2) muss d rekonstruierbar sein.
 * Das ist der zentrale „Godfather"-Angriff der Krypto-Forensik.
 */
const n = SECP256K1.n;

function sig(r: bigint, s: bigint): ECDSASignature {
  return { r, s, derEncoded: "", rawHex: "" };
}

describe("Nonce-Reuse Private-Key-Recovery", () => {
  const d = 0x1122334455667788990011223344556677889900112233445566778899001122n % n;
  const k = 0x9988776655443322110099887766554433221100998877665544332211009988n % n;

  const R = scalarMultiply(k, getGenerator());
  const r = mod(R.x, n);
  const z1 = 0x0000000000000000000000000000000000000000000000000000000000000abcn;
  const z2 = 0x0000000000000000000000000000000000000000000000000000000000000defn;
  const kInv = modInverse(k, n);
  const s1 = mod(kInv * (z1 + r * d), n);
  const s2 = mod(kInv * (z2 + r * d), n);

  it("erkennt den wiederverwendeten Nonce (gleicher r)", () => {
    const res = analyzeNonces([sig(r, s1), sig(r, s2)], [z1.toString(16), z2.toString(16)]);
    expect(res.reusedNonces.length).toBe(1);
    expect(res.uniqueRValues).toBe(1);
  });

  it("rekonstruiert den korrekten privaten Schlüssel d", () => {
    const res = analyzeNonces([sig(r, s1), sig(r, s2)], [z1.toString(16), z2.toString(16)]);
    const recovered = res.reusedNonces[0]?.extractedPrivateKey;
    expect(recovered).toBe(d.toString(16).padStart(64, "0"));
  });

  it("leitet aus dem rekonstruierten d den korrekten Public Key ab", () => {
    const res = analyzeNonces([sig(r, s1), sig(r, s2)], [z1.toString(16), z2.toString(16)]);
    const recovered = res.reusedNonces[0]?.extractedPrivateKey;
    expect(recovered).toBeDefined();
    if (!recovered) return;
    const expectedPub = encodePublicKey(publicKeyFromPrivate(d), true);
    const recoveredPub = encodePublicKey(publicKeyFromPrivate(BigInt("0x" + recovered)), true);
    expect(recoveredPub).toBe(expectedPub);
  });

  it("meldet KEINEN Reuse bei unterschiedlichen r-Werten", () => {
    const res = analyzeNonces([sig(r, s1), sig(r + 1n, s2)], [z1.toString(16), z2.toString(16)]);
    expect(res.reusedNonces.length).toBe(0);
  });
});
