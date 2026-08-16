import { describe, it, expect } from "vitest";
import {
  composeMultisigScript,
  parseMultisigScript,
  multisigAddresses,
  assessMultisigRecovery,
} from "@/lib/multisig";
import { encodePublicKey, publicKeyFromPrivate } from "@/lib/crypto-forensics/ec-engine";

/**
 * Multisig: Skript-Komposition, Parsing und Adress-Ableitung (P2SH + P2WSH)
 * gegen einen deterministischen 2-of-3-Vektor (privkeys 1,2,3).
 * Erwartungswerte am EC-Kern verifiziert.
 */
const pk = [1n, 2n, 3n].map((d) => encodePublicKey(publicKeyFromPrivate(d), true));

describe("Multisig 2-of-3", () => {
  const script = composeMultisigScript(2, pk, true);

  it("parst m und n korrekt zurück", () => {
    const parsed = parseMultisigScript(script);
    expect(parsed.m).toBe(2);
    expect(parsed.n).toBe(3);
  });

  it("leitet die kanonischen P2SH- und P2WSH-Adressen ab", () => {
    const addr = multisigAddresses(script);
    expect(addr.p2sh).toBe("33hG2q39jRi2NqicRJB4ggY1J8EJm97Szz");
    expect(addr.p2wsh).toBe("bc1qztp0l0rwc8846ardl02fkyrrx43p96j47scz8l7qz3vnfteqc4eqtfqwcm");
  });

  it("erzeugt sortierte, deterministische Skripte (BIP67)", () => {
    const a = composeMultisigScript(2, pk, true);
    const b = composeMultisigScript(2, [...pk].reverse(), true);
    expect(a).toBe(b);
  });
});

describe("assessMultisigRecovery", () => {
  it("meldet Quorum erreichbar, wenn genug Schlüssel vorhanden", () => {
    const r = assessMultisigRecovery(2, 3, 2);
    expect(r.recoverable).toBe(true);
    expect(r.missingForQuorum).toBe(0);
  });

  it("meldet fehlende Schlüssel, wenn Quorum unerreichbar", () => {
    const r = assessMultisigRecovery(2, 3, 1);
    expect(r.recoverable).toBe(false);
    expect(r.missingForQuorum).toBe(1);
  });
});
