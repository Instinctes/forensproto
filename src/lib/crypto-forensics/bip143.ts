/**
 * BIP143 — SegWit-v0 SIGHASH (P2WPKH / P2SH-P2WPKH)
 * =================================================
 * Berechnet den Signatur-Hash (z) für SegWit-Eingaben. Im Gegensatz zu
 * Legacy benötigt BIP143 den Betrag (amount) des ausgegebenen Outputs.
 * Gegen den offiziellen BIP143-Testvektor verifiziert (siehe Test).
 *
 * Außerdem: bech32-Decoder (BIP173) + hash160, um Pubkeys gegen
 * bc1…-/3…-Adressen zu prüfen.
 */

import { createHash } from "crypto";

function sha256(b: Buffer): Buffer {
  return createHash("sha256").update(b).digest();
}
function hash256(b: Buffer): Buffer {
  return sha256(sha256(b));
}
export function hash160(b: Buffer): Buffer {
  return createHash("ripemd160").update(sha256(b)).digest();
}
function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}
function varint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt32LE(n, 1);
  return b;
}
/** txid (Display/Big-Endian) → interne Little-Endian-Bytes. */
function txidLE(txidBE: string): Buffer {
  return Buffer.from(txidBE, "hex").reverse();
}

export interface SegwitTxView {
  version: number;
  locktime: number;
  inputs: Array<{ txidBE: string; vout: number; sequence: number }>;
  outputs: Array<{ value: bigint; scriptPubKeyHex: string }>;
}

/** scriptCode für P2WPKH: 0x1976a914{hash160(pubkey)}88ac (inkl. Längen-Präfix). */
export function p2wpkhScriptCode(pubkeyHex: string): string {
  const h = hash160(Buffer.from(pubkeyHex, "hex")).toString("hex");
  return "1976a914" + h + "88ac";
}

/**
 * BIP143 SIGHASH (v0). `scriptCodeHex` enthält das Längen-Präfix
 * (z.B. p2wpkhScriptCode). Gibt z als Big-Endian-Hex zurück.
 */
export function sigHashSegwitV0(params: {
  tx: SegwitTxView;
  inputIndex: number;
  scriptCodeHex: string;
  amountSat: bigint;
  hashType?: number;
}): string {
  const { tx, inputIndex, scriptCodeHex, amountSat } = params;
  const hashType = params.hashType ?? 0x01;

  const prevouts = Buffer.concat(tx.inputs.map((i) => Buffer.concat([txidLE(i.txidBE), u32le(i.vout)])));
  const sequences = Buffer.concat(tx.inputs.map((i) => u32le(i.sequence)));
  const outputsSer = Buffer.concat(
    tx.outputs.map((o) => {
      const s = Buffer.from(o.scriptPubKeyHex, "hex");
      return Buffer.concat([u64le(o.value), varint(s.length), s]);
    })
  );

  const hashPrevouts = hash256(prevouts);
  const hashSequence = hash256(sequences);
  const hashOutputs = hash256(outputsSer);

  const me = tx.inputs[inputIndex];
  const outpoint = Buffer.concat([txidLE(me.txidBE), u32le(me.vout)]);
  const scriptCode = Buffer.from(scriptCodeHex, "hex"); // inkl. Längen-Präfix

  const preimage = Buffer.concat([
    u32le(tx.version),
    hashPrevouts,
    hashSequence,
    outpoint,
    scriptCode,
    u64le(amountSat),
    u32le(me.sequence),
    hashOutputs,
    u32le(tx.locktime),
    u32le(hashType),
  ]);

  return hash256(preimage).toString("hex");
}

// ============================================================================
// bech32 (BIP173) — Decode für bc1…-Adressen
// ============================================================================
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
function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0,
    bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    return null;
  }
  return out;
}

export interface Bech32Decoded {
  hrp: string;
  witnessVersion: number;
  program: Buffer; // Witness-Programm (bei P2WPKH 20 Bytes)
}

/** Decodiert eine bech32-Adresse (bc1…) zu Witness-Version + Programm. */
export function decodeBech32Address(addr: string): Bech32Decoded | null {
  const lower = addr.toLowerCase();
  const pos = lower.lastIndexOf("1");
  if (pos < 1 || pos + 7 > lower.length) return null;
  const hrp = lower.slice(0, pos);
  const dataPart = lower.slice(pos + 1);
  const data: number[] = [];
  for (const c of dataPart) {
    const d = CHARSET.indexOf(c);
    if (d === -1) return null;
    data.push(d);
  }
  if (bech32Polymod(hrpExpand(hrp).concat(data)) !== 1) return null; // nur bech32 (v0)
  const values = data.slice(0, -6);
  const witnessVersion = values[0];
  const program = convertBits(values.slice(1), 5, 8, false);
  if (!program) return null;
  return { hrp, witnessVersion, program: Buffer.from(program) };
}
