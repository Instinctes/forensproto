/**
 * Rules-Store
 * ===========
 * Verwaltet Hashcat-Regeldateien im `rules/`-Verzeichnis (analog zu
 * `wordlists/`). Damit gelangen KI-generierte Regeln tatsächlich in die
 * Engine (`-r <datei>`), statt nur in der UI angezeigt zu werden.
 */

import { readdir, stat, writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { getRulesDir } from "./data-dir";

export const RULES_DIR = getRulesDir();

export interface RuleFileInfo {
  name: string;
  sizeBytes: number;
  ruleCount: number;
}

/** Sicherer, traversierungs-freier Pfad innerhalb von rules/. */
export function resolveRuleFile(name: string): string | null {
  const safe = basename(name); // entfernt jegliche Pfadanteile
  if (!safe || safe !== name) return null;
  if (!/^[\w.\-]+$/.test(safe)) return null;
  const full = join(RULES_DIR, safe);
  if (!full.startsWith(RULES_DIR)) return null;
  return full;
}

/**
 * Validiert eine einzelne Hashcat-Regelzeile (grobe, sichere Whitelist).
 * Erlaubt die gängigen Regel-Funktionen; verwirft offensichtlichen Müll.
 */
export function isValidRuleLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (t.startsWith("#")) return false; // Kommentar -> nicht als Regel zählen
  // Hashcat-Regel-Funktionen (Auszug der gebräuchlichen Tokens)
  // : l u c C t r d f { } [ ] q k K E ... sowie $X ^X TX sXY *XY iXY oXY @X etc.
  return /^[\s:lucCtTrdfemqkKEpPzZ$^<>_\-+!\/@sxOoiIDxX0-9a-zA-Z.,?*\[\]{}'"`~%&()=|;]+$/.test(t);
}

/** Filtert + säubert ein Regel-Array. */
export function sanitizeRules(rules: string[]): string[] {
  return rules.map((r) => r.trim()).filter((r) => isValidRuleLine(r));
}

export async function listRuleFiles(): Promise<RuleFileInfo[]> {
  if (!existsSync(RULES_DIR)) return [];
  const files = await readdir(RULES_DIR);
  const out: RuleFileInfo[] = [];
  for (const file of files) {
    if (!file.endsWith(".rule") && !file.endsWith(".rules") && !file.endsWith(".txt")) continue;
    const full = join(RULES_DIR, file);
    const s = await stat(full);
    const content = await readFile(full, "utf-8");
    const ruleCount = content.split("\n").filter((l) => isValidRuleLine(l)).length;
    out.push({ name: file, sizeBytes: s.size, ruleCount });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Speichert ein Regelset als Datei im rules/-Verzeichnis. */
export async function saveRuleFile(
  name: string,
  rules: string[]
): Promise<{ ok: boolean; error?: string; name?: string; ruleCount?: number }> {
  let fileName = basename(name).trim();
  if (!fileName) return { ok: false, error: "Ungültiger Dateiname" };
  if (!/\.(rule|rules|txt)$/.test(fileName)) fileName += ".rule";

  const full = resolveRuleFile(fileName);
  if (!full) return { ok: false, error: "Ungültiger Dateiname (nur [A-Za-z0-9._-])" };

  const clean = sanitizeRules(rules);
  if (clean.length === 0) return { ok: false, error: "Keine gültigen Regeln zum Speichern" };

  if (!existsSync(RULES_DIR)) await mkdir(RULES_DIR, { recursive: true });
  await writeFile(full, clean.join("\n") + "\n", "utf-8");
  return { ok: true, name: fileName, ruleCount: clean.length };
}
