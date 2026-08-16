/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * wallet-analyzer.ts
 *
 * Analyzes uploaded wallet files at the binary level.
 * Detects wallet type, encryption, and extracts metadata.
 *
 * Supported formats:
 * - Bitcoin Core wallet.dat (Berkeley DB / SQLite)
 * - Ethereum Keystore V3 (JSON with Scrypt/PBKDF2)
 * - Electrum Wallet (JSON with AES-256-CBC)
 *
 * All processing happens locally – no data leaves the machine.
 */

export interface WalletAnalysis {
  id: string;
  filename: string;
  fileSize: number;
  walletType: WalletType;
  format: string;
  encrypted: boolean;
  encryption: string | null;
  kdf: string | null;
  kdfParams: Record<string, number | string> | null;
  hashcatMode: number | null;
  hash: string | null;
  addresses: number | null;
  strength: number; // 0-100, recovery difficulty
  created: string;
  filePath: string; // temp path
  error: string | null;
}

export type WalletType =
  | "bitcoin_core"
  | "ethereum_keystore"
  | "electrum"
  | "litecoin"
  | "multibit"
  | "unknown";

interface EthereumKeystore {
  version: number;
  crypto: {
    cipher: string;
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: string;
    kdfparams: {
      n?: number;
      r?: number;
      p?: number;
      dklen: number;
      salt: string;
      c?: number;
      prf?: string;
    };
    mac: string;
  };
}

interface ElectrumWallet {
  wallet_type?: string;
  keystore?: {
    type?: string;
    pw_hash_version?: number;
    xpub?: string;
  };
}

/**
 * Detect wallet type from file content using magic bytes and structure analysis.
 */
export function detectWalletType(
  buffer: Buffer,
  filename: string
): { type: WalletType; format: string } {
  const filenameLC = filename.toLowerCase();

  // 1. Try JSON (Ethereum Keystore or Electrum)
  try {
    const text = buffer.toString("utf-8").trim();
    if (text.startsWith("{")) {
      const parsed = JSON.parse(text);

      // Ethereum Keystore V3
      if (parsed.crypto && parsed.version === 3) {
        const kdf = parsed.crypto.kdf || "unknown";
        return {
          type: "ethereum_keystore",
          format: `JSON (Ethereum Keystore V3, ${kdf})`,
        };
      }

      // Electrum wallet
      if (parsed.wallet_type || parsed.keystore || parsed.seed_version) {
        return {
          type: "electrum",
          format: "JSON (Electrum Wallet)",
        };
      }
    }
  } catch {
    // Not JSON, continue with binary checks
  }

  // 2. Check for SQLite magic bytes
  if (buffer.slice(0, 6).toString("ascii") === "SQLite") {
    return {
      type: "bitcoin_core",
      format: "SQLite (Bitcoin Core ≥0.21)",
    };
  }

  // 3. Check for Berkeley DB magic (0x00053162 at offset 12 or 0)
  const magic12 = buffer.readUInt32BE(12);
  const magic0 = buffer.readUInt32BE(0);
  if (magic12 === 0x00053162 || magic0 === 0x00053162 || magic12 === 0x62310500 || magic0 === 0x62310500) {
    // Determine BDB version
    let version = "4.x";
    try {
      const pageSize = buffer.readUInt32LE(20);
      if (pageSize >= 512 && pageSize <= 65536) {
        version = "4.8";
      }
    } catch {
      // ignore
    }
    return {
      type: "bitcoin_core",
      format: `Berkeley DB ${version}`,
    };
  }

  // 4. Check if file contains mkey marker (BDB without standard header)
  if (buffer.includes(Buffer.from("\x04mkey"))) {
    return {
      type: "bitcoin_core",
      format: "Berkeley DB (non-standard header)",
    };
  }

  // 5. MultiBit HD detection
  if (filenameLC.includes("mbhd") || filenameLC.endsWith(".aes")) {
    return {
      type: "multibit",
      format: "MultiBit HD (AES)",
    };
  }

  // 6. Litecoin uses same BDB format
  if (filenameLC.includes("litecoin") || filenameLC.includes("ltc")) {
    return {
      type: "litecoin",
      format: "Berkeley DB (Litecoin)",
    };
  }

  return { type: "unknown", format: "Unknown" };
}

/**
 * Analyze an Ethereum Keystore V3 file.
 */
export function analyzeEthereumKeystore(content: string): Partial<WalletAnalysis> {
  try {
    const keystore: EthereumKeystore = JSON.parse(content);
    const crypto = keystore.crypto;
    const kdf = crypto.kdf;
    const kdfParams = crypto.kdfparams;

    let kdfDescription: string;
    let hashcatMode: number;
    let strength: number;

    if (kdf === "scrypt") {
      const n = kdfParams.n || 262144;
      const r = kdfParams.r || 8;
      const p = kdfParams.p || 1;
      kdfDescription = `Scrypt (N=${n}, r=${r}, p=${p})`;
      hashcatMode = n <= 262144 ? 15700 : 15700;
      strength = n >= 262144 ? 85 : 70;
    } else if (kdf === "pbkdf2") {
      const c = kdfParams.c || 262144;
      const prf = kdfParams.prf || "hmac-sha256";
      kdfDescription = `PBKDF2-${prf.toUpperCase()} × ${c}`;
      hashcatMode = 15600;
      strength = c >= 262144 ? 80 : 60;
    } else {
      kdfDescription = `Unknown (${kdf})`;
      hashcatMode = 0;
      strength = 50;
    }

    // Build hashcat hash string
    const salt = kdfParams.salt;
    const ciphertext = crypto.ciphertext;
    const mac = crypto.mac;
    const iv = crypto.cipherparams.iv;

    // Ethereum hashcat format
    let hash: string;
    if (kdf === "scrypt") {
      hash = `$ethereum$s*${kdfParams.n}*${kdfParams.r}*${kdfParams.p}*${salt}*${ciphertext}*${mac}`;
    } else {
      hash = `$ethereum$p*${kdfParams.c}*${salt}*${ciphertext}*${mac}`;
    }

    return {
      encrypted: true,
      encryption: crypto.cipher.toUpperCase(),
      kdf: kdfDescription,
      kdfParams: kdfParams as Record<string, number | string>,
      hashcatMode,
      hash,
      addresses: 1,
      strength,
    };
  } catch (e) {
    return { error: `Failed to parse Ethereum keystore: ${e}` };
  }
}

/**
 * Analyze an Electrum wallet file.
 */
export function analyzeElectrumWallet(content: string): Partial<WalletAnalysis> {
  try {
    // Electrum wallets can be either plain JSON or encrypted
    // Encrypted Electrum wallets start with raw bytes, not JSON
    const parsed: ElectrumWallet = JSON.parse(content);

    const isEncrypted = !!parsed.keystore?.type;

    return {
      encrypted: isEncrypted,
      encryption: isEncrypted ? "AES-256-CBC" : null,
      kdf: isEncrypted ? "PBKDF2-SHA512 × 1024" : null,
      hashcatMode: isEncrypted ? 16600 : null,
      hash: null, // Electrum hash extraction requires different approach
      addresses: null,
      strength: isEncrypted ? 55 : 0,
    };
  } catch {
    // If JSON parsing fails, it's likely an encrypted Electrum wallet
    // (encrypted Electrum wallets are binary AES-CBC)
    return {
      encrypted: true,
      encryption: "AES-256-CBC",
      kdf: "PBKDF2-SHA512 × 1024",
      hashcatMode: 21700, // Electrum seed hashcat mode
      hash: null,
      addresses: null,
      strength: 55,
    };
  }
}

/**
 * Compute recovery difficulty strength (0-100).
 * Higher = harder to recover.
 */
export function computeStrength(params: {
  kdf: string | null;
  iterations?: number;
  scryptN?: number;
}): number {
  if (!params.kdf) return 0;

  const kdf = params.kdf.toLowerCase();

  if (kdf.includes("scrypt")) {
    const n = params.scryptN || 262144;
    if (n >= 1048576) return 95;
    if (n >= 262144) return 85;
    if (n >= 131072) return 75;
    return 60;
  }

  if (kdf.includes("sha-512") || kdf.includes("sha512")) {
    const iter = params.iterations || 25000;
    if (iter >= 100000) return 80;
    if (iter >= 50000) return 70;
    if (iter >= 25000) return 65;
    return 50;
  }

  if (kdf.includes("pbkdf2")) {
    const iter = params.iterations || 1024;
    if (iter >= 262144) return 80;
    if (iter >= 10000) return 65;
    return 45;
  }

  return 50;
}

/**
 * Get hashcat mode mapping for wallet types.
 */
export function getHashcatMode(walletType: WalletType): number | null {
  const modeMap: Record<WalletType, number | null> = {
    bitcoin_core: 11300,
    ethereum_keystore: 15700,
    electrum: 16600,
    litecoin: 11300,
    multibit: 22500,
    unknown: null,
  };
  return modeMap[walletType];
}
