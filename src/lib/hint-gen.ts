/**
 * Hint-/Token-Generator („Ich erinnere mich an Teile")
 * ====================================================
 * Macht aus erinnerten Fragmenten + typischen Tippfehlern einen
 * durchsuchbaren Kandidatenraum — der menschenfreundlichste
 * Recovery-Ansatz (vgl. BTCRecover Token-Listen). Deterministisch & testbar.
 *
 * Eingabe:
 *   parts          – sicher erinnerte Fragmente (z.B. ["Max","2019"])
 *   optionalParts  – evtl. vorhandene Fragmente (jeweils auch weglassbar)
 *   separators     – Trenner zwischen Fragmenten (z.B. ["", "-", "_", "."])
 *   caseVariants   – Groß-/Kleinschreibungs-Varianten testen
 *   leet           – Leetspeak-Variante testen
 *   permuteOrder   – Reihenfolge der Fragmente permutieren (nur bei ≤4)
 *   typos          – Tippfehler-Modelle (jeweils Tiefe 1)
 */

const LEET: Record<string, string> = { a: "@", e: "3", o: "0", i: "1", s: "$", t: "7" };
const INSERT_CHARSET = ["1", "2", "0", "!", ".", "_", "9"];

export interface TypoOptions {
  capslock?: boolean; // komplette Caps-Lock-Verwechslung
  swap?: boolean; // benachbarte Zeichen vertauscht
  insert?: boolean; // ein Zeichen zu viel
  delete?: boolean; // ein Zeichen vergessen
  replace?: boolean; // ein Zeichen falsch
}

export interface HintOptions {
  parts: string[];
  optionalParts?: string[];
  separators?: string[];
  caseVariants?: boolean;
  leet?: boolean;
  permuteOrder?: boolean;
  typos?: TypoOptions;
  maxSize?: number;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function subsets<T>(arr: T[]): T[][] {
  const out: T[][] = [[]];
  for (const item of arr) {
    const len = out.length;
    for (let i = 0; i < len; i++) out.push([...out[i], item]);
  }
  return out;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
function leetify(s: string): string {
  return s.split("").map((c) => LEET[c.toLowerCase()] ?? c).join("");
}
function togglecase(s: string): string {
  return s.split("").map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join("");
}

/** Tippfehler-Varianten (Tiefe 1) eines Strings. */
export function typoVariants(s: string, t: TypoOptions): string[] {
  const out = new Set<string>();
  if (t.capslock) out.add(togglecase(s));
  if (t.swap) {
    for (let i = 0; i < s.length - 1; i++) {
      out.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
    }
  }
  if (t.delete) {
    for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1));
  }
  if (t.insert) {
    for (let i = 0; i <= s.length; i++) {
      for (const c of INSERT_CHARSET) out.add(s.slice(0, i) + c + s.slice(i));
    }
  }
  if (t.replace) {
    for (let i = 0; i < s.length; i++) {
      for (const c of INSERT_CHARSET) out.add(s.slice(0, i) + c + s.slice(i + 1));
    }
  }
  return [...out];
}

export interface HintResult {
  words: string[];
  count: number;
  capped: boolean;
}

export function generateHintCandidates(opts: HintOptions): HintResult {
  const maxSize = opts.maxSize && opts.maxSize > 0 ? opts.maxSize : 200_000;
  const parts = (opts.parts || []).map((p) => p.trim()).filter(Boolean);
  const optional = (opts.optionalParts || []).map((p) => p.trim()).filter(Boolean);
  const separators = opts.separators && opts.separators.length ? opts.separators : [""];
  const result = new Set<string>();
  let capped = false;

  const add = (s: string): boolean => {
    if (s.length === 0) return true;
    result.add(s);
    if (result.size >= maxSize) {
      capped = true;
      return false;
    }
    return true;
  };

  // optionale Teile als Ein/Aus-Subsets (auf 6 begrenzt → max 64 Kombis)
  const optSubsets = subsets(optional.slice(0, 6));

  outer: for (const chosen of optSubsets) {
    const fragments = [...parts, ...chosen];
    if (fragments.length === 0) continue;
    const orderings =
      opts.permuteOrder && fragments.length <= 4 ? permutations(fragments) : [fragments];

    for (const order of orderings) {
      for (const sep of separators) {
        const base = order.join(sep);

        // Groß-/Kleinschreibung + Leet als Formen
        const forms = new Set<string>([base]);
        if (opts.caseVariants) {
          forms.add(base.toLowerCase());
          forms.add(capitalize(base.toLowerCase()));
          forms.add(base.toUpperCase());
        }
        if (opts.leet) forms.add(leetify(base.toLowerCase()));

        for (const f of forms) {
          if (!add(f)) break outer;
          if (opts.typos) {
            for (const v of typoVariants(f, opts.typos)) {
              if (!add(v)) break outer;
            }
          }
        }
      }
    }
  }

  return { words: [...result], count: result.size, capped };
}
