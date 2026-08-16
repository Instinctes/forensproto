/**
 * Zentrales Datenverzeichnis für alle Laufzeit-/Nutzdaten
 * ========================================================
 * Betrifft: Datenbank & Audit-Log (.forensproto/), Evidence-Blobs, Dumps,
 * Sanktionslisten-Cache, Auth-Secret, Wortlisten (wordlists/), eigene
 * Hashcat-Regeln (rules/) und temporäre Upload-Verarbeitung (uploads/).
 *
 * Standardverhalten (unverändert): alles liegt relativ zum Projekt-/
 * App-Ordner (process.cwd() — bei der nativen Mac-App ist das der
 * Ordner, aus dem `npm run start` gestartet wurde, siehe src-tauri/src/main.rs).
 *
 * Override: FORENSPROTO_DATA_DIR (z. B. in .env.local), um Nutzdaten aus
 * dem Source-/App-Ordner herauszulösen — sinnvoll z. B. für
 * `~/Library/Application Support/ForensProto`, damit ein `git pull`, ein
 * Neuklonen oder ein App-Update keine eigenen Daten berührt.
 *
 * Bewusst NICHT betroffen: scripts/*.py, package.json, .next-Build — das
 * ist Anwendungscode, kein Nutzdatum, und bleibt immer relativ zu
 * process.cwd() (dem Installationsort der App selbst).
 *
 * Hinweis: Node liest Umgebungsvariablen einmal beim Prozessstart. Eine
 * Änderung von FORENSPROTO_DATA_DIR in .env.local greift erst nach einem
 * Neustart der App/des Servers — es gibt bewusst kein Live-Umschalten
 * zur Laufzeit, um Dateizugriffe während eines laufenden Jobs nicht auf
 * halbem Weg auf einen anderen Ordner umzubiegen.
 */

import { join } from "path";

export function getDataDir(): string {
  return process.env.FORENSPROTO_DATA_DIR || process.cwd();
}

/** true, wenn FORENSPROTO_DATA_DIR gesetzt ist (Nutzdaten liegen NICHT im Projektordner). */
export function isDataDirOverridden(): boolean {
  return Boolean(process.env.FORENSPROTO_DATA_DIR);
}

export function getForensprotoStateDir(): string {
  return join(getDataDir(), ".forensproto");
}

export function getWordlistsDir(): string {
  return join(getDataDir(), "wordlists");
}

export function getRulesDir(): string {
  return join(getDataDir(), "rules");
}

export function getUploadsDir(): string {
  return join(getDataDir(), "uploads");
}

/**
 * Ordner für den Offline-Muster-Scan (Research). Hier legt der Nutzer die
 * Datei mit funded BTC-Adressen ab (btcadresseswithbalance.txt); Treffer
 * werden nach funded-set/hits/ geschrieben. Liegt im App-Datenordner
 * (Application Support), NICHT im Programm-Bundle.
 */
export function getFundedSetDir(): string {
  return join(getDataDir(), "funded-set");
}

/** Standard-Dateiname der funded-Adressliste im funded-set-Ordner. */
export const FUNDED_SET_FILENAME = "btcadresseswithbalance.txt";

export function getFundedSetFile(): string {
  return join(getFundedSetDir(), FUNDED_SET_FILENAME);
}

/** Ablageort der Scan-Treffer (JSONL + Sitzungs-Zusammenfassungen). */
export function getScanHitsDir(): string {
  return join(getFundedSetDir(), "hits");
}
