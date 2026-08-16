/**
 * Module H — PRNG-Analyse
 *
 * Tests basierend auf NIST SP 800-22.
 * Bewertet ob Daten von einem kryptografisch sicheren PRNG stammen.
 */

import type { PRNGAnalysis } from "./types";

// ============================================================================
// Frequency Test (Monobit)
// ============================================================================

function frequencyTest(bits: number[]): { pass: boolean; pValue: number; statistic: number } {
  const n = bits.length;
  if (n < 100) return { pass: false, pValue: 0, statistic: 0 };

  let sum = 0;
  for (const bit of bits) {
    sum += bit === 1 ? 1 : -1;
  }

  const sObs = Math.abs(sum) / Math.sqrt(n);
  const pValue = erfc(sObs / Math.sqrt(2));

  return {
    pass: pValue >= 0.01,
    pValue,
    statistic: sObs,
  };
}

// ============================================================================
// Block Frequency Test
// ============================================================================

function blockFrequencyTest(
  bits: number[],
  blockSize: number = 128
): { pass: boolean; pValue: number; blockSize: number } {
  const n = bits.length;
  const numBlocks = Math.floor(n / blockSize);

  if (numBlocks < 1) return { pass: false, pValue: 0, blockSize };

  let chiSq = 0;
  for (let i = 0; i < numBlocks; i++) {
    const block = bits.slice(i * blockSize, (i + 1) * blockSize);
    const ones = block.filter((b) => b === 1).length;
    const pi = ones / blockSize;
    chiSq += Math.pow(pi - 0.5, 2);
  }

  chiSq *= 4 * blockSize;

  // p-Wert via incomplete gamma function approximation
  const df = numBlocks;
  const pValue = igamc(df / 2, chiSq / 2);

  return {
    pass: pValue >= 0.01,
    pValue: Math.max(0, Math.min(1, pValue)),
    blockSize,
  };
}

// ============================================================================
// Runs Test
// ============================================================================

function runsTestNIST(bits: number[]): { pass: boolean; pValue: number; totalRuns: number } {
  const n = bits.length;
  if (n < 100) return { pass: false, pValue: 0, totalRuns: 0 };

  const ones = bits.filter((b) => b === 1).length;
  const pi = ones / n;

  // Vortest
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
    return { pass: false, pValue: 0, totalRuns: 0 };
  }

  let runs = 1;
  for (let i = 1; i < n; i++) {
    if (bits[i] !== bits[i - 1]) runs++;
  }

  const numerator = Math.abs(runs - 2 * n * pi * (1 - pi));
  const denominator = 2 * Math.sqrt(2 * n) * pi * (1 - pi);

  if (denominator === 0) return { pass: false, pValue: 0, totalRuns: runs };

  const pValue = erfc(numerator / denominator);

  return {
    pass: pValue >= 0.01,
    pValue,
    totalRuns: runs,
  };
}

// ============================================================================
// Vollständige PRNG-Analyse
// ============================================================================

export function analyzePRNG(hexData: string): PRNGAnalysis {
  const clean = hexData.replace(/\s+/g, "");
  const buffer = Buffer.from(clean, "hex");

  // Bits extrahieren
  const bits: number[] = [];
  for (const byte of buffer) {
    for (let bit = 7; bit >= 0; bit--) {
      bits.push((byte >> bit) & 1);
    }
  }

  const freq = frequencyTest(bits);
  const blockFreq = blockFrequencyTest(bits, Math.min(128, Math.floor(bits.length / 10)));
  const runs = runsTestNIST(bits);

  const overallPass = freq.pass && blockFreq.pass && runs.pass;
  const weakPRNGSuspected = !overallPass;

  let assessment: string;
  const passCount = [freq.pass, blockFreq.pass, runs.pass].filter(Boolean).length;

  if (passCount === 3) {
    assessment =
      "Alle NIST SP 800-22 Tests bestanden. Die Daten sind konsistent mit einem " +
      "kryptografisch sicheren Pseudo-Zufallszahlengenerator.";
  } else if (passCount >= 2) {
    assessment =
      `${passCount}/3 Tests bestanden. Leichte Auffälligkeiten, aber kein definitiver ` +
      "Hinweis auf einen schwachen PRNG. Weitere Analyse empfohlen.";
  } else if (passCount === 1) {
    assessment =
      "Nur 1/3 Tests bestanden. Signifikante statistische Auffälligkeiten. " +
      "Verdacht auf schwachen oder vorhersagbaren PRNG. Forensische Untersuchung empfohlen.";
  } else {
    assessment =
      "Alle statistischen Tests fehlgeschlagen. Die Daten zeigen keine Eigenschaften " +
      "eines kryptografisch sicheren PRNG. Möglicherweise deterministisch oder manipuliert.";
  }

  return {
    frequencyTest: freq,
    blockFrequencyTest: blockFreq,
    runsTest: runs,
    overallPass,
    weakPRNGSuspected,
    assessment,
  };
}

// ============================================================================
// Mathematische Hilfsfunktionen
// ============================================================================

/** Complementary Error Function */
function erfc(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 1 - sign * y;
}

/** Regularized upper incomplete gamma function (approximation) */
function igamc(a: number, x: number): number {
  if (x <= 0 || a <= 0) return 1.0;
  if (x < 1.0 || x < a) return 1.0 - igam(a, x);

  let ans = 0;
  let ax = a * Math.log(x) - x - lgamma(a);
  if (ax < -709.78) return 0.0;
  ax = Math.exp(ax);

  let y = 1.0 - a;
  let z = x + y + 1.0;
  let c = 0.0;
  let pkm2 = 1.0;
  let qkm2 = x;
  let pkm1 = x + 1.0;
  let qkm1 = z * x;
  ans = pkm1 / qkm1;

  let t: number;
  for (let i = 0; i < 200; i++) {
    c += 1.0;
    y += 1.0;
    z += 2.0;
    const yc = y * c;
    const pk = pkm1 * z - pkm2 * yc;
    const qk = qkm1 * z - qkm2 * yc;
    if (qk !== 0) {
      const r = pk / qk;
      t = Math.abs((ans - r) / r);
      ans = r;
    } else {
      t = 1.0;
    }
    pkm2 = pkm1;
    pkm1 = pk;
    qkm2 = qkm1;
    qkm1 = qk;
    if (Math.abs(pk) > 1e10) {
      pkm2 *= 1e-10;
      pkm1 *= 1e-10;
      qkm2 *= 1e-10;
      qkm1 *= 1e-10;
    }
    if (t < 1e-12) break;
  }

  return ans * ax;
}

function igam(a: number, x: number): number {
  if (x <= 0 || a <= 0) return 0;

  let ax = a * Math.log(x) - x - lgamma(a);
  if (ax < -709.78) return 0;
  ax = Math.exp(ax);

  let r = a;
  let c = 1.0;
  let ans = 1.0;

  for (let i = 0; i < 200; i++) {
    r += 1.0;
    c *= x / r;
    ans += c;
    if (c / ans < 1e-12) break;
  }

  return ans * ax / a;
}

function lgamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
