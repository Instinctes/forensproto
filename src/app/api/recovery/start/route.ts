import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/job-store";
import { enqueueJob } from "@/lib/queue";
import { startDistributedJob } from "@/lib/distributed";
import { appendAuditLog } from "@/lib/audit-log";
import { resolveRuleFile } from "@/lib/rules-store";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { complianceEnforced, isRecoveryAuthorized } from "@/lib/authorization";
import { getWordlistsDir } from "@/lib/data-dir";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, writeFile } from "fs/promises";

const SAFE_NAME = /^[\w.\-]+$/;

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "recovery:start");
  if (isAuthError(auth)) return auth;
  try {
    const data = await request.json();
    const {
      jobId,
      walletName,
      walletType,
      hashcatMode,
      hash,
      method,
      wordlist, // Name einer Datei in wordlists/
      mask,
      ruleFile, // string | string[] – Namen in rules/
      devices, // "1,2"
      shards, // Anzahl Shards für verteilte Recovery
      caseId,
      walletFilePath, // Pfad der hochgeladenen wallet.dat (für Auto-Dump)
    } = data;

    if (!jobId || !hashcatMode || !hash) {
      return NextResponse.json({ error: "Fehlende Parameter" }, { status: 400 });
    }

    // Hash in Datei schreiben
    const tempDir = join(tmpdir(), "alphaforensic", jobId);
    await mkdir(tempDir, { recursive: true });
    const hashFilePath = join(tempDir, "target.hash");
    await writeFile(hashFilePath, hash);

    // method → hashcat -a Code
    let attackMode = 0;
    if (method === "mask") attackMode = 3;
    if (method === "hybrid") attackMode = 6;

    // Wortliste validieren (Path-Safety; Auflösung erfolgt im Queue-Runner)
    let wordlistName: string | undefined;
    if ((attackMode === 0 || attackMode === 6) && wordlist && typeof wordlist === "string") {
      if (!SAFE_NAME.test(wordlist)) {
        return NextResponse.json({ error: "Ungültiger Wortlisten-Name" }, { status: 400 });
      }
      wordlistName = wordlist;
    }

    // Regeldateien validieren (nur Dictionary/Hybrid)
    let ruleFileNames: string[] | undefined;
    if (attackMode === 0 || attackMode === 6) {
      const requested = Array.isArray(ruleFile) ? ruleFile : ruleFile ? [ruleFile] : [];
      const valid = requested.filter((r: unknown) => typeof r === "string" && !!resolveRuleFile(r));
      if (valid.length) ruleFileNames = valid;
    }

    const safeDevices = typeof devices === "string" && /^[\d,]+$/.test(devices) ? devices : undefined;
    const shardCount = parseInt(String(shards ?? "1"), 10) || 1;
    const caseIdSafe = typeof caseId === "string" ? caseId : undefined;
    const authorizationId = typeof data.authorizationId === "string" ? data.authorizationId : undefined;

    // ---- Compliance-Gate (Phase 1): Fallautorisierung erforderlich ----
    // Nur scharf, wenn FORENSPROTO_COMPLIANCE gesetzt ist (Research-Preview bleibt offen).
    if (complianceEnforced()) {
      const az = isRecoveryAuthorized({ caseId: caseIdSafe, authorizationId, tenantId: auth.tenantId });
      if (!az.ok) {
        appendAuditLog({
          level: "danger",
          action: "Recovery-Start blockiert (Compliance)",
          message: `Start für Wallet "${walletName || "Unknown"}" verweigert: ${az.reason}`,
          source: "recovery/start",
          caseId: caseIdSafe,
          user: auth.username,
        });
        return NextResponse.json(
          { error: `Compliance: ${az.reason}`, code: "AUTHORIZATION_REQUIRED" },
          { status: 403 }
        );
      }
    }

    // ---- Verteilte Recovery (Keyspace-Splitting) ----
    if (shardCount >= 2) {
      const wordlistFilePath = wordlistName ? join(getWordlistsDir(), wordlistName) : undefined;
      const ruleFilePaths = (ruleFileNames || [])
        .map((r) => resolveRuleFile(r))
        .filter((p): p is string => !!p);

      const dist = await startDistributedJob({
        parentJobId: jobId,
        walletName: walletName || "Unknown Wallet",
        walletType,
        hashcatMode: parseInt(hashcatMode, 10),
        attackMode,
        hashFile: hashFilePath,
        hashString: hash,
        wordlist: wordlistName,
        mask,
        ruleFiles: ruleFileNames,
        ruleFilePaths,
        wordlistFilePath,
        devices: safeDevices,
        shardCount,
        caseId: caseIdSafe,
        tenantId: auth.tenantId,
      });

      if (dist.ok) {
        appendAuditLog({
          level: "info",
          action: "Recovery-Job gestartet (verteilt)",
          message: `Wallet "${walletName}" — ${dist.shards} Shards, Keyspace ${dist.keyspace}`,
          source: "recovery/start",
          caseId: caseIdSafe,
        });
        return NextResponse.json({ success: true, jobId, distributed: true, shards: dist.shards });
      }
      // Fallback auf Single-Job, wenn Keyspace nicht bestimmbar war
      console.warn(`[recovery/start] Verteilung nicht möglich (${dist.reason}) – Single-Job.`);
    }

    // ---- Single-Job über Queue ----
    createJob({
      id: jobId,
      walletName: walletName || "Unknown Wallet",
      walletType,
      hashcatMode: parseInt(hashcatMode, 10),
      method,
      hashString: hash,
      hashFile: hashFilePath,
      wordlist: wordlistName,
      mask,
      sessionName: `forensproto_${jobId}`,
      attackMode,
      ruleFiles: ruleFileNames,
      devices: safeDevices,
      caseId: caseIdSafe,
      tenantId: auth.tenantId,
      walletFilePath: typeof walletFilePath === "string" ? walletFilePath : undefined,
    });
    enqueueJob(jobId);

    appendAuditLog({
      level: "info",
      action: "Recovery-Job eingereiht",
      message: `Wallet "${walletName || "Unknown"}" (${walletType || "?"}) — Methode: ${method}, Modus: ${hashcatMode}${ruleFileNames ? `, Regeln: ${ruleFileNames.join(",")}` : ""}`,
      source: "recovery/start",
      caseId: caseIdSafe,
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error: unknown) {
    console.error("Failed to start job:", error);
    return NextResponse.json({ error: "Konnte Hashcat Job nicht starten." }, { status: 500 });
  }
}
