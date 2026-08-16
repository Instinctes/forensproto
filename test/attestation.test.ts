import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Ergebnis-Attestierung: signierter, unabhängig prüfbarer Nachweis eines
 * Recovery-Ergebnisses. Testet den Sign-/Verify-Roundtrip und die
 * Manipulationserkennung. report-signer legt sein Ed25519-Schlüsselpaar im
 * Datenordner ab → Temp-Verzeichnis vor dem (dynamischen) Import setzen.
 */
beforeAll(() => {
  process.env.FORENSPROTO_DATA_DIR = mkdtempSync(join(tmpdir(), "forens-attest-"));
});

describe("Recovery-Attestierung", () => {
  it("erzeugt eine gültige, verifizierbare Attestierung", async () => {
    const { buildAttestation, verifyAttestation } = await import("@/lib/attestation");
    const att = buildAttestation({
      subject: "03_wallet_8KBTC.dat",
      method: "Bitcoin Core wallet.dat",
      verified: true,
      scheme: "mkey → AES-CBC + secp256k1-Abgleich",
      detail: "12/12 ckeys verifiziert",
      verifiedCount: 12,
      totalCount: 12,
      inputMaterial: Buffer.from("asservat-bytes"),
      secret: "geheimes-passwort",
    });

    expect(att.signature.algorithm).toBe("Ed25519");
    expect(att.record.verification.verified).toBe(true);
    // Das Geheimnis selbst darf NICHT in der Attestierung stehen.
    const serialized = JSON.stringify(att);
    expect(serialized).not.toContain("geheimes-passwort");
    expect(att.record.secretCommitmentSha256).toMatch(/^[0-9a-f]{64}$/);

    expect(verifyAttestation(att).valid).toBe(true);
  });

  it("erkennt Manipulation am Datensatz", async () => {
    const { buildAttestation, verifyAttestation } = await import("@/lib/attestation");
    const att = buildAttestation({
      subject: "wallet-A",
      method: "m",
      verified: true,
      scheme: "s",
      detail: "d",
      inputMaterial: "x",
      secret: "y",
    });

    // Ergebnis nachträglich fälschen (verified true→false, subject ändern).
    const tampered = {
      ...att,
      record: { ...att.record, subject: "wallet-B", verification: { ...att.record.verification, verified: false } },
    };
    expect(verifyAttestation(tampered).valid).toBe(false);
  });

  it("attestiert ein nicht-verifizierbares Passwort als NICHT verifiziert", async () => {
    const { attestWalletRecovery, verifyAttestation } = await import("@/lib/attestation");
    // Zufallsbytes sind keine gültige wallet.dat → Verifikation muss false sein,
    // aber die Attestierung selbst bleibt gültig signiert.
    const att = attestWalletRecovery({
      subject: "kaputt.dat",
      walletBuffer: Buffer.from("nicht-wirklich-eine-wallet"),
      password: "egal",
    });
    expect(att.record.verification.verified).toBe(false);
    expect(verifyAttestation(att).valid).toBe(true);
  });
});
