import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import { appendAuditLog } from "@/lib/audit-log";
import { readFile } from "fs/promises";
import { join } from "path";
import { getForensprotoStateDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";

/** Liefert den Wallet-Dump (TXT) eines abgeschlossenen Jobs. */
export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job nicht gefunden" }, { status: 404 });

  try {
    const file = join(getForensprotoStateDir(), "dumps", `${jobId}.txt`);
    const content = await readFile(file, "utf-8");
    appendAuditLog({
      level: "warning",
      action: "Wallet-Dump heruntergeladen",
      message: `Dump für Job ${jobId} (${job.walletName}) abgerufen`,
      source: "wallet-dump",
      caseId: job.caseId,
    });
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="walletdump_${jobId.slice(0, 8)}.txt"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Kein Dump verfügbar" }, { status: 404 });
  }
}
