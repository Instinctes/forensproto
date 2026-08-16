/**
 * Multisig-Wallet-Unterstützung (Phase 2, Wertsteigerung #5)
 * =========================================================
 * Deckt klassische m-of-n-Multisig ab — das Rückgrat moderner
 * Custody-/Inheritance-Setups (Casa, Unchained, Treuhand). Funktionen:
 *   - Redeem-/Witness-Script parsen  → m, n, Pubkeys
 *   - Script komponieren (BIP67-sortiert) aus Pubkeys
 *   - Adressableitung: P2SH, P2WSH, P2SH-P2WSH
 *   - Recovery-Readiness: wie viele Schlüssel fehlen bis zum Quorum
 *
 * Abhängigkeitsarm: nutzt nur `crypto` + `bs58` (bereits im Projekt).
 */

import { createHash } from "crypto";
import bs58 from "bs58";

function sha256(b: Buffer): Buffer {
  return createHash("sha256").update(b).digest();
}
function hash160(b: Buffer): Buffer {
  return createHash("ripemd160").update(sha256(b)).digest();
}
function doubleSha256(b: Buffer): Buffer {
  return sha256(sha256(b));
}
function base58check(versioned: Buffer): string {
  const checksum = doubleSha256(versioned).subarray(0, 4);
  return bs58.encode(Buffer.concat([versioned, checksum]));
}

// ---------------------------------------------------------------------------
// bech32 (BIP173) — Encode (Decode liegt in crypto-forensics/bip143)
// ---------------------------------------------------------------------------
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}
function createChecksum(hrp: string, data: number[]): number[] {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = bech32Polymod(values) ^ 1;
  const out: number[] = [];
  for (let p = 0; p < 6; p++) out.push((mod >> (5 * (5 - p))) & 31);
  return out;
}
function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    return null;
  }
  return ret;
}
/** Encodiert ein SegWit-Programm (witver + Programm-Bytes) als bech32-Adresse. */
export function encodeSegwitAddress(hrp: string, witver: number, program: Buffer): string {
  const data = [witver].concat(convertBits([...program], 8, 5, true)!);
  const combined = data.concat(createChecksum(hrp, data));
  return hrp + "1" + combined.map((d) => CHARSET[d]).join("");
}

// ---------------------------------------------------------------------------
// Script-Konstanten
// ---------------------------------------------------------------------------
const OP_CHECKMULTISIG = 0xae;
const OP_1 = 0x51; // … OP_16 = 0x60

function opToSmallInt(op: number): number | null {
  if (op === 0x00) return 0;
  if (op >= OP_1 && op <= 0x60) return op - 0x50;
  return null;
}
function smallIntToOp(n: number): number {
  if (n === 0) return 0x00;
  return 0x50 + n;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface MultisigScript {
  ok: boolean;
  m: number;
  n: number;
  pubkeys: string[];
  error?: string;
}

/** Parst ein bare m-of-n Multisig-Script: OP_m <pub>… OP_n OP_CHECKMULTISIG. */
export function parseMultisigScript(scriptHex: string): MultisigScript {
  try {
    const buf = Buffer.from(scriptHex.replace(/\s+/g, ""), "hex");
    if (buf.length < 4) return { ok: false, m: 0, n: 0, pubkeys: [], error: "Script zu kurz" };
    if (buf[buf.length - 1] !== OP_CHECKMULTISIG) return { ok: false, m: 0, n: 0, pubkeys: [], error: "Kein OP_CHECKMULTISIG am Ende" };

    const m = opToSmallInt(buf[0]);
    if (m === null || m < 1) return { ok: false, m: 0, n: 0, pubkeys: [], error: "OP_m ungültig" };

    const pubkeys: string[] = [];
    let i = 1;
    while (i < buf.length - 2) {
      const len = buf[i];
      if (len !== 33 && len !== 65) break; // Push einer Pubkey (komprimiert/unkomprimiert)
      if (i + 1 + len > buf.length - 2) return { ok: false, m: 0, n: 0, pubkeys: [], error: "Pubkey-Push überläuft" };
      pubkeys.push(buf.subarray(i + 1, i + 1 + len).toString("hex"));
      i += 1 + len;
    }
    const n = opToSmallInt(buf[buf.length - 2]);
    if (n === null) return { ok: false, m: 0, n: 0, pubkeys, error: "OP_n ungültig" };
    if (n !== pubkeys.length) return { ok: false, m, n, pubkeys, error: `OP_n (${n}) ≠ Anzahl Pubkeys (${pubkeys.length})` };
    if (m > n) return { ok: false, m, n, pubkeys, error: "m > n" };

    return { ok: true, m, n, pubkeys };
  } catch (e) {
    return { ok: false, m: 0, n: 0, pubkeys: [], error: e instanceof Error ? e.message : "Parse-Fehler" };
  }
}

/** Komponiert ein m-of-n Redeem-Script aus Pubkeys (BIP67-lexikografisch sortiert per Default). */
export function composeMultisigScript(m: number, pubkeysHex: string[], sort = true): string {
  const keys = pubkeysHex.map((k) => k.toLowerCase());
  if (sort) keys.sort(); // BIP67: lexikografische Sortierung der Hex-Pubkeys
  const parts: Buffer[] = [Buffer.from([smallIntToOp(m)])];
  for (const k of keys) {
    const kb = Buffer.from(k, "hex");
    parts.push(Buffer.from([kb.length]), kb);
  }
  parts.push(Buffer.from([smallIntToOp(keys.length)]), Buffer.from([OP_CHECKMULTISIG]));
  return Buffer.concat(parts).toString("hex");
}

// ---------------------------------------------------------------------------
// Adressableitung
// ---------------------------------------------------------------------------

export interface MultisigAddresses {
  p2sh: string; // 3…
  p2wsh: string; // bc1q… (32-Byte-Programm)
  p2shP2wsh: string; // 3… (verschachtelt)
}

/** Leitet alle gängigen Adresstypen aus einem Multisig-Script ab (Mainnet). */
export function multisigAddresses(scriptHex: string, network: "mainnet" | "testnet" = "mainnet"): MultisigAddresses {
  const script = Buffer.from(scriptHex.replace(/\s+/g, ""), "hex");
  const p2shVersion = network === "mainnet" ? 0x05 : 0xc4;
  const hrp = network === "mainnet" ? "bc" : "tb";

  // P2SH: hash160(script)
  const scriptHash160 = hash160(script);
  const p2sh = base58check(Buffer.concat([Buffer.from([p2shVersion]), scriptHash160]));

  // P2WSH: sha256(script) (32 Bytes), witver 0
  const scriptSha = sha256(script);
  const p2wsh = encodeSegwitAddress(hrp, 0, scriptSha);

  // P2SH-P2WSH: P2SH des Witness-Programms 0x0020||sha256(script)
  const witnessProgram = Buffer.concat([Buffer.from([0x00, 0x20]), scriptSha]);
  const p2shP2wsh = base58check(Buffer.concat([Buffer.from([p2shVersion]), hash160(witnessProgram)]));

  return { p2sh, p2wsh, p2shP2wsh };
}

// ---------------------------------------------------------------------------
// Recovery-Readiness
// ---------------------------------------------------------------------------

export interface MultisigRecovery {
  m: number;
  n: number;
  availableKeys: number;
  missingForQuorum: number;
  recoverable: boolean;
  note: string;
}

/** Bewertet, ob mit den vorhandenen Schlüsseln das Quorum erreichbar ist. */
export function assessMultisigRecovery(m: number, n: number, availableKeys: number): MultisigRecovery {
  const missing = Math.max(0, m - availableKeys);
  const recoverable = availableKeys >= m;
  return {
    m,
    n,
    availableKeys,
    missingForQuorum: missing,
    recoverable,
    note: recoverable
      ? `Quorum erreichbar: ${availableKeys}/${m} benötigte Schlüssel vorhanden (von ${n}).`
      : `Quorum NICHT erreichbar: es fehlen ${missing} Schlüssel (vorhanden ${availableKeys}, benötigt ${m} von ${n}).`,
  };
}
