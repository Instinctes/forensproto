import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "fs";
import { mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { getFundedSetDir, getFundedSetFile, FUNDED_SET_FILENAME } from "@/lib/data-dir";
import { startScan, getScanState, requestScanStop } from "@/lib/pattern-scan";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

/**
 * POST /api/visual-key/scan
 * Body: { action: "prepare" | "start" | "status" | "stop" | "reveal", ... }
 *
 * Offline-Muster-Scan (Research): siehe src/lib/pattern-scan.ts.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  const dir = getFundedSetDir();
  const file = getFundedSetFile();

  switch (action) {
    case "prepare": {
      // Ordner anlegen, damit der Nutzer die Adressdatei hineinlegen kann.
      await mkdir(dir, { recursive: true });
      const present = existsSync(file);
      let sizeBytes = 0;
      if (present) {
        try {
          sizeBytes = statSync(file).size;
        } catch {
          /* ignore */
        }
      }
      return NextResponse.json({
        success: true,
        dir,
        fileName: FUNDED_SET_FILENAME,
        file,
        filePresent: present,
        fileSizeBytes: sizeBytes,
      });
    }

    case "reveal": {
      // funded-set-Ordner im Finder öffnen (nur macOS).
      await mkdir(dir, { recursive: true });
      try {
        await execAsync(`open "${dir.replace(/"/g, '\\"')}"`);
        return NextResponse.json({ success: true, opened: dir });
      } catch {
        return NextResponse.json(
          { success: false, error: "Konnte Finder nicht öffnen (nur auf macOS verfügbar)." },
          { status: 500 }
        );
      }
    }

    case "start": {
      const count = Number(body?.count) || 100_000;
      const size = [8, 12, 16].includes(Number(body?.size)) ? Number(body?.size) : 16;
      try {
        startScan({ count, size: size as 8 | 12 | 16 });
        return NextResponse.json({ success: true, state: getScanState() });
      } catch (e) {
        return NextResponse.json(
          { success: false, error: e instanceof Error ? e.message : "Start fehlgeschlagen" },
          { status: 400 }
        );
      }
    }

    case "stop": {
      requestScanStop();
      return NextResponse.json({ success: true, state: getScanState() });
    }

    case "status":
    default: {
      return NextResponse.json({ success: true, state: getScanState() });
    }
  }
}
