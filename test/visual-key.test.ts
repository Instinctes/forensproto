import { describe, it, expect } from "vitest";
import {
  addressesFromPrivateHex,
  deriveVisualKey,
  emptyGrid,
} from "@/lib/visual-key";

/**
 * Kern-Krypto: gegen die kanonischen secp256k1-Referenzvektoren geprüft.
 * privkey = 1 → Generatorpunkt G. Diese Werte sind Bitcoin-weit dokumentiert
 * (u. a. die BIP173-Beispieladresse bc1qw508d6...). Schlägt ein Test hier fehl,
 * ist die EC-/Adress-/WIF-Codierung fehlerhaft — das wäre ein Integritätsbruch.
 */
const PRIV_ONE = "0000000000000000000000000000000000000000000000000000000000000001";

describe("addressesFromPrivateHex (secp256k1-Referenzvektoren, privkey=1)", () => {
  const r = addressesFromPrivateHex(PRIV_ONE);

  it("liefert die kanonischen WIF-Werte", () => {
    expect(r.wifCompressed).toBe("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn");
    expect(r.wifUncompressed).toBe("5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf");
  });

  it("liefert die kanonischen Public Keys (Generatorpunkt G)", () => {
    expect(r.publicKeyCompressed).toBe(
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
    );
    expect(r.publicKeyUncompressed).toBe(
      "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8"
    );
  });

  it("liefert die kanonischen Adressen (alle Formen)", () => {
    expect(r.addresses.p2pkh).toBe("1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH");
    expect(r.addresses.p2pkhUncompressed).toBe("1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm");
    expect(r.addresses.p2shP2wpkh).toBe("3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN");
    // BIP173-Referenzadresse
    expect(r.addresses.p2wpkh).toBe("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
  });

  it("akzeptiert 0x-Präfix und Großschreibung", () => {
    const r2 = addressesFromPrivateHex("0X" + PRIV_ONE.toUpperCase());
    expect(r2.addresses.p2pkh).toBe(r.addresses.p2pkh);
  });
});

describe("addressesFromPrivateHex Eingabe-Validierung", () => {
  it("weist falsche Länge ab", () => {
    expect(() => addressesFromPrivateHex("abcd")).toThrow();
  });

  it("weist Nicht-Hex ab", () => {
    expect(() => addressesFromPrivateHex("z".repeat(64))).toThrow();
  });

  it("weist 0 (außerhalb [1, n-1]) ab", () => {
    expect(() => addressesFromPrivateHex("0".repeat(64))).toThrow();
  });
});

describe("deriveVisualKey (CL-1)", () => {
  const cells = emptyGrid(8);
  cells[0] = 2;
  cells[9] = 3;
  cells[20] = 1;

  it("ist deterministisch (gleiches Muster + Salt → gleicher Key)", () => {
    const a = deriveVisualKey({ size: 8, cells: [...cells], salt: "x" });
    const b = deriveVisualKey({ size: 8, cells: [...cells], salt: "x" });
    expect(a.privateKeyHex).toBe(b.privateKeyHex);
    expect(a.addresses.p2pkh).toBe(b.addresses.p2pkh);
  });

  it("reagiert auf das Salt (anderes Salt → anderer Key)", () => {
    const a = deriveVisualKey({ size: 8, cells: [...cells], salt: "x" });
    const c = deriveVisualKey({ size: 8, cells: [...cells], salt: "y" });
    expect(a.privateKeyHex).not.toBe(c.privateKeyHex);
  });

  it("erzeugt einen gültigen 256-bit-Skalar", () => {
    const a = deriveVisualKey({ size: 8, cells: [...cells] });
    expect(a.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(a.addresses.p2wpkh).toMatch(/^bc1q/);
  });

  it("liefert alle Adressformen inkl. unkomprimierter P2PKH", () => {
    const a = deriveVisualKey({ size: 8, cells: [...cells] });
    expect(a.addresses.p2pkh).toMatch(/^1/);
    expect(a.addresses.p2pkhUncompressed).toMatch(/^1/);
    expect(a.addresses.p2shP2wpkh).toMatch(/^3/);
    expect(a.addresses.p2pkh).not.toBe(a.addresses.p2pkhUncompressed);
  });
});
