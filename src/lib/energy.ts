/**
 * Energie-/Kosten-/CO₂-Schätzung pro Recovery-Job
 * ===============================================
 * Transparenz bei tagelangen GPU-Läufen: aus Laufzeit × Leistungsaufnahme
 * werden kWh, Stromkosten und CO₂-Fußabdruck geschätzt. Reine Mathematik,
 * vollständig testbar. Parameter über Umgebungsvariablen anpassbar.
 */

export interface EnergyInput {
  elapsedSec: number;
  watts?: number; // GPU-Leistungsaufnahme (Default 300 W)
  kwhPriceEur?: number; // Strompreis €/kWh (Default 0.30)
  co2PerKwh?: number; // g CO₂ pro kWh (Default 380, DE-Strommix-Näherung)
}

export interface EnergyResult {
  kWh: number;
  costEur: number;
  co2g: number;
  human: string;
}

export function estimateEnergy(input: EnergyInput): EnergyResult {
  const watts = input.watts && input.watts > 0 ? input.watts : 300;
  const price = input.kwhPriceEur ?? 0.3;
  const co2 = input.co2PerKwh ?? 380;
  const hours = Math.max(0, input.elapsedSec) / 3600;

  const kWh = (watts * hours) / 1000;
  const costEur = kWh * price;
  const co2g = kWh * co2;

  const human =
    kWh < 0.01
      ? "<0,01 kWh"
      : `${kWh.toFixed(2)} kWh · ${costEur.toFixed(2)} € · ${co2g < 1000 ? `${Math.round(co2g)} g` : `${(co2g / 1000).toFixed(2)} kg`} CO₂`;

  return { kWh: +kWh.toFixed(4), costEur: +costEur.toFixed(4), co2g: +co2g.toFixed(1), human };
}

/** Defaults aus Umgebungsvariablen (für serverseitige Nutzung). */
export function energyConfig() {
  const watts = parseInt(process.env.FORENSPROTO_GPU_WATTS || "300", 10);
  const price = parseFloat(process.env.FORENSPROTO_KWH_PRICE || "0.30");
  const co2 = parseFloat(process.env.FORENSPROTO_CO2_G_PER_KWH || "380");
  return {
    watts: Number.isFinite(watts) && watts > 0 ? watts : 300,
    kwhPriceEur: Number.isFinite(price) ? price : 0.3,
    co2PerKwh: Number.isFinite(co2) ? co2 : 380,
  };
}
