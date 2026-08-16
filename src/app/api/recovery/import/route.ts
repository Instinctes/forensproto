import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createJob } from "@/lib/job-store";
import { enqueueJob } from "@/lib/queue";
import { appendAuditLog } from "@/lib/audit-log";
import { resolveRuleFile } from "@/lib/rules-store";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, writeFile } from "fs/promises";

const SAFE_NAME = /^[\w.\-]+$/;

/**
 * Job-Mobilität: importiert einen exportierten Recovery-Digest und legt
 * daraus auf dieser Maschine einen neuen Job an (ohne die Wallet-Datei zu
 * benötigen — nur der Hash + die Parameter werden übertragen).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const d = body.digest || body;
    if (!d || !d.hashString || !d.hashcatMode) {
      return NextResponse.json({ success: false, error: "Ungültiger Digest (hashString/hashcatMode fehlen)" }, { status: 400 });
    }

    const jobId = randomUUID();
    const tempDir = join(tmpdir(), "alphaforensic", jobId);
    await mkdir(tempDir, { recursive: true });
    const hashFilePath = join(tempDir, "target.hash");
    await writeFile(hashFilePath, String(d.hashString));

    const method = typeof d.method === "string" ? d.method : "dictionary";
    let attackMode = typeof d.attackMode === "number" ? d.attackMode : 0;
    if (d.method === "mask") attackMode = 3;
    if (d.method === "hybrid") attackMode = 6;

    const wordlist = typeof d.wordlist === "string" && SAFE_NAME.test(d.wordlist) ? d.wordlist : undefined;
    const ruleFiles = Array.isArray(d.ruleFiles)
      ? d.ruleFiles.filter((r: unknown) => typeof r === "string" && !!resolveRuleFile(r))
      : undefined;

    createJob({
      id: jobId,
      walletName: (d.walletName || "Importierter Job") + " (importiert)",
      walletType: d.walletType || "unknown",
      hashcatMode: parseInt(String(d.hashcatMode), 10),
      method,
      hashString: String(d.hashString),
      hashFile: hashFilePath,
      wordlist,
      mask: typeof d.mask === "string" ? d.mask : undefined,
      sessionName: `forensproto_${jobId}`,
      attackMode,
      ruleFiles,
    });
    enqueueJob(jobId);

    appendAuditLog({
      level: "info",
      action: "Recovery-Job importiert",
      message: `Digest importiert → ${d.walletName || "Job"} (Modus ${d.hashcatMode}, ${method})`,
      source: "recovery/import",
    });

    return NextResponse.json({ success: true, jobId });
  } catch {
    return NextResponse.json({ success: false, error: "Import fehlgeschlagen" }, { status: 500 });
  }
}
