import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Audit-Log-Hashkette (Tamper-Evidence): die Chain-of-Custody-Integrität hängt
 * daran, dass jeder Eintrag den Hash des Vorgängers einbindet und verifyChain()
 * eine nachträgliche Inhaltsänderung erkennt.
 *
 * FORENSPROTO_DATA_DIR wird VOR dem (dynamischen) Import gesetzt, damit in ein
 * frisches Temp-Verzeichnis geschrieben wird und keine echten Falldaten berührt
 * werden. data-dir.ts liest die Variable bei jedem Aufruf (nicht gecacht).
 */
beforeAll(() => {
  process.env.FORENSPROTO_DATA_DIR = mkdtempSync(join(tmpdir(), "forens-audit-"));
});

describe("Audit-Log Hashkette", () => {
  it("baut eine korrekt verkettete, gültige Kette auf", async () => {
    const { appendAuditLog, verifyChain } = await import("@/lib/audit-log");

    const a = appendAuditLog({ level: "info", action: "A", message: "erster", source: "test" });
    const b = appendAuditLog({ level: "info", action: "B", message: "zweiter", source: "test" });

    // Verkettung: b.prevHash muss a.hash sein; Hashes sind SHA-256 (64 hex).
    expect(b.prevHash).toBe(a.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);

    const v = verifyChain();
    expect(v.valid).toBe(true);
    expect(v.totalEntries).toBe(2);
  });

  it("erkennt einen manipulierten Eintrag (Hash passt nicht zum Inhalt)", async () => {
    const { appendAuditLog, verifyChain, getAuditLogs } = await import("@/lib/audit-log");
    const { db } = await import("@/lib/db");

    // Aktuellen Ketten-Kopf holen, um einen scheinbar korrekt verketteten,
    // aber inhaltlich inkonsistenten Eintrag einzuschleusen.
    appendAuditLog({ level: "warning", action: "C", message: "dritter", source: "test" });
    const head = getAuditLogs()[0]; // neueste zuerst

    // Eintrag mit KORREKTEM prevHash, aber falschem (nicht zum Inhalt
    // passendem) hash direkt in die Collection schreiben.
    const tampered = {
      seq: 0, // wird von der Verifikation über prevHash/hash geprüft, nicht über seq
      id: "log-tampered",
      timestamp: new Date().toISOString(),
      level: "info",
      action: "X",
      message: "MANIPULIERT",
      source: "test",
      user: "system",
      prevHash: head.hash,
      hash: "0".repeat(64), // absichtlich falsch
    };
    db.append("audit_log", tampered.id, tampered);

    const v = verifyChain();
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBeDefined();
  });
});
