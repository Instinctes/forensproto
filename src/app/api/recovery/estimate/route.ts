import { NextRequest, NextResponse } from "next/server";
import { computeKeyspace } from "@/lib/keyspace";
import { benchmarkMode } from "@/lib/benchmark";
import { estimateRecovery } from "@/lib/recovery-estimate";
import { resolveRuleFile } from "@/lib/rules-store";
import { getWordlistsDir } from "@/lib/data-dir";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * Schätzt vor dem Start Dauer/Kosten/Machbarkeit eines Recovery-Jobs.
 * Nutzt Hashcats --keyspace + einen Benchmark des Modus.
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const hashcatMode = parseInt(String(data.hashcatMode), 10);
    if (!hashcatMode) {
      return NextResponse.json({ success: false, error: "hashcatMode erforderlich" }, { status: 400 });
    }

    let attackMode = 0;
    if (data.method === "mask") attackMode = 3;
    if (data.method === "hybrid") attackMode = 6;
    if (typeof data.attackMode === "number") attackMode = data.attackMode;

    const wordlistFilePath =
      typeof data.wordlist === "string" && /^[\w.\-]+$/.test(data.wordlist)
        ? join(getWordlistsDir(), data.wordlist)
        : undefined;
    const ruleFiles = (Array.isArray(data.ruleFile) ? data.ruleFile : data.ruleFile ? [data.ruleFile] : [])
      .map((r: string) => resolveRuleFile(r))
      .filter((p: string | null): p is string => !!p);

    const gpuCount = typeof data.gpuCount === "number" && data.gpuCount > 0 ? data.gpuCount : 1;

    const [keyspace, bench] = await Promise.all([
      computeKeyspace({ hashcatMode, attackMode, wordlistFilePath, mask: data.mask, ruleFiles }),
      benchmarkMode(hashcatMode),
    ]);

    const estimate = estimateRecovery({
      keyspace,
      speedHps: bench.speedHps * gpuCount,
      gpuCount,
      costPerGpuHourUsd: typeof data.costPerGpuHourUsd === "number" ? data.costPerGpuHourUsd : undefined,
    });

    return NextResponse.json({
      success: true,
      keyspace,
      benchmark: bench,
      gpuCount,
      estimate,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Schätzung fehlgeschlagen" }, { status: 500 });
  }
}
