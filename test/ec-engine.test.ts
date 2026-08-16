import { describe, it, expect } from "vitest";
import {
  SECP256K1,
  mod,
  modInverse,
  isOnCurve,
  getGenerator,
  scalarMultiply,
  publicKeyFromPrivate,
  encodePublicKey,
  getOppositeS,
} from "@/lib/crypto-forensics/ec-engine";

/**
 * Fundamentale secp256k1-Invarianten. Fehler hier fälschen jedes
 * abgeleitete Ergebnis (Adressen, Nonce-Recovery, Signaturprüfung).
 */
const n = SECP256K1.n;

describe("secp256k1 EC-Engine", () => {
  it("Generatorpunkt liegt auf der Kurve", () => {
    expect(isOnCurve(getGenerator())).toBe(true);
  });

  it("publicKeyFromPrivate(1) ergibt den Generatorpunkt", () => {
    const g = getGenerator();
    const p = publicKeyFromPrivate(1n);
    expect(p.x).toBe(g.x);
    expect(p.y).toBe(g.y);
    expect(encodePublicKey(p, false).startsWith("0479be667e")).toBe(true);
  });

  it("scalarMultiply ist distributiv: 5·G == G+G+G+G+G (über Ableitung)", () => {
    // publicKeyFromPrivate(5) muss auf der Kurve liegen und deterministisch sein
    const p5a = publicKeyFromPrivate(5n);
    const p5b = scalarMultiply(5n, getGenerator());
    expect(p5a.x).toBe(p5b.x);
    expect(p5a.y).toBe(p5b.y);
    expect(isOnCurve(p5a)).toBe(true);
  });

  it("modInverse erfüllt a·a⁻¹ ≡ 1 (mod m)", () => {
    expect(mod(3n * modInverse(3n, 7n), 7n)).toBe(1n);
    const a = 123456789n;
    expect(mod(a * modInverse(a, n), n)).toBe(1n);
  });

  it("getOppositeS liefert die Malleability-Variante n−s", () => {
    expect(getOppositeS(n - 1n)).toBe(1n);
    const s = 987654321n;
    expect(getOppositeS(s)).toBe(mod(n - s, n));
  });
});
