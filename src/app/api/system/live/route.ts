import { NextResponse } from "next/server";
import si from "systeminformation";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { energyConfig } from "@/lib/energy";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// CPU-Temperatur ist auf Apple Silicon teuer/eingeschränkt zu lesen →
// 15s cachen und nicht dauerhaft deaktivieren (damit ein nachträglich
// gesetzter sudoers-Eintrag ohne Server-Neustart greift).
const globalForTemp = global as unknown as { __cpuTemp?: { val: number | null; ts: number } };
const tempCache = globalForTemp.__cpuTemp || (globalForTemp.__cpuTemp = { val: null, ts: 0 });

async function readExternalTemp(): Promise<number | null> {
  if (process.platform !== "darwin") return null;

  // 1) Benutzerdefiniertes Kommando (z.B. macmon/istats-Wrapper, ohne sudo)
  const cmd = process.env.FORENSPROTO_CPUTEMP_CMD;
  if (cmd) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      const m = stdout.match(/([\d]+(?:\.\d+)?)/);
      if (m) return Math.round(parseFloat(m[1]));
    } catch {
      /* weiter */
    }
  }

  // 2) istats / osx-cpu-temp (Intel-Macs, falls installiert)
  const tools: Array<{ bin: string; args: string[] }> = [
    { bin: "istats", args: ["cpu", "temp", "--value-only"] },
    { bin: "osx-cpu-temp", args: ["-c"] },
  ];
  for (const t of tools) {
    try {
      const { stdout } = await execFileAsync(t.bin, t.args, { timeout: 4000 });
      const m = stdout.match(/([\d]+(?:\.\d+)?)/);
      if (m) return Math.round(parseFloat(m[1]));
    } catch {
      /* weiter */
    }
  }

  // 3) powermetrics (Apple Silicon; benötigt passwortloses sudo)
  try {
    const { stdout } = await execFileAsync("sudo", ["-n", "powermetrics", "--samplers", "smc", "-n", "1", "-i", "1"], { timeout: 5000 });
    const m = stdout.match(/CPU die temperature:\s*([\d.]+)/i) || stdout.match(/die temperature:\s*([\d.]+)/i);
    if (m) return Math.round(parseFloat(m[1]));
  } catch {
    /* kein sudo */
  }
  return null;
}

async function cachedExternalTemp(): Promise<number | null> {
  if (Date.now() - tempCache.ts < 15000) return tempCache.val;
  tempCache.ts = Date.now();
  tempCache.val = await readExternalTemp();
  return tempCache.val;
}

export async function GET() {
  try {
    const [load, mem, graphics, cpuTemp] = await Promise.allSettled([
      si.currentLoad(),
      si.mem(),
      si.graphics(),
      si.cpuTemperature(),
    ]);

    const cpuLoad = load.status === "fulfilled" ? Math.round(load.value.currentLoad) : null;

    let ramUsedGB: number | null = null;
    let ramTotalGB: number | null = null;
    if (mem.status === "fulfilled") {
      ramTotalGB = +(mem.value.total / 1024 ** 3).toFixed(1);
      ramUsedGB = +(mem.value.active / 1024 ** 3).toFixed(1);
    }

    let gpuUtil: number | null = null;
    let gpuTemp: number | null = null;
    let vramUsedMB: number | null = null;
    let vramTotalMB: number | null = null;
    let gpuName: string | null = null;
    if (graphics.status === "fulfilled") {
      const ctrls = graphics.value.controllers || [];
      const g = ctrls.find((c) => (c.utilizationGpu ?? 0) > 0) || ctrls[0];
      if (g) {
        gpuName = g.model || null;
        gpuUtil = typeof g.utilizationGpu === "number" ? Math.round(g.utilizationGpu) : null;
        gpuTemp = typeof g.temperatureGpu === "number" && g.temperatureGpu > 0 ? g.temperatureGpu : null;
        vramUsedMB = typeof g.memoryUsed === "number" ? g.memoryUsed : null;
        vramTotalMB = typeof g.memoryTotal === "number" ? g.memoryTotal : null;
      }
    }

    let cpuTemperature: number | null =
      cpuTemp.status === "fulfilled" && typeof cpuTemp.value.main === "number" && cpuTemp.value.main > 0
        ? Math.round(cpuTemp.value.main)
        : null;
    if (cpuTemperature === null) cpuTemperature = await cachedExternalTemp();

    return NextResponse.json({
      success: true,
      ts: Date.now(),
      cpu: { loadPct: cpuLoad, tempC: cpuTemperature },
      gpu: { name: gpuName, utilPct: gpuUtil, tempC: gpuTemp, vramUsedMB, vramTotalMB },
      ram: { usedGB: ramUsedGB, totalGB: ramTotalGB },
      powerWConfig: energyConfig().watts,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Live-Metriken nicht verfügbar" }, { status: 500 });
  }
}
