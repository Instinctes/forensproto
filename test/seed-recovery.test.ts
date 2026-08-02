import { describe, it, expect } from "vitest";
import { mnemonicToSeed, derivePath, parsePath } from "@/lib/seed-recovery";

/**
 * BIP39/BIP32 gegen den offiziellen Referenzvektor (Passphrase "TREZOR").
 */
describe("BIP39 mnemonicToSeed", () => {
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

  it("matcht den kanonischen BIP39-Seed (Passphrase TREZOR)", () => {
    const seed = mnemonicToSeed(mnemonic, "TREZOR").toString("hex");
    expect(seed).toBe(
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04"
    );
  });

  it("ändert den Seed mit der Passphrase", () => {
    const a = mnemonicToSeed(mnemonic, "").toString("hex");
    const b = mnemonicToSeed(mnemonic, "TREZOR").toString("hex");
    expect(a).not.toBe(b);
  });
});

describe("BIP32 parsePath / derivePath", () => {
  it("parst hardened und normale Indizes", () => {
    const idx = parsePath("m/44'/0'/0'/0/0");
    expect(idx).toEqual([
      44 + 0x80000000,
      0 + 0x80000000,
      0 + 0x80000000,
      0,
      0,
    ]);
  });

  it("leitet deterministisch denselben Key ab", () => {
    const seed = mnemonicToSeed(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    );
    const a = derivePath(seed, "m/44'/0'/0'/0/0");
    const b = derivePath(seed, "m/44'/0'/0'/0/0");
    expect(a.privateKeyHex).toBe(b.privateKeyHex);
    expect(a.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(a.address).toMatch(/^1/);
  });

  it("liefert für verschiedene Pfade verschiedene Keys", () => {
    const seed = mnemonicToSeed(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    );
    const a = derivePath(seed, "m/44'/0'/0'/0/0");
    const b = derivePath(seed, "m/44'/0'/0'/0/1");
    expect(a.privateKeyHex).not.toBe(b.privateKeyHex);
  });
});
