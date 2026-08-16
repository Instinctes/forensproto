import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Echter Hashcat-Benchmark — kein erfundenes Fallback.
 * Ohne installiertes/funktionierendes Hashcat → success: false.
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "11300";

  try {
    const { stdout, stderr } = await execAsync(`hashcat -b -m ${mode} --machine-readable`, {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });

    const lines = (stdout || "").trim().split("\n").filter(Boolean);
    let speed = 0;
    let device: string | undefined;

    // machine-readable: SPEED <device_id> ... <speed>
    // older format: MODE:SPEED:...
    for (const line of lines) {
      if (line.startsWith("SPEED")) {
        const parts = line.split(/\s+/);
        // SPEED device_id ... speed_hs is typically last numeric field
        const nums = parts.map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));
        if (nums.length >= 2) {
          const candidate = nums[nums.length - 1];
          if (candidate > speed) speed = candidate;
        }
      }
      if (line.startsWith(`${mode}:`)) {
        const parts = line.split(":");
        const s = parseInt(parts[1], 10);
        if (!Number.isNaN(s) && s > speed) speed = s;
      }
      if (line.startsWith("Device #") || line.includes("Device.")) {
        device = line.trim();
      }
    }

    // Human-readable fallback: "Speed.#1.........:  123.4 kH/s"
    if (speed === 0) {
      const combined = `${stdout}\n${stderr || ""}`;
      const m = combined.match(/Speed\.#\d+[.:\s]+([\d.]+)\s*([kMGT]?H\/s)/i);
      if (m) {
        const val = parseFloat(m[1]);
        const unit = m[2].toUpperCase();
        const mult =
          unit.startsWith("GH") ? 1e9 : unit.startsWith("MH") ? 1e6 : unit.startsWith("KH") ? 1e3 : 1;
        speed = Math.round(val * mult);
      }
    }

    if (speed <= 0) {
      return NextResponse.json(
        {
          success: false,
          mode: parseInt(mode, 10),
          error: "Hashcat lieferte keine messbare Geschwindigkeit. Ist Hashcat installiert und der Mode gültig?",
          raw: lines.slice(0, 20),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: parseInt(mode, 10),
      speed_hs: speed,
      device: device || "hashcat (lokal)",
      measured: true,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const missing = /not found|ENOENT|command not found/i.test(msg);
    return NextResponse.json(
      {
        success: false,
        mode: parseInt(mode, 10),
        error: missing
          ? "Hashcat nicht gefunden. Bitte installieren (z. B. brew install hashcat)."
          : `Benchmark fehlgeschlagen: ${msg}`,
        measured: false,
      },
      { status: missing ? 503 : 500 }
    );
  }
}
