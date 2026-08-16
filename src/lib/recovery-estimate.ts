/**
 * Machbarkeits-/Zeit-/Kosten-Schätzer
 * ===================================
 * Rechnet aus Keyspace-Größe und gemessener Hash-Rate eine ehrliche
 * Vorab-Einschätzung: Dauer, GPU-Stunden, grobe Cloud-Kosten und eine
 * Ampel (aussichtsreich / grenzwertig / unrealistisch). Reine Mathematik,
 * vollständig testbar.
 */

export interface EstimateInput {
  keyspace: number | null; // null = unbekannt
  speedHps: number; // Gesamt-Durchsatz in Kandidaten/Sekunde
  gpuCount?: number; // Anzahl (gemieteter) GPUs für die Kostenrechnung
  costPerGpuHourUsd?: number; // Standard: grobe Consumer-GPU-Cloudrate
  averageCaseFactor?: number; // im Schnitt wird ~50% des Raums durchsucht
}

export type Feasibility = "green" | "amber" | "red" | "unknown";

export interface EstimateResult {
  known: boolean;
  seconds: number | null;
  human: string;
  gpuHours: number | null;
  costUsd: number | null;
  feasibility: Feasibility;
  label: string;
  note: string;
}

const DAY = 86_400;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return "∞";
  if (seconds < 1) return "<1s";
  if (seconds > 100 * YEAR) return ">100 Jahre";
  const y = Math.floor(seconds / YEAR);
  const d = Math.floor((seconds % YEAR) / DAY);
  const h = Math.floor((seconds % DAY) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (y > 0) return `${y}J ${d}T`;
  if (d > 0) return `${d}T ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function estimateRecovery(input: EstimateInput): EstimateResult {
  const { keyspace, speedHps } = input;
  const gpuCount = input.gpuCount && input.gpuCount > 0 ? input.gpuCount : 1;
  const rate = input.costPerGpuHourUsd ?? 0.4;
  const avg = input.averageCaseFactor ?? 0.5; // Erwartungswert: halber Keyspace

  if (!keyspace || keyspace <= 0 || !speedHps || speedHps <= 0) {
    return {
      known: false,
      seconds: null,
      human: "unbekannt",
      gpuHours: null,
      costUsd: null,
      feasibility: "unknown",
      label: "nicht bestimmbar",
      note: "Keyspace oder Geschwindigkeit konnten nicht ermittelt werden (Hashcat verfügbar?).",
    };
  }

  // Vollständige Erschöpfung (worst case) und Erwartungswert (avg case)
  const worstSeconds = keyspace / speedHps;
  const expectedSeconds = worstSeconds * avg;

  const gpuHours = +((worstSeconds / 3600) * gpuCount).toFixed(2);
  const costUsd = +(gpuHours * rate).toFixed(2);

  let feasibility: Feasibility;
  let label: string;
  if (expectedSeconds <= DAY) {
    feasibility = "green";
    label = "aussichtsreich";
  } else if (expectedSeconds <= MONTH) {
    feasibility = "amber";
    label = "grenzwertig";
  } else {
    feasibility = "red";
    label = "unrealistisch";
  }

  const note =
    feasibility === "green"
      ? "Sehr gute Chance – Job kann gestartet werden."
      : feasibility === "amber"
        ? "Machbar, aber langwierig – mehr GPUs/Cloud oder engerer Suchraum empfohlen."
        : "Mit aktuellem Suchraum/Tempo praktisch nicht lösbar – Suchraum einschränken (Hints, Maske, Regeln) oder verteilen.";

  return {
    known: true,
    seconds: Math.round(expectedSeconds),
    human: formatDuration(expectedSeconds),
    gpuHours,
    costUsd,
    feasibility,
    label,
    note,
  };
}
