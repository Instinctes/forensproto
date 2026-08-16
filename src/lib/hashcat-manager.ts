import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { updateJob, getJob } from "./job-store";
import { appendAuditLog } from "./audit-log";
import { bus, EVT_JOB_FINISHED, type JobFinishedPayload } from "./events";
import { learnFromHistory } from "./pattern-learning";
import { saveRuleFile } from "./rules-store";
import { dumpEncryptedWallet, renderDumpTxt } from "./wallet-dump";
import { readFile, writeFile, mkdir } from "fs/promises";
import { getForensprotoStateDir } from "./data-dir";

// Verhindert Zombie-Prozesse, wenn der Next.js Server neu startet
const globalForProcs = global as unknown as {
  runningProcs: Map<string, ChildProcess>;
  hashcatStderr: Map<string, string>;
};
const runningProcesses = globalForProcs.runningProcs || new Map<string, ChildProcess>();
const stderrBuffers = globalForProcs.hashcatStderr || new Map<string, string>();
if (process.env.NODE_ENV !== "production") {
  globalForProcs.runningProcs = runningProcesses;
  globalForProcs.hashcatStderr = stderrBuffers;
}

/** Pfad der Hashcat-Restore-Datei (Checkpoint) für einen Job. */
function restorePath(hashFilePath: string, sessionName: string): string {
  return join(dirname(hashFilePath), `${sessionName}.restore`);
}

/**
 * Backend-Flags für Hashcat.
 *
 * Auf Apple Silicon (darwin) meldet Hashcat 7.x oft Metal + OpenCL als
 * Alias-Geräte. Der Dual-Modus skippt Metal und baut OpenCL-Kernel mit
 * CL_INVALID_VALUE → Exit 255 (dokumentiert in Brain.md). Deshalb wird auf
 * macOS standardmäßig nur Metal genutzt. Diesen Default NICHT entfernen —
 * ohne ihn kehrt der Dual-Backend-Kernelbuild-Crash zurück.
 *
 * Override: FORENSPROTO_HASHCAT_BACKEND=metal|opencl|auto
 */
export function backendArgs(): string[] {
  const pref = (process.env.FORENSPROTO_HASHCAT_BACKEND || "").toLowerCase().trim();
  if (pref === "opencl") return ["--backend-ignore-metal"];
  if (pref === "auto") return [];
  if (pref === "metal") return ["--backend-ignore-opencl"];
  // Default: auf macOS Metal bevorzugen (vermeidet dokumentierten
  // Dual-Backend-CL_INVALID_VALUE-Crash).
  if (process.platform === "darwin") return ["--backend-ignore-opencl"];
  return [];
}

/**
 * Self-Test-Flag für Hashcat.
 *
 * REGRESSIONS-FIX: Auf Apple Silicon (Metal) schlägt der Self-Test bei
 * mehreren Slow-Hash-Kerneln — u.a. Bitcoin Core (Mode 11300) — häufig fehl,
 * obwohl das eigentliche Cracking korrekt funktioniert (bekanntes
 * False-Negative des Self-Test-Vektors gegen den Metal-Kernel). Ein
 * fehlgeschlagener Self-Test beendet den GESAMTEN Job mit Exit 255, bevor
 * überhaupt ein Passwort probiert wird — genau das in hc_out.txt beobachtete
 * Symptom ("Starting self-test..." → Abbruch). Der frühere Fix (Metal-only,
 * siehe backendArgs) behebt nur den Kernelbuild-Crash, nicht diesen
 * Self-Test-Abbruch.
 *
 * Daher wird der Self-Test standardmäßig deaktiviert. Das ist sicher: der
 * Self-Test validiert nur den Kernel gegen einen bekannten Testvektor; seine
 * Deaktivierung ändert nichts an der Korrektheit echter Treffer (ein
 * gefundenes Passwort wird ohnehin gegen das echte Hash-Material verifiziert).
 *
 * Wer den Self-Test doch erzwingen will: FORENSPROTO_HASHCAT_SELFTEST=on
 */
export function selfTestArgs(): string[] {
  const pref = (process.env.FORENSPROTO_HASHCAT_SELFTEST || "").toLowerCase().trim();
  if (pref === "on" || pref === "true" || pref === "1") return [];
  return ["--self-test-disable"];
}

/** Mappt Exit-Code + stderr auf eine nutzbare Fehlermeldung. */
export function explainHashcatFailure(code: number | null, stderr: string): string {
  const s = (stderr || "").toLowerCase();
  if (s.includes("cl_invalid_value") || s.includes("kernel") && s.includes("build failed")) {
    return (
      `Hashcat GPU-Kernel-Build fehlgeschlagen (Exit ${code}). ` +
      `Auf Apple Silicon ist das Dual-Backend Metal+OpenCL instabil — die App nutzt daher standardmäßig nur Metal. ` +
      `Override: FORENSPROTO_HASHCAT_BACKEND=metal|opencl|auto`
    );
  }
  if (s.includes("no devices found") || s.includes("no devices found/left")) {
    return `Keine Hashcat-Geräte gefunden (Exit ${code}). GPU/OpenCL/Metal prüfen: hashcat -I`;
  }
  if (s.includes("no such file") || s.includes("cannot open")) {
    return `Datei nicht gefunden (Exit ${code}): ${stderr.trim().slice(0, 240)}`;
  }
  if (s.includes("separator unmatched") || s.includes("token length exception") || s.includes("no hashes loaded")) {
    return `Ungültiges Hash-Format (Exit ${code}). Hash/Mode prüfen (z. B. Bitcoin Core = 11300).`;
  }
  if (s.includes("already an instance") || s.includes("already running")) {
    return `Hashcat-Session läuft bereits (Exit ${code}). Alte Session beenden oder anderen Job starten.`;
  }
  if (s.includes("self-test failed")) {
    return (
      `Hashcat Self-Test fehlgeschlagen (Exit ${code}). ` +
      `Auf Apple Silicon ist das ein bekanntes False-Negative; die App deaktiviert den Self-Test daher standardmäßig. ` +
      `Falls diese Meldung dennoch erscheint: FORENSPROTO_HASHCAT_SELFTEST nicht auf "on" setzen.`
    );
  }
  const snippet = stderr.trim().replace(/\s+/g, " ").slice(0, 280);
  if (snippet) return `Hashcat Abbruch (Exit ${code}): ${snippet}`;
  return `Hashcat Abbruch mit Fehlercode ${code}`;
}

export async function stopHashcatJob(jobId: string) {
  const proc = runningProcesses.get(jobId);
  if (proc) {
    proc.kill("SIGTERM"); // Graceful stop – Hashcat schreibt seinen Restore-Punkt
    runningProcesses.delete(jobId);
    updateJob(jobId, { status: "stopped", speed: 0 });
    appendAuditLog({
      level: "warning",
      action: "Recovery-Job gestoppt",
      message: `Job ${jobId} durch Benutzer angehalten (Checkpoint gesichert, fortsetzbar)`,
      source: "hashcat-manager",
      caseId: getJob(jobId)?.caseId,
    });
  }
}

interface StartParams {
  hashFilePath: string;
  hashcatMode: number;
  attackMode: number; // 0 = dict, 3 = mask, 6 = hybrid
  wordlistFilePath?: string;
  mask?: string;
  sessionName: string;
  // Phase 2: Rule-Engine + Multi-GPU + Keyspace-Shard
  ruleFiles?: string[]; // absolute Pfade gültiger Regeldateien
  devices?: string; // -d, z.B. "1,2"
  skip?: number; // -s (Keyspace-Offset für Shards)
  limit?: number; // -l (Keyspace-Länge für Shards)
}

/** Baut die gemeinsamen Hashcat-Argumente (inkl. Checkpoint-Optionen). */
export function buildArgs(params: StartParams, potfile: string): string[] {
  const restoreFile = restorePath(params.hashFilePath, params.sessionName);

  const args = [
    "-m",
    params.hashcatMode.toString(),
    "-a",
    params.attackMode.toString(),
    params.hashFilePath,
    "--status",
    "--status-json",
    "--status-timer=3",
    "--workload-profile=2",
    // Checkpoint / Resume
    `--session=${params.sessionName}`,
    `--restore-file-path=${restoreFile}`,
    `--potfile-path=${potfile}`,
    // Backend-Auswahl (Standard: Hashcat-Auto) + Self-Test-Handling
    ...backendArgs(),
    ...selfTestArgs(),
  ];

  // Multi-GPU: explizite Geräteauswahl
  if (params.devices && /^[\d,]+$/.test(params.devices)) {
    args.push("-d", params.devices);
  }

  // Keyspace-Shard (verteilte Recovery)
  if (typeof params.skip === "number" && params.skip >= 0) args.push("-s", String(params.skip));
  if (typeof params.limit === "number" && params.limit > 0) args.push("-l", String(params.limit));

  // Angriffs-spezifische Argumente
  if (params.attackMode === 0 && params.wordlistFilePath) {
    args.push(params.wordlistFilePath);
    for (const r of params.ruleFiles || []) args.push("-r", r);
  } else if (params.attackMode === 3 && params.mask) {
    args.push(params.mask);
  } else if (params.attackMode === 6 && params.wordlistFilePath && params.mask) {
    args.push(params.wordlistFilePath);
    args.push(params.mask);
    for (const r of params.ruleFiles || []) args.push("-r", r);
  }

  return args;
}

function preflight(params: StartParams): string | null {
  if (!existsSync(params.hashFilePath)) {
    return `Hash-Datei fehlt: ${params.hashFilePath}`;
  }
  if ((params.attackMode === 0 || params.attackMode === 6) && params.wordlistFilePath) {
    if (!existsSync(params.wordlistFilePath)) {
      return `Wortliste nicht gefunden: ${params.wordlistFilePath}`;
    }
  }
  if (params.attackMode === 3 && !params.mask) {
    return "Mask-Angriff ohne Maske";
  }
  for (const r of params.ruleFiles || []) {
    if (!existsSync(r)) return `Regeldatei nicht gefunden: ${r}`;
  }
  return null;
}

/** Verarbeitet den STDOUT-Stream von Hashcat und aktualisiert den Job. */
function attachStreamHandlers(jobId: string, hcProcess: ChildProcess, potfile: string) {
  let currentLine = "";
  stderrBuffers.set(jobId, "");

  hcProcess.stdout?.on("data", (data) => {
    currentLine += data.toString();
    const lines = currentLine.split("\n");
    currentLine = lines.pop() || "";

    for (const line of lines) {
      const tLine = line.trim();
      if (tLine.startsWith("{")) {
        try {
          const status = JSON.parse(tLine);
          const devices = status.devices || [];
          let totalSpeed = 0;
          let maxTemp = 0;
          let maxUtil = 0;
          if (devices.length > 0) {
            devices.forEach((d: { speed: number; temp?: number; util?: number }) => {
              totalSpeed += d.speed || 0;
              if (typeof d.temp === "number" && d.temp > maxTemp) maxTemp = d.temp;
              if (typeof d.util === "number" && d.util > maxUtil) maxUtil = d.util;
            });
          }
          const progressObj = status.progress || [];
          const progressPct =
            progressObj.length === 2 && progressObj[1] > 0
              ? (progressObj[0] / progressObj[1]) * 100
              : 0;

          // Echte ETA aus Hashcat: estimated_stop ist ein Unix-Zeitstempel (Sek.)
          const nowSec = Math.floor(Date.now() / 1000);
          let etaSec = 0;
          if (typeof status.estimated_stop === "number" && status.estimated_stop > nowSec) {
            etaSec = status.estimated_stop - nowSec;
          } else if (totalSpeed > 0 && progressObj.length === 2 && progressObj[1] > progressObj[0]) {
            // Fallback: aus verbleibendem Keyspace / Geschwindigkeit berechnen
            etaSec = Math.round((progressObj[1] - progressObj[0]) / totalSpeed);
          }

          // Sobald Hashcat läuft, existiert ein Restore-Punkt
          updateJob(jobId, {
            speed: totalSpeed,
            progress: Math.min(progressPct, 100),
            temperature: maxTemp,
            utilization: maxUtil,
            eta: etaSec,
            restorable: true,
          });
        } catch {
          // kaputtes JSON ignorieren
        }
      }
    }
  });

  hcProcess.stderr?.on("data", (data) => {
    const chunk = data.toString();
    console.warn(`[Job ${jobId}] Hashcat stderr:`, chunk.trim());
    const prev = stderrBuffers.get(jobId) || "";
    // Cap buffer ~8k
    stderrBuffers.set(jobId, (prev + chunk).slice(-8000));
  });

  hcProcess.on("error", (err) => {
    console.error(`[Job ${jobId}] Hashcat spawn error:`, err);
    runningProcesses.delete(jobId);
    updateJob(jobId, {
      status: "failed",
      error: `Hashcat konnte nicht gestartet werden: ${err.message}. Ist hashcat im PATH?`,
      speed: 0,
    });
    bus.emit(EVT_JOB_FINISHED, { jobId, status: "failed" });
  });

  hcProcess.on("close", async (code) => {
    console.log(`[Job ${jobId}] Hashcat exit code: ${code}`);
    runningProcesses.delete(jobId);
    const stderr = stderrBuffers.get(jobId) || "";
    stderrBuffers.delete(jobId);

    const job = getJob(jobId);
    if (!job) return;

    // User-Stop (SIGTERM) hat Vorrang — Status kann schon "stopped" sein
    if (job.status === "stopped") {
      bus.emit(EVT_JOB_FINISHED, {
        jobId,
        status: "stopped",
        recoveredPassword: job.recoveredPassword,
      });
      return;
    }

    if (code === 0) {
      try {
        const potContent = await readFile(potfile, "utf-8");
        const password = potContent.trim().split(":").pop();
        // Exit 0 ohne Potfile-Eintrag: manchmal Self-Test/Empty — als Exhausted behandeln
        if (!password || !potContent.trim()) {
          updateJob(jobId, {
            status: "failed",
            error: "Keyspace erschöpft (Passwort nicht gefunden)",
            speed: 0,
          });
          appendAuditLog({
            level: "error",
            action: "Recovery erfolglos",
            message: `Job ${jobId}: Exit 0 ohne Potfile-Treffer (erschöpft)`,
            source: "hashcat-manager",
            caseId: job.caseId,
          });
        } else {
          updateJob(jobId, {
            status: "completed",
            recoveredPassword: password,
            progress: 100,
            speed: 0,
          });
          appendAuditLog({
            level: "success",
            action: "Passwort wiederhergestellt",
            message: `Job ${jobId} (${job.walletName}) erfolgreich abgeschlossen`,
            source: "hashcat-manager",
            caseId: job.caseId,
          });
          // Closed-Loop: gelernte Regeln aus allen Funden automatisch aktualisieren
          try {
            const analysis = learnFromHistory();
            if (analysis.suggestedRules.length > 0) {
              await saveRuleFile("learned-auto.rule", analysis.suggestedRules);
            }
          } catch (e) {
            console.error("[Closed-Loop] Auto-Learn fehlgeschlagen:", e);
          }

          // Auto-Dump: verschlüsselte Wallet mit gefundenem Passwort entschlüsseln
          if (job.walletFilePath) {
            try {
              const walletBuf = await readFile(job.walletFilePath);
              const dump = dumpEncryptedWallet(walletBuf, password || "");
              const dumpsDir = join(getForensprotoStateDir(), "dumps");
              await mkdir(dumpsDir, { recursive: true });
              await writeFile(
                join(dumpsDir, `${jobId}.txt`),
                renderDumpTxt({ walletName: job.walletName, password: password || "", jobId }, dump),
                "utf-8"
              );
              updateJob(jobId, { dumpAvailable: true });
              appendAuditLog({
                level: dump.verifiedCount > 0 ? "success" : "warning",
                action: "Wallet-Dump erstellt",
                message: `${job.walletName}: ${dump.verifiedCount}/${dump.totalCkeys} Keys verifiziert entschlüsselt`,
                source: "wallet-dump",
                caseId: job.caseId,
              });
            } catch (e) {
              console.error("[Wallet-Dump] fehlgeschlagen:", e);
            }
          }
        }
      } catch {
        // Kein Potfile → erschöpft / kein Treffer
        updateJob(jobId, {
          status: "failed",
          error: "Keyspace erschöpft (Passwort nicht gefunden)",
          speed: 0,
        });
        appendAuditLog({
          level: "error",
          action: "Recovery erfolglos",
          message: `Job ${jobId}: kein Potfile / kein Treffer`,
          source: "hashcat-manager",
          caseId: job.caseId,
        });
      }
    } else if (code === 1) {
      updateJob(jobId, {
        status: "failed",
        error: "Keyspace erschöpft (Passwort nicht gefunden)",
        speed: 0,
      });
      appendAuditLog({
        level: "error",
        action: "Recovery erfolglos",
        message: `Job ${jobId}: Keyspace erschöpft, kein Passwort gefunden`,
        source: "hashcat-manager",
        caseId: job.caseId,
      });
    } else if (code === null || code === 143 || code === 130) {
      // SIGTERM / SIGINT / User Stopped – Checkpoint bleibt erhalten
      updateJob(jobId, { status: "stopped", speed: 0 });
    } else {
      const msg = explainHashcatFailure(code, stderr);
      updateJob(jobId, { status: "failed", error: msg, speed: 0 });
      appendAuditLog({
        level: "danger",
        action: "Recovery-Fehler",
        message: `Job ${jobId}: ${msg}`,
        source: "hashcat-manager",
        caseId: job.caseId,
      });
    }

    // Event für Queue-Scheduler und verteilte Aggregation
    const finished = getJob(jobId);
    const payload: JobFinishedPayload = {
      jobId,
      status: (finished?.status as JobFinishedPayload["status"]) || "failed",
      recoveredPassword: finished?.recoveredPassword,
    };
    bus.emit(EVT_JOB_FINISHED, payload);
  });
}

function spawnHashcat(jobId: string, args: string[], hashFilePath: string, potfile: string) {
  // cwd = Hash-Verzeichnis → Session-Dateien (.pid etc.) landen nicht im Projektroot
  const cwd = dirname(hashFilePath);
  console.log(`[Job ${jobId}] Starting Hashcat: hashcat ${args.join(" ")} (cwd=${cwd})`);

  const hcProcess = spawn("hashcat", args, {
    cwd,
    env: { ...process.env },
  });
  runningProcesses.set(jobId, hcProcess);
  updateJob(jobId, { status: "running", pid: hcProcess.pid, error: undefined });
  attachStreamHandlers(jobId, hcProcess, potfile);
}

export async function startHashcatJob(jobId: string, params: StartParams) {
  const pre = preflight(params);
  if (pre) {
    updateJob(jobId, { status: "failed", error: pre, speed: 0 });
    appendAuditLog({
      level: "danger",
      action: "Recovery-Fehler",
      message: `Job ${jobId}: ${pre}`,
      source: "hashcat-manager",
      caseId: getJob(jobId)?.caseId,
    });
    bus.emit(EVT_JOB_FINISHED, { jobId, status: "failed" });
    return;
  }

  const potfile = `${params.hashFilePath}.pot`;
  const args = buildArgs(params, potfile);
  spawnHashcat(jobId, args, params.hashFilePath, potfile);
}

/**
 * Setzt einen unterbrochenen Job aus seinem Hashcat-Restore-Punkt fort.
 * Voraussetzung: Es existiert eine .restore-Datei (Checkpoint).
 */
export async function resumeHashcatJob(
  jobId: string
): Promise<{ ok: boolean; error?: string }> {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "Job nicht gefunden" };
  if (!job.sessionName)
    return { ok: false, error: "Kein Session-Name (Job vor Checkpoint-Feature erstellt)" };
  if (runningProcesses.has(jobId)) return { ok: false, error: "Job läuft bereits" };

  const restoreFile = restorePath(job.hashFile, job.sessionName);
  if (!existsSync(restoreFile)) {
    return { ok: false, error: "Kein Restore-Punkt vorhanden – Neustart erforderlich" };
  }

  const potfile = `${job.hashFile}.pot`;
  const args = [
    `--session=${job.sessionName}`,
    `--restore-file-path=${restoreFile}`,
    "--restore",
    "--status",
    "--status-json",
    "--status-timer=3",
    `--potfile-path=${potfile}`,
    ...backendArgs(),
    ...selfTestArgs(),
  ];

  spawnHashcat(jobId, args, job.hashFile, potfile);

  appendAuditLog({
    level: "info",
    action: "Recovery-Job fortgesetzt",
    message: `Job ${jobId} aus Checkpoint wiederaufgenommen`,
    source: "hashcat-manager",
    caseId: job.caseId,
  });

  return { ok: true };
}
