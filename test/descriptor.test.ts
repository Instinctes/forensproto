import { describe, it, expect } from "vitest";
import { parseDescriptor } from "@/lib/descriptor";
import { encodePublicKey, publicKeyFromPrivate } from "@/lib/crypto-forensics/ec-engine";

const pk = encodePublicKey(publicKeyFromPrivate(1n), true);

describe("Output-Descriptor-Parsing", () => {
  it("erkennt wpkh() als SegWit-Single-Sig", () => {
    const d = parseDescriptor(`wpkh(${pk})`);
    expect(d.ok).toBe(true);
    expect(d.tree.type).toBe("wpkh");
    expect(d.isSegwit).toBe(true);
    expect(d.isMultisig).toBe(false);
    expect(d.totalKeys).toBe(1);
    expect(d.tree.keys[0].key).toBe(pk);
  });

  it("erkennt pkh() als Legacy-Single-Sig", () => {
    const d = parseDescriptor(`pkh(${pk})`);
    expect(d.ok).toBe(true);
    expect(d.tree.type).toBe("pkh");
    expect(d.isSegwit).toBe(false);
    expect(d.scriptType).toMatch(/P2PKH/);
  });

  it("erkennt verschachtelte sh(wpkh()) Struktur", () => {
    const d = parseDescriptor(`sh(wpkh(${pk}))`);
    expect(d.ok).toBe(true);
    expect(d.tree.type).toBe("sh");
  });
});
