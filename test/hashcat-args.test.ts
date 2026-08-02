import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Regressions-Schutz für den Hashcat-Exit-255-Bug: der Self-Test muss
 * standardmäßig deaktiviert sein (--self-test-disable), sonst brechen
 * Bitcoin-Jobs auf Apple Silicon vor dem ersten Versuch ab. Dieser Test
 * hätte die stille Regression von damals gefangen.
 *
 * hashcat-manager zieht (über audit-log) die db-Schicht mit, die beim Laden
 * einen Datenordner anlegt — daher ein Temp-Verzeichnis, damit der Repo-Ordner
 * sauber bleibt. Import erst NACH dem Setzen der Variable (dynamisch).
 */
let backendArgs: typeof import("@/lib/hashcat-manager").backendArgs;
let selfTestArgs: typeof import("@/lib/hashcat-manager").selfTestArgs;
let buildArgs: typeof import("@/lib/hashcat-manager").buildArgs;

beforeAll(async () => {
  process.env.FORENSPROTO_DATA_DIR = mkdtempSync(join(tmpdir(), "forens-hc-"));
  const m = await import("@/lib/hashcat-manager");
  backendArgs = m.backendArgs;
  selfTestArgs = m.selfTestArgs;
  buildArgs = m.buildArgs;
});

describe("hashcat selfTestArgs", () => {
  const orig = process.env.FORENSPROTO_HASHCAT_SELFTEST;
  afterEach(() => {
    if (orig === undefined) delete process.env.FORENSPROTO_HASHCAT_SELFTEST;
    else process.env.FORENSPROTO_HASHCAT_SELFTEST = orig;
  });

  it("deaktiviert den Self-Test standardmäßig", () => {
    delete process.env.FORENSPROTO_HASHCAT_SELFTEST;
    expect(selfTestArgs()).toContain("--self-test-disable");
  });

  it("lässt den Self-Test bei FORENSPROTO_HASHCAT_SELFTEST=on zu", () => {
    process.env.FORENSPROTO_HASHCAT_SELFTEST = "on";
    expect(selfTestArgs()).not.toContain("--self-test-disable");
  });
});

describe("hashcat backendArgs (Override)", () => {
  const orig = process.env.FORENSPROTO_HASHCAT_BACKEND;
  afterEach(() => {
    if (orig === undefined) delete process.env.FORENSPROTO_HASHCAT_BACKEND;
    else process.env.FORENSPROTO_HASHCAT_BACKEND = orig;
  });

  it("erzwingt nur-Metal bei =metal", () => {
    process.env.FORENSPROTO_HASHCAT_BACKEND = "metal";
    expect(backendArgs()).toEqual(["--backend-ignore-opencl"]);
  });

  it("erzwingt nur-OpenCL bei =opencl", () => {
    process.env.FORENSPROTO_HASHCAT_BACKEND = "opencl";
    expect(backendArgs()).toEqual(["--backend-ignore-metal"]);
  });

  it("keine Backend-Flags bei =auto", () => {
    process.env.FORENSPROTO_HASHCAT_BACKEND = "auto";
    expect(backendArgs()).toEqual([]);
  });
});

describe("hashcat buildArgs", () => {
  it("enthält Modus, Angriff, Hash-Datei und den Self-Test-Schutz", () => {
    const args = buildArgs(
      {
        hashFilePath: "/tmp/target.hash",
        hashcatMode: 11300,
        attackMode: 0,
        wordlistFilePath: "/tmp/wl.txt",
        sessionName: "sess1",
      },
      "/tmp/target.hash.pot"
    );
    expect(args).toContain("-m");
    expect(args).toContain("11300");
    expect(args).toContain("/tmp/target.hash");
    expect(args).toContain("/tmp/wl.txt");
    expect(args).toContain("--self-test-disable");
    expect(args).toContain("--status-json");
  });
});
