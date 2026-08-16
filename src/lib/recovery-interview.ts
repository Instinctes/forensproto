/**
 * Geführtes Recovery-Interview → Suchstrategie
 * ============================================
 * Verwandelt freie Erinnerungs-Hinweise einer Person in eine konkrete
 * Suchstrategie (Fragmente, Trenner, Tippfehler-Modelle, Masken).
 *
 * Zweistufig & robust:
 *   1) deterministische Basis-Strategie direkt aus den Antworten
 *      (funktioniert IMMER, auch ohne LLM)
 *   2) optionale Verfeinerung über das lokale LLM (Ollama); schlägt das
 *      Parsen fehl, bleibt die Basis erhalten.
 */

import type { TypoOptions } from "./hint-gen";

export interface InterviewAnswers {
  names?: string; // Namen (Person, Partner, Kinder)
  dates?: string; // wichtige Jahre/Daten
  places?: string; // Orte
  pets?: string; // Haustiere
  keywords?: string; // Hobbys, Vereine, Sonstiges
  suffixes?: string; // typische Endungen (z.B. !, 123)
  minLen?: number;
  maxLen?: number;
  notes?: string; // Freitext
}

export interface RecoveryStrategy {
  parts: string[];
  optionalParts: string[];
  separators: string[];
  caseVariants: boolean;
  leet: boolean;
  permuteOrder: boolean;
  typos: TypoOptions;
  masks: string[];
  summary: string;
}

function tokenize(s?: string): string[] {
  if (!s) return [];
  return s
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 32);
}

/** Extrahiert Jahre / kurze Zahlenformen aus einem Datums-Freitext. */
function extractDateTokens(s?: string): string[] {
  if (!s) return [];
  const out = new Set<string>();
  for (const m of s.matchAll(/\b(19|20)\d{2}\b/g)) {
    out.add(m[0]); // 2019
    out.add(m[0].slice(2)); // 19
  }
  for (const m of s.matchAll(/\b\d{1,2}\b/g)) out.add(m[0]); // Tage/Monate
  return [...out];
}

/** Deterministische Basis-Strategie – braucht kein LLM. */
export function buildBaselineStrategy(a: InterviewAnswers): RecoveryStrategy {
  const parts = [...new Set([...tokenize(a.names), ...tokenize(a.pets), ...tokenize(a.keywords), ...tokenize(a.places)])];
  const optionalParts = [
    ...new Set([...extractDateTokens(a.dates), ...tokenize(a.suffixes), "1", "123", "!", "2024", "2025"]),
  ];
  return {
    parts,
    optionalParts,
    separators: ["", "-", "_", "."],
    caseVariants: true,
    leet: false,
    permuteOrder: true,
    typos: { capslock: false, swap: true, insert: false, delete: true, replace: false },
    masks: [],
    summary: "Heuristische Basis-Strategie aus deinen Angaben (ohne KI).",
  };
}

/** Baut den LLM-Prompt; erzwingt reines JSON. */
export function buildInterviewPrompt(a: InterviewAnswers): string {
  const facts = [
    a.names && `Namen: ${a.names}`,
    a.dates && `Wichtige Daten/Jahre: ${a.dates}`,
    a.places && `Orte: ${a.places}`,
    a.pets && `Haustiere: ${a.pets}`,
    a.keywords && `Hobbys/Sonstiges: ${a.keywords}`,
    a.suffixes && `Typische Endungen: ${a.suffixes}`,
    (a.minLen || a.maxLen) && `Passwortlänge: ${a.minLen ?? "?"}–${a.maxLen ?? "?"}`,
    a.notes && `Notizen: ${a.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Du bist ein forensischer Recovery-Stratege. Eine Person hat ihr eigenes Passwort vergessen und gibt Hinweise. Leite daraus eine Suchstrategie ab.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in GENAU diesem Schema (keine Erklärung, kein Markdown):
{"parts":["sehr wahrscheinliche Bestandteile"],"optionalParts":["mögliche Bestandteile, auch Jahre/Zahlen"],"separators":["","-","_","."],"caseVariants":true,"leet":false,"typos":{"capslock":false,"swap":true,"insert":false,"delete":true,"replace":false},"masks":["z.B. ?u?l?l?l?d?d"],"summary":"kurze Begründung auf Deutsch"}

Hinweise der Person:
${facts}

JSON:`;
}

/** Defensives Parsen der LLM-Antwort (extrahiert das erste JSON-Objekt). */
export function parseInterviewStrategy(text: string): Partial<RecoveryStrategy> | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const strat: Partial<RecoveryStrategy> = {};
    if (Array.isArray(obj.parts)) strat.parts = obj.parts.map(String).filter(Boolean);
    if (Array.isArray(obj.optionalParts)) strat.optionalParts = obj.optionalParts.map(String).filter(Boolean);
    if (Array.isArray(obj.separators)) strat.separators = obj.separators.map(String);
    if (typeof obj.caseVariants === "boolean") strat.caseVariants = obj.caseVariants;
    if (typeof obj.leet === "boolean") strat.leet = obj.leet;
    if (obj.typos && typeof obj.typos === "object") strat.typos = obj.typos;
    if (Array.isArray(obj.masks)) strat.masks = obj.masks.map(String).filter(Boolean);
    if (typeof obj.summary === "string") strat.summary = obj.summary;
    return strat;
  } catch {
    return null;
  }
}

/** Vereinigt Basis + LLM (LLM verfeinert, Basis geht nie verloren). */
export function mergeStrategy(base: RecoveryStrategy, llm: Partial<RecoveryStrategy> | null): RecoveryStrategy {
  if (!llm) return base;
  return {
    parts: [...new Set([...(llm.parts || []), ...base.parts])],
    optionalParts: [...new Set([...(llm.optionalParts || []), ...base.optionalParts])],
    separators: llm.separators && llm.separators.length ? [...new Set([...llm.separators, ...base.separators])] : base.separators,
    caseVariants: typeof llm.caseVariants === "boolean" ? llm.caseVariants : base.caseVariants,
    leet: typeof llm.leet === "boolean" ? llm.leet : base.leet,
    permuteOrder: base.permuteOrder,
    typos: llm.typos ? { ...base.typos, ...llm.typos } : base.typos,
    masks: llm.masks && llm.masks.length ? llm.masks : base.masks,
    summary: llm.summary || base.summary,
  };
}
