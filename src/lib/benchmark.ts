/**
 * Hashcat-Benchmark-Helfer (wiederverwendbar)
 * Liefert die Hash-Rate (H/s) für einen Modus; fällt auf realistische
 * Apple-/Consumer-Werte zurück, wenn Hashcat nicht läuft.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { backendArgs, selfTestArgs } from "./hashcat-manager";

const execFileAsync = promisify(execFile);

const FALLBACK: Record<string, number> = {
  "11300": 105000, // Bitcoin/Litecoin wallet.dat
  "15600": 1200000, // Ethereum Wallet (PBKDF2)
  "15700": 25000, // Ethereum Wallet (scrypt)
  "16600": 85000, // Electrum
  "6800": 900000, // LastPass
  "9400": 95000, // MS Office 2007
};

export interface BenchmarkResult {
  mode: number;
  speedHps: number;
  fallback: boolean;
  device: string;
}

export async function benchmarkMode(mode: string | number): Promise<BenchmarkResult> {
  const m = String(mode);
  try {
    const { stdout } = await execFileAsync(
      "hashcat",
      ["-b", "-m", m, "--machine-readable", ...backendArgs(), ...selfTestArgs()],
      { timeout: 90000 }
    );
    for (const line of stdout.trim().split("\n")) {
      if (line.startsWith(`${m}:`)) {
        const parts = line.split(":");
        const speed = parseInt(parts[1], 10);
        if (Number.isFinite(speed) && speed > 0) {
          return { mode: parseInt(m, 10), speedHps: speed, fallback: false, device: "GPU" };
        }
      }
    }
  } catch {
    /* hashcat nicht verfügbar → Fallback */
  }
  return { mode: parseInt(m, 10), speedHps: FALLBACK[m] || 50000, fallback: true, device: "Schätzwert" };
}
