import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Signiertes Fall-Dossier: baut aus einem echten (temporär geseedeten) Fall
 * ein signiertes Bündel, verifiziert es und weist Manipulation nach.
 * Schreibt in ein Temp-Datenverzeichnis (Fall-DB, Audit, Signaturschlüssel).
 */
beforeAll(() => {
  process.env.FORENSPROTO_DATA_DIR = mkdtempSync(join(tmpdir(), "forens-dossier-"));
});

describe("Fall-Dossier", () => {
  it("erstellt ein signiertes, verifizierbares Dossier mit intakter Custody", async () => {
    const { createCase, addEvidence } = await import("@/lib/cases");
    const { buildCaseDossier, verifyDossier } = await import("@/lib/dossier");

    const c = createCase({ name: "Nachlass Mustermann", investigator: "Ermittler A" });
    addEvidence({ caseId: c.id, fileName: "wallet.dat", buffer: Buffer.from("asservat-inhalt-123") });

    const signed = buildCaseDossier(c.id);

    expect(signed.dossier.kind).toBe("case-dossier");
    expect(signed.dossier.summary.evidenceCount).toBe(1);
    // Blob wurde gespeichert → Integrität muss passen; Custody-Kette intakt.
    expect(signed.dossier.summary.allEvidenceIntact).toBe(true);
    expect(signed.dossier.summary.allCustodyIntact).toBe(true);
    expect(signed.dossier.evidence[0].sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(verifyDossier(signed).valid).toBe(true);
  });

  it("erkennt Manipulation am Dossier-Inhalt", async () => {
    const { createCase } = await import("@/lib/cases");
    const { buildCaseDossier, verifyDossier } = await import("@/lib/dossier");

    const c = createCase({ name: "Fall B", investigator: "Ermittler B" });
    const signed = buildCaseDossier(c.id);

    const tampered = {
      ...signed,
      dossier: { ...signed.dossier, case: { ...signed.dossier.case, name: "Gefälschter Fallname" } },
    };
    expect(verifyDossier(tampered).valid).toBe(false);
  });

  it("wirft bei unbekanntem Fall", async () => {
    const { buildCaseDossier } = await import("@/lib/dossier");
    expect(() => buildCaseDossier("nicht-existent")).toThrow();
  });
});
