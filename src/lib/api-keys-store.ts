/**
 * Persistente API-Keys für On-Chain-Dienste (lokal im Datenordner).
 * Werden von Settings gespeichert und von Trace/Balance/Attribution gelesen.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { getForensprotoStateDir } from "./data-dir";

export interface OnchainApiKeys {
  mempool?: string;
  etherscan?: string;
  updatedAt?: string;
}

function keysPath(): string {
  return join(getForensprotoStateDir(), "onchain-api-keys.json");
}

export function loadOnchainApiKeys(): OnchainApiKeys {
  // Env hat Vorrang (Deployment/CI)
  const env: OnchainApiKeys = {
    mempool: process.env.FORENSPROTO_MEMPOOL_API_KEY || process.env.MEMPOOL_API_KEY || undefined,
    etherscan: process.env.FORENSPROTO_ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || undefined,
  };
  try {
    const p = keysPath();
    if (!existsSync(p)) return env;
    const file = JSON.parse(readFileSync(p, "utf8")) as OnchainApiKeys;
    return {
      mempool: env.mempool || file.mempool || undefined,
      etherscan: env.etherscan || file.etherscan || undefined,
      updatedAt: file.updatedAt,
    };
  } catch {
    return env;
  }
}

export function saveOnchainApiKeys(keys: OnchainApiKeys): OnchainApiKeys {
  const dir = getForensprotoStateDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const next: OnchainApiKeys = {
    mempool: keys.mempool?.trim() || undefined,
    etherscan: keys.etherscan?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(keysPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Maskiert Keys für UI-Anzeige (nie Klartext zurück an Clients außer beim Speichern optional). */
export function maskKey(key?: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}
