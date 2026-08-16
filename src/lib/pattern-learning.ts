/**
 * Closed-Loop Pattern-Learning
 * ============================
 * Lernt aus bereits wiederhergestellten Passwörtern und speist die
 * Erkenntnisse zurück in die Engine: abgeleitete Hashcat-Masken und
 * Kandidaten-Regeln. Vollständig deterministisch (testbar), keine
 * externe KI nötig – ergänzt die Ollama-Regelgenerierung.
 */

import { getAllJobs } from "./job-store";

/** Eindeutige, echte Passwörter aus abgeschlossenen Jobs. */
export function getRecoveredPasswords(): string[] {
  const seen = new Set<string>();
  for (const j of getAllJobs()) {
    if (j.status === "completed" && j.recoveredPassword) {
      const pw = j.recoveredPassword.trim();
      if (pw && !pw.startsWith("Found")) seen.add(pw);
    }
  }
  return [...seen];
}

/** Wandelt ein Passwort in eine Hashcat-Maske (?l ?u ?d ?s) um. */
export function passwordToMask(pw: string): string {
  let mask = "";
  for (const ch of pw) {
    if (/[a-z]/.test(ch)) mask += "?l";
    else if (/[A-Z]/.test(ch)) mask += "?u";
    else if (/[0-9]/.test(ch)) mask += "?d";
    else mask += "?s";
  }
  return mask;
}

export interface PatternAnalysis {
  sampleSize: number;
  lengths: { min: number; max: number; avg: number };
  masks: Array<{ mask: string; count: number }>;
  charsets: { lower: number; upper: number; digit: number; special: number };
  suggestedRules: string[];
  suggestedMasks: string[];
}

const LEET: Record<string, string> = { a: "@", e: "3", o: "0", i: "1", s: "$", t: "7" };

/** Leitet deterministisch Kandidaten-Regeln aus beobachteten Passwörtern ab. */
export function suggestRules(passwords: string[]): string[] {
  const rules = new Set<string>();
  rules.add(":"); // unverändert
  rules.add("c"); // Capitalize
  rules.add("u"); // Uppercase
  rules.add("l"); // Lowercase

  const trailingDigitRuns = new Map<string, number>();
  let leetSeen = false;
  let leadingUpper = 0;

  for (const pw of passwords) {
    // Endständige Ziffern (z.B. "123", "2024", "1")
    const m = pw.match(/(\d{1,4})$/);
    if (m) trailingDigitRuns.set(m[1], (trailingDigitRuns.get(m[1]) || 0) + 1);
    // Großbuchstabe am Anfang
    if (/^[A-Z]/.test(pw)) leadingUpper++;
    // Leetspeak vorhanden?
    if (/[@30$17]/.test(pw)) leetSeen = true;
  }

  // Häufigste Ziffern-Endungen → Append-Regeln ($x je Ziffer)
  [...trailingDigitRuns.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([digits]) => {
      rules.add(digits.split("").map((d) => `$${d}`).join(""));
    });

  if (leadingUpper > 0) rules.add("c");

  // Leetspeak-Substitutionen, falls beobachtet
  if (leetSeen) {
    for (const [from, to] of Object.entries(LEET)) rules.add(`s${from}${to}`);
  }

  return [...rules];
}

export function analyzePatterns(passwords: string[]): PatternAnalysis {
  const sampleSize = passwords.length;
  const lengths = passwords.map((p) => p.length);
  const maskCounts = new Map<string, number>();
  const charsets = { lower: 0, upper: 0, digit: 0, special: 0 };

  for (const pw of passwords) {
    const mask = passwordToMask(pw);
    maskCounts.set(mask, (maskCounts.get(mask) || 0) + 1);
    if (/[a-z]/.test(pw)) charsets.lower++;
    if (/[A-Z]/.test(pw)) charsets.upper++;
    if (/[0-9]/.test(pw)) charsets.digit++;
    if (/[^a-zA-Z0-9]/.test(pw)) charsets.special++;
  }

  const masks = [...maskCounts.entries()]
    .map(([mask, count]) => ({ mask, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sampleSize,
    lengths: {
      min: lengths.length ? Math.min(...lengths) : 0,
      max: lengths.length ? Math.max(...lengths) : 0,
      avg: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
    },
    masks,
    charsets,
    suggestedRules: suggestRules(passwords),
    suggestedMasks: masks.slice(0, 10).map((m) => m.mask),
  };
}

/** Komplette Lern-Auswertung über alle bisher wiederhergestellten Passwörter. */
export function learnFromHistory(): PatternAnalysis {
  return analyzePatterns(getRecoveredPasswords());
}
