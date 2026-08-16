/**
 * Bitcoin-Core Wallet-Dump (Entschlüsselung nach gefundenem Passwort)
 * ===================================================================
 * Entschlüsselt eine verschlüsselte wallet.dat mit dem wiederhergestellten
 * Passwort und exportiert alle Adressen + Private Keys (WIF).
 *
 * Verfahren (Bitcoin Core):
 *  1. Master-Key-Ableitung: iteriertes SHA-512 über (Passphrase || Salt)
 *     → 32-Byte-AES-Key + 16-Byte-IV.
 *  2. AES-256-CBC-Entschlüsselung des verschlüsselten Master Keys → vMasterKey.
 *  3. Pro ckey: AES-256-CBC mit Key = vMasterKey, IV = doubleSHA256(pubkey)[:16]
 *     → 32-Byte Private Key.
 *
 * SICHERHEIT GEGEN FALSCHAUSGABE: Ein Private Key wird nur ausgegeben, wenn
 * der daraus abgeleitete Public Key exakt dem in der Wallet gespeicherten
 * entspricht (Selbstverifikation). Schlägt das fehl, wird der Key verworfen.
 */

import { createHash, createDecipheriv } from "crypto";
import { WalletParser } from "./forensics/wallet-parser";
import { publicKeyFromPrivate, encodePublicKey, publicKeyToP2PKH, encodeWIF, SECP256K1 } from "./crypto-forensics/ec-engine";

function sha256d(b: Buffer): Buffer {
  return createHash("sha256").update(createHash("sha256").update(b).digest()).digest();
}

/** Bitcoin-Core-KDF: `iterations`× SHA-512 über (Passphrase||Salt). */
export function bitcoinCoreKDF(password: string, salt: Buffer, iterations: number): { key: Buffer; iv: Buffer } {
  let buf = createHash("sha512").update(Buffer.concat([Buffer.from(password, "utf8"), salt])).digest();
  for (let i = 1; i < iterations; i++) buf = createHash("sha512").update(buf).digest();
  return { key: buf.subarray(0, 32), iv: buf.subarray(32, 48) };
}

function aesCbcDecrypt(ciphertext: Buffer, key: Buffer, iv: Buffer): Buffer {
  const d = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([d.update(ciphertext), d.final()]);
}

export interface MasterKeyRecord {
  cryptedKey: Buffer; // 48 Byte
  salt: Buffer; // 8 Byte
  method: number;
  iterations: number;
}

/**
 * Findet die CMasterKey-Struktur in der wallet.dat über ihre Signatur:
 * 0x30 <48 cryptedKey> 0x08 <8 salt> <u32 method> <u32 iterations> 0x00
 */
export function parseMasterKey(buffer: Buffer): MasterKeyRecord | null {
  for (let p = 0; p + 67 <= buffer.length; p++) {
    if (buffer[p] !== 0x30 || buffer[p + 49] !== 0x08 || buffer[p + 66] !== 0x00) continue;
    const iterations = buffer.readUInt32LE(p + 62);
    if (iterations < 1000 || iterations > 200_000_000) continue; // Plausibilität
    return {
      cryptedKey: buffer.subarray(p + 1, p + 49),
      salt: buffer.subarray(p + 50, p + 58),
      method: buffer.readUInt32LE(p + 58),
      iterations,
    };
  }
  return null;
}

export interface DumpedKey {
  address: string;
  publicKey: string;
  privateKeyHex: string;
  wif: string;
  verified: boolean;
}

export interface DumpResult {
  ok: boolean;
  error?: string;
  masterKeyDecrypted: boolean;
  keys: DumpedKey[];
  totalCkeys: number;
  verifiedCount: number;
}

/** Entschlüsselt einen einzelnen ckey und verifiziert über den Pubkey. */
function decryptCkey(cryptedSecretHex: string, storedPubHex: string, vMasterKey: Buffer): DumpedKey | null {
  try {
    const pubBytes = Buffer.from(storedPubHex, "hex");
    const iv = sha256d(pubBytes).subarray(0, 16);
    const ciphertext = Buffer.from(cryptedSecretHex, "hex");
    if (ciphertext.length < 32) return null;
    const priv = aesCbcDecrypt(ciphertext, vMasterKey, iv);
    if (priv.length !== 32) return null;

    const d = BigInt("0x" + priv.toString("hex"));
    if (d <= 0n || d >= SECP256K1.n) return null;

    const compressed = storedPubHex.length === 66;
    const derivedPub = encodePublicKey(publicKeyFromPrivate(d), compressed);
    const verified = derivedPub.toLowerCase() === storedPubHex.toLowerCase();
    if (!verified) return null; // niemals unverifizierte Keys ausgeben

    const privHex = priv.toString("hex");
    return {
      address: publicKeyToP2PKH(derivedPub),
      publicKey: storedPubHex,
      privateKeyHex: privHex,
      wif: encodeWIF(privHex, compressed),
      verified: true,
    };
  } catch {
    return null;
  }
}

/**
 * Vollständiger Dump einer verschlüsselten wallet.dat mit dem Passwort.
 */
export function dumpEncryptedWallet(walletBuffer: Buffer, password: string): DumpResult {
  const mkey = parseMasterKey(walletBuffer);
  if (!mkey) {
    return { ok: false, error: "Kein Master-Key (mkey) in der Wallet gefunden", masterKeyDecrypted: false, keys: [], totalCkeys: 0, verifiedCount: 0 };
  }

  let vMasterKey: Buffer;
  try {
    const { key, iv } = bitcoinCoreKDF(password, mkey.salt, mkey.iterations);
    vMasterKey = aesCbcDecrypt(mkey.cryptedKey, key, iv);
    if (vMasterKey.length !== 32) throw new Error("Master-Key-Länge != 32");
  } catch {
    return { ok: false, error: "Master-Key-Entschlüsselung fehlgeschlagen (falsches Passwort/Format?)", masterKeyDecrypted: false, keys: [], totalCkeys: 0, verifiedCount: 0 };
  }

  // ckeys aus dem Wallet-Parser (encrypted + publicKey)
  const parsedSync = parseCkeysSync(walletBuffer);
  const keys: DumpedKey[] = [];
  for (const ck of parsedSync) {
    const dk = decryptCkey(ck.encrypted, ck.publicKey, vMasterKey);
    if (dk) keys.push(dk);
  }

  return {
    ok: keys.length > 0,
    error: keys.length === 0 ? "Master-Key entschlüsselt, aber keine Private Keys verifizierbar (Wallet-Format)" : undefined,
    masterKeyDecrypted: true,
    keys,
    totalCkeys: parsedSync.length,
    verifiedCount: keys.length,
  };
}

/** Synchrone ckey-Extraktion (encrypted + pubkey) analog zum WalletParser. */
function parseCkeysSync(buffer: Buffer): Array<{ encrypted: string; publicKey: string }> {
  const CKEY_MARKER = Buffer.from([0x04, 0x63, 0x6b, 0x65, 0x79]); // \x04ckey
  const out: Array<{ encrypted: string; publicKey: string }> = [];
  let pos = 0;
  while ((pos = buffer.indexOf(CKEY_MARKER, pos)) !== -1) {
    const dataStart = pos + CKEY_MARKER.length;
    const encrypted = buffer.subarray(dataStart, dataStart + 48).toString("hex");
    const pubKeyLen = buffer[pos + 57];
    if (pubKeyLen === 33 || pubKeyLen === 65) {
      const pub = buffer.subarray(pos + 58, pos + 58 + pubKeyLen).toString("hex");
      if (pub.length === pubKeyLen * 2) out.push({ encrypted, publicKey: pub });
    }
    pos += 1;
  }
  return out;
}

/** Erzeugt den TXT-Inhalt des Wallet-Dumps. */
export function renderDumpTxt(meta: { walletName: string; password: string; jobId: string }, result: DumpResult): string {
  const lines: string[] = [];
  lines.push("====================================================");
  lines.push(" ForensProto — Wallet-Dump (FORENSISCH / VERTRAULICH)");
  lines.push("====================================================");
  lines.push(`Wallet:        ${meta.walletName}`);
  lines.push(`Job-ID:        ${meta.jobId}`);
  lines.push(`Erstellt:      ${new Date().toISOString()}`);
  lines.push(`Passwort:      ${meta.password}`);
  lines.push(`Master-Key:    ${result.masterKeyDecrypted ? "entschlüsselt" : "NICHT entschlüsselt"}`);
  lines.push(`Keys:          ${result.verifiedCount} von ${result.totalCkeys} verifiziert entschlüsselt`);
  lines.push("");
  if (result.error) lines.push(`Hinweis: ${result.error}`);
  lines.push("");
  result.keys.forEach((k, i) => {
    lines.push(`--- Key #${i + 1} ---`);
    lines.push(`Adresse:      ${k.address}`);
    lines.push(`Public Key:   ${k.publicKey}`);
    lines.push(`Private Key:  ${k.privateKeyHex}`);
    lines.push(`WIF:          ${k.wif}`);
    lines.push("");
  });
  lines.push("⚠ Enthält private Schlüssel — streng vertraulich behandeln und sicher löschen.");
  return lines.join("\n");
}
