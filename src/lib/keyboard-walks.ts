/**
 * Tastatur-Layout-bewusste Kandidaten (QWERTZ / DACH)
 * ===================================================
 * Generiert „Keyboard-Walks" für das deutsche QWERTZ-Layout und liefert
 * einen Umlaut-/Sonderzeichen-Charset-Vorschlag für Hashcat-Masken.
 * Internationale Tools nutzen meist QWERTY — für DACH-Nutzer ein echter
 * Realitätsgewinn. Deterministisch & testbar.
 */

// QWERTZ-Reihen (inkl. deutscher Sonderzeichen)
const ROWS = ["1234567890ß", "qwertzuiopü", "asdfghjklöä", "yxcvbnm"];

// Bekannte Klassiker + Spalten-/Diagonal-Walks (QWERTZ)
const CLASSICS = [
  "qwertz", "asdfgh", "yxcvbn", "qwertzuiop", "asdfghjkl", "yxcvbnm",
  "1q2w3e", "1q2w3e4r", "1qaz2wsx", "1qaz2wsx3edc", "qazwsx", "qayxsw",
  "qwertz123", "asdf1234", "qwertzu", "ßüöä", "mnbvcxy",
];

export interface KeyboardWalkOptions {
  minLen?: number;
  maxLen?: number;
  reverse?: boolean;
  interleave?: boolean; // 1q2w3e-Muster
  maxSize?: number;
}

export function generateKeyboardWalks(opts: KeyboardWalkOptions = {}): string[] {
  const minLen = opts.minLen ?? 4;
  const maxLen = opts.maxLen ?? 8;
  const reverse = opts.reverse !== false;
  const interleave = opts.interleave !== false;
  const maxSize = opts.maxSize && opts.maxSize > 0 ? opts.maxSize : 2000;

  const out = new Set<string>();
  const add = (s: string) => {
    if (s.length >= minLen && out.size < maxSize) out.add(s);
  };

  // 1) horizontale Läufe je Reihe
  for (const row of ROWS) {
    for (let len = minLen; len <= Math.min(maxLen, row.length); len++) {
      for (let i = 0; i + len <= row.length; i++) {
        const seg = row.slice(i, i + len);
        add(seg);
        if (reverse) add(seg.split("").reverse().join(""));
      }
    }
  }

  // 2) Zahl-Buchstabe-Interleave (1q2w3e…)
  if (interleave) {
    const num = ROWS[0];
    const let1 = ROWS[1];
    let s = "";
    for (let i = 0; i < Math.min(num.length, let1.length); i++) {
      s += num[i] + let1[i];
      if (s.length >= minLen && s.length <= maxLen) add(s);
    }
  }

  // 3) Klassiker
  for (const c of CLASSICS) if (c.length >= minLen) add(c);

  return [...out];
}

export interface GermanCharset {
  customCharset: string; // Hashcat -1 Charset
  exampleMask: string; // Beispielmaske
  note: string;
}

/** Vorschlag für einen deutschen Hashcat-Custom-Charset inkl. Umlaute. */
export function germanCharset(): GermanCharset {
  return {
    customCharset: "?l?uäöüßÄÖÜ",
    exampleMask: "-1 ?l?uäöüßÄÖÜ  ?1?1?1?1?1?d?d",
    note: "Mit Umlauten: 'hashcat -1 ?l?uäöüßÄÖÜ -a 3 hash ?1?1?1?1?1?d?d --encoding-to=utf-8' (oder iso-8859-1 je nach Quelle).",
  };
}
