/**
 * Kryptographische Berichtssignatur (Ed25519)
 * ===========================================
 * Signiert Forensik-Berichte digital, sodass ihre Authentizität und
 * Unverändertheit nachträglich (auch durch Dritte) überprüfbar sind.
 *
 * Das Schlüsselpaar wird einmalig erzeugt und lokal unter
 * `.forensproto/signing-key.json` persistiert (Ed25519, PEM).
 */

import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createHash,
  createPublicKey,
} from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getForensprotoStateDir } from "./data-dir";

const DATA_DIR = getForensprotoStateDir();
const KEY_FILE = join(DATA_DIR, "signing-key.json");

interface KeyMaterial {
  publicKey: string; // PEM (SPKI)
  privateKey: string; // PEM (PKCS8)
  createdAt: number;
}

const globalForKeys = global as unknown as { __forensSigningKey?: KeyMaterial };

export function getOrCreateKeys(): KeyMaterial {
  if (globalForKeys.__forensSigningKey) return globalForKeys.__forensSigningKey;

  if (existsSync(KEY_FILE)) {
    const km = JSON.parse(readFileSync(KEY_FILE, "utf-8")) as KeyMaterial;
    globalForKeys.__forensSigningKey = km;
    return km;
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const km: KeyMaterial = {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    createdAt: Date.now(),
  };
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify(km, null, 2), { mode: 0o600 });
  globalForKeys.__forensSigningKey = km;
  return km;
}

/** Kurzer, menschenlesbarer Fingerprint des öffentlichen Schlüssels. */
export function publicKeyFingerprint(publicKeyPem?: string): string {
  const pem = publicKeyPem || getOrCreateKeys().publicKey;
  const der = createPublicKey(pem).export({ type: "spki", format: "der" });
  const hash = createHash("sha256").update(der).digest("hex");
  return hash.match(/.{1,4}/g)!.slice(0, 8).join(":").toUpperCase();
}

export interface Signature {
  algorithm: "Ed25519";
  publicKeyPem: string;
  publicKeyFingerprint: string;
  contentSha256: string;
  signatureB64: string;
  signedAt: string;
}

/** Signiert beliebige Daten (Buffer/String). */
export function signData(data: Buffer | string): Signature {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
  const km = getOrCreateKeys();
  const signature = cryptoSign(null, buf, km.privateKey);
  return {
    algorithm: "Ed25519",
    publicKeyPem: km.publicKey,
    publicKeyFingerprint: publicKeyFingerprint(km.publicKey),
    contentSha256: createHash("sha256").update(buf).digest("hex"),
    signatureB64: signature.toString("base64"),
    signedAt: new Date().toISOString(),
  };
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  contentSha256Match?: boolean;
  signatureValid?: boolean;
}

/** Verifiziert Daten gegen eine Signatur (Public Key aus der Signatur). */
export function verifyData(data: Buffer | string, sig: Signature): VerifyResult {
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
    const actualHash = createHash("sha256").update(buf).digest("hex");
    const contentSha256Match = actualHash === sig.contentSha256;
    const signatureValid = cryptoVerify(
      null,
      buf,
      sig.publicKeyPem,
      Buffer.from(sig.signatureB64, "base64")
    );
    return {
      valid: contentSha256Match && signatureValid,
      contentSha256Match,
      signatureValid,
      reason: !signatureValid
        ? "Signatur ungültig"
        : !contentSha256Match
          ? "Inhalts-Hash weicht ab"
          : undefined,
    };
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : "Verifikationsfehler" };
  }
}
