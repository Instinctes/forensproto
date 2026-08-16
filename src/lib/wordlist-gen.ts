/**
 * Zielgerichteter Wortlisten-Generator (Closed-Loop)
 * ==================================================
 * Macht aus OSINT-/Fall-Hinweisen (Namen, Daten, Firmen, Haustiere …)
 * und bereits geknackten Passwörtern eine kompakte, hochrelevante
 * Wortliste für Dictionary-Angriffe. Vollständig deterministisch (testbar).
 */

const LEET: Record<string, string> = { a: "@", e: "3", o: "0", i: "1", s: "$", t: "7" };

const SUFFIXES = ["", "1", "12", "123", "1234", "!", "123!", "01", "007", "2022", "2023", "2024", "2025"];

function leetify(s: string): string {
  return s
    .split("")
    .map((c) => LEET[c.toLowerCase()] ?? c)
    .join("");
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export interface WordlistOptions {
  keywords: string[];
  bases?: string[]; // z.B. bereits geknackte Passwörter als zusätzliche Basis
  maxSize?: number;
  combine?: boolean; // Keyword-Paare kombinieren
}

/**
 * Erzeugt Kandidaten aus einem einzelnen Basiswort.
 * Reihenfolge ist deterministisch (wichtig für Tests/Reproduzierbarkeit).
 */
function variantsOf(base: string): string[] {
  const out: string[] = [];
  const lower = base.toLowerCase();
  const forms = [lower, capitalize(lower), base.toUpperCase(), leetify(lower), capitalize(leetify(lower))];
  const seen = new Set<string>();
  for (const f of forms) {
    if (seen.has(f)) continue;
    seen.add(f);
    for (const suf of SUFFIXES) out.push(f + suf);
  }
  return out;
}

export function generateWordlist(opts: WordlistOptions): string[] {
  const maxSize = opts.maxSize && opts.maxSize > 0 ? opts.maxSize : 5000;
  const combine = opts.combine !== false;

  const bases = [...opts.keywords, ...(opts.bases || [])]
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w.length <= 32);

  const result = new Set<string>();

  // 1) Einzelwort-Varianten
  for (const b of bases) {
    for (const v of variantsOf(b)) {
      result.add(v);
      if (result.size >= maxSize) return [...result];
    }
  }

  // 2) Paar-Kombinationen (nur bei überschaubarer Keyword-Zahl)
  if (combine && opts.keywords.length >= 2 && opts.keywords.length <= 8) {
    const kw = opts.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    for (let i = 0; i < kw.length; i++) {
      for (let j = 0; j < kw.length; j++) {
        if (i === j) continue;
        for (const suf of ["", "1", "123", "!", "2024", "2025"]) {
          result.add(`${kw[i]}${capitalize(kw[j])}${suf}`);
          if (result.size >= maxSize) return [...result];
        }
      }
    }
  }

  return [...result];
}
