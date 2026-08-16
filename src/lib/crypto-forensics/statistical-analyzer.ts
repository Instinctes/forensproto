/**
 * Module H — Statistische Analyse
 *
 * Shannon-Entropy, Chi-Quadrat, Monobit, Runs-Test.
 * Bewertet die Zufälligkeit von kryptografischen Daten.
 */

import type { EntropyAnalysis } from "./types";

// ============================================================================
// Shannon-Entropy
// ============================================================================

export function calculateShannonEntropy(data: Buffer): number {
  if (data.length === 0) return 0;

  const freq = new Array(256).fill(0);
  for (const byte of data) freq[byte]++;

  let entropy = 0;
  const len = data.length;
  for (const f of freq) {
    if (f > 0) {
      const p = f / len;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

// ============================================================================
// Chi-Quadrat Test
// ============================================================================

export function chiSquareTest(data: Buffer): { statistic: number; pValue: number } {
  if (data.length === 0) return { statistic: 0, pValue: 1 };

  const observed = new Array(256).fill(0);
  for (const byte of data) observed[byte]++;

  const expected = data.length / 256;
  let chiSq = 0;
  for (let i = 0; i < 256; i++) {
    chiSq += Math.pow(observed[i] - expected, 2) / expected;
  }

  // p-Wert Approximation für df=255 via Wilson-Hilferty
  const df = 255;
  const z = Math.pow(chiSq / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  const zScore = z / denom;

  // Standard Normal CDF Approximation
  const pValue = 1 - normalCDF(zScore);

  return { statistic: chiSq, pValue: Math.max(0, Math.min(1, pValue)) };
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const p = d * Math.exp(-x * x / 2) * t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// ============================================================================
// Monobit Test (NIST SP 800-22)
// ============================================================================

export function monobitTest(data: Buffer): { ratio: number; pass: boolean } {
  if (data.length === 0) return { ratio: 0.5, pass: false };

  let ones = 0;
  let total = 0;
  for (const byte of data) {
    for (let bit = 7; bit >= 0; bit--) {
      if ((byte >> bit) & 1) ones++;
      total++;
    }
  }

  const ratio = ones / total;
  // Pass wenn zwischen 0.48 und 0.52 (±2% von 50%)
  const pass = ratio >= 0.48 && ratio <= 0.52;

  return { ratio, pass };
}

// ============================================================================
// Runs Test (NIST SP 800-22)
// ============================================================================

export function runsTest(data: Buffer): { count: number; pass: boolean } {
  if (data.length === 0) return { count: 0, pass: false };

  // Bits extrahieren
  const bits: number[] = [];
  for (const byte of data) {
    for (let bit = 7; bit >= 0; bit--) {
      bits.push((byte >> bit) & 1);
    }
  }

  if (bits.length < 100) return { count: 0, pass: false };

  // Runs zählen (Wechsel zwischen 0 und 1)
  let runs = 1;
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] !== bits[i - 1]) runs++;
  }

  // Erwartete Runs für n Bits mit Proportion π
  const n = bits.length;
  const ones = bits.filter((b) => b === 1).length;
  const pi = ones / n;

  // Vortest: Wenn π zu weit von 0.5, ist der Test nicht anwendbar
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
    return { count: runs, pass: false };
  }

  const expectedRuns = 2 * n * pi * (1 - pi) + 1;
  const variance = 2 * n * pi * (1 - pi) * (2 * pi * (1 - pi) - 1 / n);
  const stdDev = Math.sqrt(Math.abs(variance));

  if (stdDev === 0) return { count: runs, pass: false };

  const zScore = Math.abs(runs - expectedRuns) / stdDev;
  const pass = zScore < 1.96; // 95% Konfidenzintervall

  return { count: runs, pass };
}

// ============================================================================
// Byte-Frequenzverteilung
// ============================================================================

export function byteFrequency(data: Buffer): number[] {
  const freq = new Array(256).fill(0);
  for (const byte of data) freq[byte]++;
  return freq;
}

// ============================================================================
// Vollständige Entropy-Analyse
// ============================================================================

export function analyzeEntropy(hexData: string): EntropyAnalysis {
  const clean = hexData.replace(/\s+/g, "");
  const buffer = Buffer.from(clean, "hex");

  if (buffer.length === 0) {
    return {
      shannonEntropy: 0,
      entropyLevel: "LOW",
      chiSquare: 0,
      chiSquarePValue: 1,
      monobitRatio: 0,
      monobitPass: false,
      runsCount: 0,
      runsPass: false,
      byteFrequency: new Array(256).fill(0),
      assessment: "Keine Daten zum Analysieren.",
    };
  }

  const shannon = calculateShannonEntropy(buffer);
  const chi = chiSquareTest(buffer);
  const mono = monobitTest(buffer);
  const runs = runsTest(buffer);
  const freq = byteFrequency(buffer);

  // Entropy Level Bewertung
  let entropyLevel: EntropyAnalysis["entropyLevel"];
  if (shannon < 3) entropyLevel = "LOW";
  else if (shannon < 6) entropyLevel = "NORMAL";
  else if (shannon < 7.5) entropyLevel = "HIGH";
  else entropyLevel = "MAXIMUM";

  // Gesamtbewertung
  let assessment: string;
  const passCount = [mono.pass, runs.pass, chi.pValue > 0.01].filter(Boolean).length;

  if (entropyLevel === "LOW") {
    assessment =
      "Entropie deutlich unter dem Erwartungswert für zufällige Daten. " +
      "Die Daten zeigen starke Muster oder Wiederholungen. " +
      "Für kryptografische Schlüssel-Material NICHT geeignet.";
  } else if (entropyLevel === "MAXIMUM" && passCount >= 2) {
    assessment =
      "Entropie nahe am theoretischen Maximum. " +
      "Statistische Tests zeigen gleichmäßige Verteilung. " +
      "Konsistent mit kryptografisch sicherem Zufalls-Material oder verschlüsselten Daten.";
  } else if (passCount === 0) {
    assessment =
      "Alle statistischen Tests fehlgeschlagen. " +
      "Die Daten zeigen signifikante Abweichungen von echtem Zufall. " +
      "Verdacht auf schwachen PRNG oder strukturierte Daten.";
  } else {
    assessment =
      `${passCount} von 3 statistischen Tests bestanden. ` +
      `Shannon-Entropie: ${shannon.toFixed(3)} bit/byte. ` +
      "Teilweise konsistent mit zufälligen Daten, aber Auffälligkeiten vorhanden.";
  }

  return {
    shannonEntropy: shannon,
    entropyLevel,
    chiSquare: chi.statistic,
    chiSquarePValue: chi.pValue,
    monobitRatio: mono.ratio,
    monobitPass: mono.pass,
    runsCount: runs.count,
    runsPass: runs.pass,
    byteFrequency: freq,
    assessment,
  };
}
