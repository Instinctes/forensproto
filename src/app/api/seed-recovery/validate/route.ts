/**
 * Seed Recovery API — Echte BIP39-Validierung
 * POST: Mnemonic-Phrase validieren und analysieren
 */

import { NextRequest } from "next/server";
import * as bip39 from "bip39";
import { createHash } from "crypto";

interface ValidationResult {
  valid: boolean;
  detectedFormat: string;
  wordCount: number;
  checksum: string;
  checksumValid: boolean;
  derivationPaths: string[];
  invalidWords: Array<{ index: number; word: string; suggestions: string[] }>;
  entropy?: string;
  language: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mnemonic } = body as { mnemonic?: string };

    if (!mnemonic || mnemonic.trim().length === 0) {
      return Response.json(
        { success: false, error: "Bitte geben Sie eine Mnemonic-Phrase ein." },
        { status: 400 }
      );
    }

    const words = mnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Sprache erkennen
    const wordlist = bip39.wordlists.english;
    const language = "english";

    // Ungültige Wörter erkennen + Vorschläge
    const invalidWords: ValidationResult["invalidWords"] = [];
    for (let i = 0; i < words.length; i++) {
      if (words[i] === "?" || words[i] === "_") continue; // Platzhalter erlaubt
      if (!wordlist.includes(words[i])) {
        // Levenshtein-basierte Vorschläge
        const suggestions = findSimilarWords(words[i], wordlist, 3);
        invalidWords.push({ index: i, word: words[i], suggestions });
      }
    }

    // BIP39 Format-Erkennung
    let detectedFormat = "Unbekannt";
    if ([12, 15, 18, 21, 24].includes(wordCount)) {
      detectedFormat = `BIP39 (${wordCount} Wörter)`;
    } else {
      detectedFormat = `Nicht-Standard (${wordCount} Wörter)`;
    }

    // Checksum-Validierung (nur wenn alle Wörter gültig und richtige Anzahl)
    const hasPlaceholders = words.some((w) => w === "?" || w === "_");
    let checksumValid = false;
    let checksum = "—";
    let entropy: string | undefined;

    if (invalidWords.length === 0 && !hasPlaceholders && [12, 15, 18, 21, 24].includes(wordCount)) {
      const cleaned = words.join(" ");
      checksumValid = bip39.validateMnemonic(cleaned);

      if (checksumValid) {
        try {
          const entropyHex = bip39.mnemonicToEntropy(cleaned);
          entropy = entropyHex;
          // Checksum = ersten 4 Zeichen des SHA256 der Entropy
          const hash = createHash("sha256")
            .update(Buffer.from(entropyHex, "hex"))
            .digest("hex");
          checksum = hash.slice(0, 8).toUpperCase();
        } catch {
          checksum = "UNGÜLTIG";
        }
      } else {
        checksum = "UNGÜLTIG";
      }
    }

    // Mögliche Derivation-Pfade
    const derivationPaths: string[] = [];
    if (checksumValid || (invalidWords.length === 0 && !hasPlaceholders)) {
      derivationPaths.push("m/44'/0'/0'/0 (BIP44 — Legacy P2PKH)");
      derivationPaths.push("m/49'/0'/0'/0 (BIP49 — P2SH-P2WPKH)");
      derivationPaths.push("m/84'/0'/0'/0 (BIP84 — Native SegWit)");
      derivationPaths.push("m/86'/0'/0'/0 (BIP86 — Taproot)");
      if (wordCount >= 12) {
        derivationPaths.push("m/44'/60'/0'/0 (Ethereum)");
      }
    }

    const result: ValidationResult = {
      valid: checksumValid,
      detectedFormat,
      wordCount,
      checksum,
      checksumValid,
      derivationPaths,
      invalidWords,
      entropy: checksumValid ? entropy : undefined,
      language,
    };

    return Response.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Analyse fehlgeschlagen",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Wort-Ähnlichkeit (Levenshtein)
// ============================================================================

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
    }
  }

  return dp[m][n];
}

function findSimilarWords(word: string, wordlist: string[], maxResults: number): string[] {
  return wordlist
    .map((w) => ({ word: w, dist: levenshtein(word, w) }))
    .filter((r) => r.dist <= 2) // Max 2 Edits
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxResults)
    .map((r) => r.word);
}
