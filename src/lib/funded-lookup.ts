/**
 * Offline-Balance-Lookup gegen die lokale funded-Adressliste
 * ==========================================================
 * Ersetzt die Live-Abfrage gegen mempool.space (Rate-Limit) für den
 * Visual-Key-Check: Die (wenigen) abgeleiteten Adressen werden gegen die
 * vom Nutzer bereitgestellte Datei `funded-set/btcadresseswithbalance.txt`
 * geprüft. Da nur eine Handvoll Adressen gesucht wird, genügt EIN
 * Streaming-Durchlauf der (u. U. mehrere GB großen) Datei; ist eine Adresse
 * gefunden, wird ihr Guthaben aus der Zeile übernommen.
 *
 * Erwartetes Zeilenformat (tolerant): `<adresse>[<trenner><guthaben>]`.
 * Trenner: Whitespace, Komma oder Semikolon. Ist das Guthaben eine reine
 * Ganzzahl, wird es als Satoshi interpretiert und zusätzlich in BTC
 * umgerechnet; andernfalls wird der Rohwert unverändert durchgereicht.
 */

import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { getFundedSetFile } from "./data-dir";

export interface FundedHit {
  found: boolean;
  /** Rohwert des Guthaben-Feldes aus der Datei (falls vorhanden). */
  balanceRaw?: string;
  /** In BTC umgerechnet, falls das Feld als Satoshi-Ganzzahl erkannt wurde. */
  balanceBtc?: string;
}

export interface FundedLookupResult {
  fileAvailable: boolean;
  filePath: string;
  linesScanned: number;
  hits: Record<string, FundedHit>;
}

/**
 * Sucht die übergebenen Adressen in der funded-Datei (ein Streaming-Durchlauf).
 * Bricht früh ab, sobald alle gesuchten Adressen gefunden wurden.
 */
export async function lookupFundedAddresses(addresses: string[]): Promise<FundedLookupResult> {
  const filePath = getFundedSetFile();
  const query = new Set(addresses.map((a) => a.trim()).filter(Boolean));
  const hits: Record<string, FundedHit> = {};
  for (const a of query) hits[a] = { found: false };

  if (!existsSync(filePath)) {
    return { fileAvailable: false, filePath, linesScanned: 0, hits };
  }
  if (query.size === 0) {
    return { fileAvailable: true, filePath, linesScanned: 0, hits };
  }

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let linesScanned = 0;
  let remaining = query.size;

  for await (const line of rl) {
    linesScanned++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\s,;]+/);
    const addr = parts[0];
    if (query.has(addr) && !hits[addr].found) {
      const balanceRaw = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
      let balanceBtc: string | undefined;
      if (balanceRaw && /^\d+$/.test(balanceRaw)) {
        // Ganzzahl → als Satoshi interpretieren
        balanceBtc = (Number(balanceRaw) / 1e8).toFixed(8);
      }
      hits[addr] = { found: true, balanceRaw, balanceBtc };
      remaining--;
      if (remaining === 0) {
        rl.close();
        break;
      }
    }
  }

  return { fileAvailable: true, filePath, linesScanned, hits };
}
