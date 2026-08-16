/**
 * Bitcoin Transaction Parser — ForensProto Module H
 *
 * Pure TypeScript. Parst rohe Bitcoin-Transaktionen (Legacy P2PKH/P2SH).
 * Berechnet SIGHASH_ALL für jedes Input, extrahiert (r, s) aus scriptSig.
 */

import { createHash } from "crypto";

// ============================================================================
// Helpers
// ============================================================================

function sha256d(buf: Buffer): Buffer {
  return createHash("sha256")
    .update(createHash("sha256").update(buf).digest())
    .digest();
}

interface VarInt {
  value: number;
  size: number;
}

function readVarInt(buf: Buffer, offset: number): VarInt {
  const first = buf[offset];
  if (first < 0xfd) return { value: first, size: 1 };
  if (first === 0xfd) return { value: buf.readUInt16LE(offset + 1), size: 3 };
  if (first === 0xfe) return { value: buf.readUInt32LE(offset + 1), size: 5 };
  // 0xff: 8 bytes — clamp to safe integer range
  return { value: Number(buf.readBigUInt64LE(offset + 1) & 0xffffffffn), size: 9 };
}

function writeVarInt(value: number): Buffer {
  if (value < 0xfd) {
    const b = Buffer.alloc(1);
    b[0] = value;
    return b;
  }
  if (value <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(value, 1);
    return b;
  }
  if (value <= 0xffffffff) {
    const b = Buffer.alloc(5);
    b[0] = 0xfe;
    b.writeUInt32LE(value, 1);
    return b;
  }
  throw new Error("varint overflow");
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface TxInput {
  prevTxid: string; // hex big-endian (display format)
  prevVout: number;
  scriptSig: string; // hex
  sequence: number;
}

export interface TxOutput {
  value: bigint; // satoshis
  scriptPubKey: string; // hex
}

export interface ParsedTx {
  version: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  locktime: number;
  txid: string;
  isSegwit: boolean;
}

// ============================================================================
// Parse raw Bitcoin transaction (legacy + segwit)
// ============================================================================

export function parseBitcoinTx(raw: string | Buffer): ParsedTx {
  const buf = typeof raw === "string" ? Buffer.from(raw, "hex") : raw;
  let offset = 0;

  const version = buf.readInt32LE(offset);
  offset += 4;

  // Segwit marker detection
  let isSegwit = false;
  if (buf[offset] === 0x00 && buf.length > offset + 1 && buf[offset + 1] !== 0x00) {
    isSegwit = true;
    offset += 2; // skip marker (0x00) + flag (0x01)
  }

  // Inputs
  const inputCount = readVarInt(buf, offset);
  offset += inputCount.size;

  const inputs: TxInput[] = [];
  for (let i = 0; i < inputCount.value; i++) {
    // prevTxid stored as little-endian, displayed as big-endian
    const prevTxidLE = buf.subarray(offset, offset + 32);
    const prevTxid = Buffer.from(prevTxidLE).reverse().toString("hex");
    offset += 32;

    const prevVout = buf.readUInt32LE(offset);
    offset += 4;

    const scriptLen = readVarInt(buf, offset);
    offset += scriptLen.size;
    const scriptSig = buf.subarray(offset, offset + scriptLen.value).toString("hex");
    offset += scriptLen.value;

    const sequence = buf.readUInt32LE(offset);
    offset += 4;

    inputs.push({ prevTxid, prevVout, scriptSig, sequence });
  }

  // Outputs
  const outputCount = readVarInt(buf, offset);
  offset += outputCount.size;

  const outputs: TxOutput[] = [];
  for (let i = 0; i < outputCount.value; i++) {
    const value = buf.readBigUInt64LE(offset);
    offset += 8;

    const scriptLen = readVarInt(buf, offset);
    offset += scriptLen.size;
    const scriptPubKey = buf.subarray(offset, offset + scriptLen.value).toString("hex");
    offset += scriptLen.value;

    outputs.push({ value, scriptPubKey });
  }

  // Skip segwit witness data
  if (isSegwit) {
    for (let i = 0; i < inputs.length; i++) {
      const stackItems = readVarInt(buf, offset);
      offset += stackItems.size;
      for (let j = 0; j < stackItems.value; j++) {
        const itemLen = readVarInt(buf, offset);
        offset += itemLen.size + itemLen.value;
      }
    }
  }

  const locktime = buf.readUInt32LE(offset);
  offset += 4;

  // Compute txid — use non-witness serialization
  const txidPreimage = isSegwit
    ? serializeForTxid(version, inputs, outputs, locktime)
    : buf.subarray(0, offset);

  const txid = sha256d(txidPreimage).reverse().toString("hex");

  return { version, inputs, outputs, locktime, txid, isSegwit };
}

function serializeForTxid(
  version: number,
  inputs: TxInput[],
  outputs: TxOutput[],
  locktime: number
): Buffer {
  const parts: Buffer[] = [];

  const vBuf = Buffer.alloc(4);
  vBuf.writeInt32LE(version, 0);
  parts.push(vBuf);

  parts.push(writeVarInt(inputs.length));
  for (const inp of inputs) {
    parts.push(Buffer.from(inp.prevTxid, "hex").reverse());
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(inp.prevVout, 0);
    parts.push(voutBuf);
    const scriptBuf = Buffer.from(inp.scriptSig, "hex");
    parts.push(writeVarInt(scriptBuf.length));
    parts.push(scriptBuf);
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(inp.sequence, 0);
    parts.push(seqBuf);
  }

  parts.push(writeVarInt(outputs.length));
  for (const out of outputs) {
    const valBuf = Buffer.alloc(8);
    valBuf.writeBigUInt64LE(out.value, 0);
    parts.push(valBuf);
    const scriptBuf = Buffer.from(out.scriptPubKey, "hex");
    parts.push(writeVarInt(scriptBuf.length));
    parts.push(scriptBuf);
  }

  const ltBuf = Buffer.alloc(4);
  ltBuf.writeUInt32LE(locktime, 0);
  parts.push(ltBuf);

  return Buffer.concat(parts);
}

// ============================================================================
// SIGHASH_ALL (BIP-62 legacy, not segwit)
// ============================================================================

/**
 * Berechnet SIGHASH_ALL für einen bestimmten Input.
 *
 * @param tx          - Geparste Transaktion
 * @param inputIndex  - Index des zu signierenden Inputs
 * @param scriptCode  - scriptPubKey des ausgegebenen UTXOs (hex)
 *                      Für P2PKH: "76a914{hash160(pubkey)}88ac"
 */
export function computeSigHashAll(
  tx: ParsedTx,
  inputIndex: number,
  scriptCode: string
): string {
  const parts: Buffer[] = [];

  const vBuf = Buffer.alloc(4);
  vBuf.writeInt32LE(tx.version, 0);
  parts.push(vBuf);

  parts.push(writeVarInt(tx.inputs.length));
  for (let i = 0; i < tx.inputs.length; i++) {
    const inp = tx.inputs[i];
    parts.push(Buffer.from(inp.prevTxid, "hex").reverse());
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(inp.prevVout, 0);
    parts.push(voutBuf);

    if (i === inputIndex) {
      // Signed input: scriptCode einfügen
      const scriptBuf = Buffer.from(scriptCode, "hex");
      parts.push(writeVarInt(scriptBuf.length));
      parts.push(scriptBuf);
    } else {
      // Andere Inputs: leeres Script
      parts.push(Buffer.from([0x00]));
    }

    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(inp.sequence, 0);
    parts.push(seqBuf);
  }

  parts.push(writeVarInt(tx.outputs.length));
  for (const out of tx.outputs) {
    const valBuf = Buffer.alloc(8);
    valBuf.writeBigUInt64LE(out.value, 0);
    parts.push(valBuf);
    const scriptBuf = Buffer.from(out.scriptPubKey, "hex");
    parts.push(writeVarInt(scriptBuf.length));
    parts.push(scriptBuf);
  }

  const ltBuf = Buffer.alloc(4);
  ltBuf.writeUInt32LE(tx.locktime, 0);
  parts.push(ltBuf);

  // SIGHASH_ALL = 0x01000000
  parts.push(Buffer.from([0x01, 0x00, 0x00, 0x00]));

  return sha256d(Buffer.concat(parts)).toString("hex");
}

// ============================================================================
// P2PKH scriptSig Extraktion: <sig> <pubkey>
// ============================================================================

export interface ExtractedP2PKHSig {
  derHex: string;    // DER-Signatur ohne hashtype-Byte
  rHex: string;
  sHex: string;
  pubkeyHex: string;
  hashType: number;
}

/**
 * Extrahiert Signatur und Pubkey aus einem P2PKH scriptSig.
 * Format: <varint:sigLen> <DER_sig + hashtype> <varint:pubkeyLen> <pubkey>
 */
export function extractP2PKHSig(scriptSigHex: string): ExtractedP2PKHSig | null {
  try {
    if (!scriptSigHex || scriptSigHex.length < 20) return null;

    const buf = Buffer.from(scriptSigHex, "hex");
    let offset = 0;

    // Sig push
    const sigLen = buf[offset];
    offset++;
    if (sigLen < 0x47 || sigLen > 0x4c) return null; // 71–72 bytes typical DER+hashtype

    const sigWithHash = buf.subarray(offset, offset + sigLen);
    offset += sigLen;
    if (offset >= buf.length) return null;

    const hashType = sigWithHash[sigLen - 1];
    if (hashType !== 0x01 && hashType !== 0x81 && hashType !== 0x03) return null; // only SIGHASH_ALL variants

    const derBuf = sigWithHash.subarray(0, sigLen - 1);
    if (derBuf[0] !== 0x30) return null;

    // Parse DER r, s
    let pos = 2;
    if (derBuf[pos] !== 0x02) return null;
    const rLen = derBuf[pos + 1];
    pos += 2;
    const rHex = derBuf.subarray(pos, pos + rLen).toString("hex");
    pos += rLen;
    if (derBuf[pos] !== 0x02) return null;
    const sLen = derBuf[pos + 1];
    pos += 2;
    const sHex = derBuf.subarray(pos, pos + sLen).toString("hex");

    // Pubkey push
    const pubkeyLen = buf[offset];
    offset++;
    if (pubkeyLen !== 33 && pubkeyLen !== 65) return null;

    const pubkeyHex = buf.subarray(offset, offset + pubkeyLen).toString("hex");

    return {
      derHex: derBuf.toString("hex"),
      rHex,
      sHex,
      pubkeyHex,
      hashType,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// P2PKH scriptCode aus Pubkey ableiten
// ============================================================================

/**
 * Erstellt den P2PKH scriptCode (= scriptPubKey des UTXOs) aus einem Public Key.
 * P2PKH = OP_DUP OP_HASH160 <20-byte-hash160> OP_EQUALVERIFY OP_CHECKSIG
 *       = 76 a9 14 {hash160} 88 ac
 */
export function p2pkhScriptCodeFromPubkey(pubkeyHex: string): string {
  const pubkeyBuf = Buffer.from(pubkeyHex, "hex");
  const sha = createHash("sha256").update(pubkeyBuf).digest();
  const ripemd = createHash("rmd160").update(sha).digest();
  return "76a914" + ripemd.toString("hex") + "88ac";
}

/**
 * Prüft ob ein gegebener scriptPubKey zu einem pubkey gehört.
 * Unterstützt P2PKH (76a914...88ac).
 */
export function scriptPubKeyMatchesPubkey(scriptPubKey: string, pubkeyHex: string): boolean {
  const expected = p2pkhScriptCodeFromPubkey(pubkeyHex);
  return scriptPubKey.toLowerCase() === expected.toLowerCase();
}
