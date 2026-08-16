/**
 * Erweiterte Wallet-Formate → Hashcat-Hash
 * ========================================
 * Erkennt weitere verbreitete Wallet-/Vault-Formate und erzeugt den
 * passenden Hashcat-Hash-String (sofern in reinem TS möglich).
 *
 * Unterstützt:
 *   - Ethereum Keystore v3 (scrypt → -m 15700, pbkdf2 → -m 15600)
 *   - MetaMask Vault (-m 26600)
 *   - Electrum (Erkennung + Modus-Hinweis)
 *
 * Hash-Formate folgen den etablierten *2john/hashcat-Konventionen.
 */

export interface FormatResult {
  format: string;
  detected: boolean;
  hashcatMode?: number;
  hash?: string;
  note?: string;
  error?: string;
}

function stripHex(s: string): string {
  return s.startsWith("0x") ? s.slice(2) : s;
}

/** Ethereum Keystore v3 → $ethereum$… */
export function extractEthKeystore(json: Record<string, unknown>): FormatResult {
  const crypto = (json.crypto || json.Crypto) as Record<string, unknown> | undefined;
  if (!crypto) return { format: "Ethereum Keystore", detected: false, error: "Kein crypto-Feld" };
  const kdf = String(crypto.kdf || "").toLowerCase();
  const kdfparams = (crypto.kdfparams || {}) as Record<string, unknown>;
  const ciphertext = stripHex(String(crypto.ciphertext || ""));
  const mac = stripHex(String(crypto.mac || ""));
  const salt = stripHex(String(kdfparams.salt || ""));
  if (!ciphertext || !mac || !salt) {
    return { format: "Ethereum Keystore", detected: true, error: "Unvollständige crypto-Parameter" };
  }

  if (kdf === "scrypt") {
    const n = Number(kdfparams.n);
    const r = Number(kdfparams.r);
    const p = Number(kdfparams.p);
    return {
      format: "Ethereum Keystore (scrypt)",
      detected: true,
      hashcatMode: 15700,
      hash: `$ethereum$s*${n}*${r}*${p}*${salt}*${ciphertext}*${mac}`,
    };
  }
  if (kdf === "pbkdf2") {
    const c = Number(kdfparams.c);
    return {
      format: "Ethereum Keystore (PBKDF2)",
      detected: true,
      hashcatMode: 15600,
      hash: `$ethereum$p*${c}*${salt}*${ciphertext}*${mac}`,
    };
  }
  return { format: "Ethereum Keystore", detected: true, error: `Unbekannte KDF: ${kdf}` };
}

/** MetaMask Vault {data,iv,salt} (Base64) → $metamask$… (-m 26600) */
export function extractMetaMask(vault: Record<string, unknown>): FormatResult {
  const data = String(vault.data || "");
  const iv = String(vault.iv || "");
  const salt = String(vault.salt || "");
  if (!data || !iv || !salt) {
    return { format: "MetaMask Vault", detected: false, error: "data/iv/salt fehlen" };
  }
  return {
    format: "MetaMask Vault",
    detected: true,
    hashcatMode: 26600,
    hash: `$metamask$${salt}$${iv}$${data}`,
  };
}

/**
 * Erkennt das Format eines Wallet-/Vault-Inhalts (Text) und extrahiert –
 * wenn möglich – den Hashcat-Hash.
 */
export function analyzeWalletFormat(content: string): FormatResult {
  const trimmed = content.trim();

  // Electrum 2.x verschlüsselt: Base64, beginnt nach Dekodierung mit "BIE1"
  if (/^BIE1/.test(trimmed) || /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 64)) && trimmed.startsWith("Qkll")) {
    return {
      format: "Electrum (verschlüsselt)",
      detected: true,
      hashcatMode: 21700,
      note: "Electrum erkannt — Hash-Extraktion erfordert electrum2john (Modus 16600/21700/21800 je nach Version).",
    };
  }

  // JSON-basierte Formate
  try {
    const obj = JSON.parse(trimmed);
    if (obj && (obj.crypto || obj.Crypto) && (obj.version === 3 || obj.Version === 3 || obj.address)) {
      return extractEthKeystore(obj);
    }
    if (obj && obj.data && obj.iv && obj.salt) {
      return extractMetaMask(obj);
    }
    // MetaMask wird teils als String im "vault" gespeichert
    if (obj && typeof obj.vault === "string") {
      try {
        return extractMetaMask(JSON.parse(obj.vault));
      } catch {
        /* ignore */
      }
    }
    if (obj && (obj.seed_version || obj.wallet_type)) {
      return { format: "Electrum (Wallet-Datei)", detected: true, hashcatMode: 16600, note: "Electrum-Wallet erkannt — Extraktion via electrum2john empfohlen." };
    }
  } catch {
    /* kein JSON */
  }

  return { format: "Unbekannt", detected: false, note: "Format nicht erkannt." };
}
