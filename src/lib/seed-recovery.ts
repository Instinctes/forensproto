/**
 * Seed-Recovery-Workflow (BIP39 + BIP32 HD-Ableitung)
 * ===================================================
 * Stellt aus einer Mnemonic mit fehlenden/unsicheren Wörtern die richtige
 * Phrase wieder her: Checksum-Filter reduziert den Raum drastisch, danach
 * werden Adressen über Standard-Derivationspfade abgeleitet und können
 * on-chain bestätigt werden.
 *
 * Die kritische BIP32-Ableitung ist gegen die offiziellen BIP32-
 * Testvektoren verifiziert (siehe Laufzeittest).
 */

import { createHmac } from "crypto";
import * as bip39 from "bip39";
import { SECP256K1, mod, publicKeyFromPrivate, encodePublicKey, publicKeyToP2PKH } from "./crypto-forensics/ec-engine";

export interface HDNode {
  key: bigint; // privater Schlüssel (Skalar)
  chainCode: Buffer;
}

function ser32(i: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(i >>> 0, 0);
  return b;
}
function ser256(k: bigint): Buffer {
  return Buffer.from(k.toString(16).padStart(64, "0"), "hex");
}
function compressedPub(key: bigint): Buffer {
  return Buffer.from(encodePublicKey(publicKeyFromPrivate(key), true), "hex");
}

/** BIP32-Masterschlüssel aus dem Seed. */
export function masterFromSeed(seed: Buffer): HDNode {
  const I = createHmac("sha512", Buffer.from("Bitcoin seed", "utf8")).update(seed).digest();
  const IL = I.subarray(0, 32);
  const IR = I.subarray(32);
  const key = BigInt("0x" + IL.toString("hex"));
  if (key === 0n || key >= SECP256K1.n) throw new Error("Ungültiger Master-Key");
  return { key, chainCode: IR };
}

/** BIP32 CKDpriv: Kindschlüssel aus Elternknoten und Index. */
export function ckdPriv(parent: HDNode, index: number): HDNode {
  const hardened = index >= 0x80000000;
  const data = hardened
    ? Buffer.concat([Buffer.from([0]), ser256(parent.key), ser32(index)])
    : Buffer.concat([compressedPub(parent.key), ser32(index)]);
  const I = createHmac("sha512", parent.chainCode).update(data).digest();
  const IL = BigInt("0x" + I.subarray(0, 32).toString("hex"));
  if (IL >= SECP256K1.n) throw new Error("Ungültiger Ableitungsindex (IL >= n)");
  const childKey = mod(IL + parent.key, SECP256K1.n);
  if (childKey === 0n) throw new Error("Ungültiger Kindschlüssel (0)");
  return { key: childKey, chainCode: I.subarray(32) };
}

/** Parst einen Pfad wie m/44'/0'/0'/0/0 in Indizes (hardened via ' oder h). */
export function parsePath(path: string): number[] {
  return path
    .replace(/^m\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const hardened = seg.endsWith("'") || seg.endsWith("h");
      const n = parseInt(seg.replace(/['h]$/, ""), 10);
      if (!Number.isFinite(n)) throw new Error(`Ungültiges Pfadsegment: ${seg}`);
      return hardened ? n + 0x80000000 : n;
    });
}

export interface DerivedKey {
  path: string;
  privateKeyHex: string;
  publicKeyHex: string;
  address: string; // P2PKH (legacy)
}

/** Leitet einen kompletten Pfad ab und liefert die Legacy-P2PKH-Adresse. */
export function derivePath(seed: Buffer, path: string): DerivedKey {
  let node = masterFromSeed(seed);
  for (const idx of parsePath(path)) node = ckdPriv(node, idx);
  const pubHex = encodePublicKey(publicKeyFromPrivate(node.key), true);
  return {
    path,
    privateKeyHex: ser256(node.key).toString("hex"),
    publicKeyHex: pubHex,
    address: publicKeyToP2PKH(pubHex),
  };
}

export function mnemonicToSeed(mnemonic: string, passphrase = ""): Buffer {
  return bip39.mnemonicToSeedSync(mnemonic, passphrase);
}

// Standard-Ableitungspfade (Legacy P2PKH — von unserer Engine unterstützt)
export const DEFAULT_PATHS = ["m/44'/0'/0'/0/0", "m/44'/0'/0'/0/1", "m/44'/0'/0'/0/2"];

export interface SeedCandidate {
  mnemonic: string;
  filledWords: string[]; // welche Wörter eingesetzt wurden (an den ?-Positionen)
  addresses: string[];
}

export interface RecoverResult {
  unknownPositions: number[];
  totalCombinations: number;
  checksumValid: number;
  candidates: SeedCandidate[];
  truncated: boolean;
}

const WORDLIST = bip39.wordlists.english;
const PLACEHOLDERS = new Set(["?", "*", "_", ""]);

/**
 * Brute-Force für 1–2 unbekannte Wörter (mit „?" markiert).
 * Checksum-Filter (validateMnemonic) reduziert den Raum massiv; für jede
 * gültige Phrase werden Adressen über die angegebenen Pfade abgeleitet.
 */
export function recoverMissingWords(
  words: string[],
  opts: { passphrase?: string; paths?: string[]; maxCandidates?: number; perWordCandidates?: string[][] } = {}
): RecoverResult {
  const paths = opts.paths && opts.paths.length ? opts.paths : [DEFAULT_PATHS[0]];
  const maxCandidates = opts.maxCandidates && opts.maxCandidates > 0 ? opts.maxCandidates : 500;
  const passphrase = opts.passphrase || "";

  const unknownPositions = words.map((w, i) => (PLACEHOLDERS.has(w.trim().toLowerCase()) ? i : -1)).filter((i) => i >= 0);
  if (unknownPositions.length === 0) throw new Error("Keine unbekannte Position (?) gefunden");
  if (unknownPositions.length > 2) throw new Error("Maximal 2 unbekannte Wörter unterstützt");

  // Kandidatenmengen je unbekannter Position
  const candSets = unknownPositions.map((_, k) => opts.perWordCandidates?.[k]?.length ? opts.perWordCandidates![k] : WORDLIST);
  const totalCombinations = candSets.reduce((a, s) => a * s.length, 1);

  const candidates: SeedCandidate[] = [];
  let checksumValid = 0;
  let truncated = false;

  const trial = [...words];
  const recurse = (depth: number, filled: string[]) => {
    if (truncated) return;
    if (depth === unknownPositions.length) {
      const mnemonic = trial.map((w) => w.trim().toLowerCase()).join(" ");
      if (!bip39.validateMnemonic(mnemonic)) return;
      checksumValid++;
      if (candidates.length >= maxCandidates) {
        truncated = true;
        return;
      }
      const addresses: string[] = [];
      try {
        const seed = mnemonicToSeed(mnemonic, passphrase);
        for (const p of paths) addresses.push(derivePath(seed, p).address);
      } catch {
        return;
      }
      candidates.push({ mnemonic, filledWords: [...filled], addresses });
      return;
    }
    const pos = unknownPositions[depth];
    for (const cand of candSets[depth]) {
      trial[pos] = cand;
      recurse(depth + 1, [...filled, cand]);
      if (truncated) return;
    }
  };
  recurse(0, []);

  return { unknownPositions, totalCombinations, checksumValid, candidates, truncated };
}
