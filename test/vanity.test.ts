import { describe, it, expect } from "vitest";
import { validatePrefix, FIXED_PREFIX } from "@/lib/vanity";

/**
 * Vanity-Generator: Präfix-Validierung und Aufwandsschätzung.
 * (Die eigentliche Suche ist zufallsgetrieben und wird nicht im Test
 * ausgeführt — geprüft wird die Vorab-Logik, die Fehleingaben abfängt.)
 */
describe("Vanity-Präfix-Validierung", () => {
  it("akzeptiert ein gültiges Base58-Präfix und schätzt 58^n", () => {
    const v = validatePrefix("p2pkh", "1A");
    expect(v.ok).toBe(true);
    expect(v.custom).toBe("A");
    expect(v.expectedAttempts).toBe(58);
    expect(validatePrefix("p2pkh", "1Ab").expectedAttempts).toBe(58 * 58);
  });

  it("weist Base58-verbotene Zeichen ab (0, O, I, l)", () => {
    for (const ch of ["0", "O", "I", "l"]) {
      expect(validatePrefix("p2pkh", `1${ch}`).ok).toBe(false);
    }
  });

  it("erzwingt den technisch festen Anfang je Adresstyp", () => {
    expect(validatePrefix("p2pkh", "3x").ok).toBe(false);
    expect(validatePrefix("p2sh-p2wpkh", "3A").ok).toBe(true);
    expect(FIXED_PREFIX.p2wpkh).toBe("bc1q");
  });

  it("prüft den Bech32-Zeichensatz (z. B. 'b' ist ungültig)", () => {
    expect(validatePrefix("p2wpkh", "bc1qb").ok).toBe(false);
    expect(validatePrefix("p2wpkh", "bc1qz").ok).toBe(true);
    expect(validatePrefix("p2wpkh", "bc1qz").expectedAttempts).toBe(32);
  });

  it("verlangt mindestens ein Zeichen nach dem festen Anfang", () => {
    expect(validatePrefix("p2pkh", "1").ok).toBe(false);
  });

  it("senkt den Aufwand bei ignorierter Groß-/Kleinschreibung", () => {
    const strict = validatePrefix("p2pkh", "1Ab", true).expectedAttempts;
    const loose = validatePrefix("p2pkh", "1Ab", false).expectedAttempts;
    expect(loose).toBeLessThan(strict);
  });
});
