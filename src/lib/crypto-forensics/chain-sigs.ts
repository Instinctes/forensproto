/**
 * Adress-basierte On-Chain-Signatur-Sammlung
 * ===========================================
 * Holt zu einer Bitcoin-Adresse alle (legacy-P2PKH-)Signaturen aus der
 * Blockchain, verifiziert den Pubkey gegen die Adresse und berechnet die
 * SIGHASH-z-Werte. Basis für den adressbasierten Nonce-Reuse-Scan —
 * ohne wallet.dat-Upload. Multi-Source (blockstream + mempool.space)
 * mit Paginierung.
 */

import {
  parseBitcoinTx,
  computeSigHashAll,
  extractP2PKHSig,
  p2pkhScriptCodeFromPubkey,
} from "./bitcoin-tx-parser";
import { publicKeyToP2PKH } from "./ec-engine";
import { analyzeNonces } from "./nonce-analyzer";
import { parseSignatureAuto } from "./signature-analyzer";
import { sigHashSegwitV0, p2wpkhScriptCode, hash160, decodeBech32Address, type SegwitTxView } from "./bip143";
import { createHash } from "crypto";
import bs58 from "bs58";
import type { ECDSASignature, NonceAnalysisResult } from "./types";

const SOURCES = ["https://blockstream.info/api", "https://mempool.space/api"];
const TIMEOUT = 9000;

async function tryText(pathSuffix: string): Promise<string | null> {
  for (const base of SOURCES) {
    try {
      const res = await fetch(`${base}${pathSuffix}`, {
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { "User-Agent": "ForensProto/AddressScan/1.0" },
      });
      if (res.ok) return (await res.text()).trim();
    } catch {
      /* nächste Quelle */
    }
  }
  return null;
}

async function tryJson<T>(pathSuffix: string): Promise<T | null> {
  const t = await tryText(pathSuffix);
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

interface TxRef {
  txid: string;
}

/** Holt bis zu maxTx Transaktions-IDs einer Adresse (mit Paginierung). */
async function fetchTxids(address: string, maxTx: number): Promise<string[]> {
  const ids: string[] = [];
  let lastSeen = "";
  while (ids.length < maxTx) {
    const suffix = lastSeen
      ? `/address/${address}/txs/chain/${lastSeen}`
      : `/address/${address}/txs`;
    const page = await tryJson<TxRef[]>(suffix);
    if (!page || page.length === 0) break;
    for (const t of page) ids.push(t.txid);
    if (page.length < 25) break; // letzte Seite
    lastSeen = page[page.length - 1].txid;
  }
  return ids.slice(0, maxTx);
}

export interface ChainSig {
  txid: string;
  inputIndex: number;
  address: string;
  pubkeyHex: string;
  rHex: string;
  sHex: string;
  zHex: string;
}

export interface CollectResult {
  sigs: ChainSig[];
  txScanned: number;
  log: string[];
}

/**
 * Sammelt alle P2PKH-Signaturen, deren Pubkey zur Adresse passt.
 * Adressbasiert — der Pubkey wird aus dem scriptSig gewonnen und gegen
 * die Adresse geprüft (publicKeyToP2PKH).
 */
export async function collectAddressSignatures(
  address: string,
  opts: { maxTx?: number } = {}
): Promise<CollectResult> {
  const maxTx = Math.min(opts.maxTx ?? 50, 200);
  const log: string[] = [];
  const sigs: ChainSig[] = [];

  const txids = await fetchTxids(address, maxTx);
  if (txids.length === 0) {
    log.push(`○ ${address}: keine Transaktionen gefunden (oder Datenquellen nicht erreichbar)`);
    return { sigs, txScanned: 0, log };
  }
  log.push(`✓ ${txids.length} Transaktion(en) zum Scannen gefunden`);

  let txScanned = 0;
  for (const txid of txids) {
    const rawHex = await tryText(`/tx/${txid}/hex`);
    if (!rawHex) continue;
    txScanned++;
    let tx;
    try {
      tx = parseBitcoinTx(rawHex);
    } catch {
      continue;
    }
    for (let i = 0; i < tx.inputs.length; i++) {
      const inp = tx.inputs[i];
      if (!inp.scriptSig || inp.scriptSig.length < 10) continue;
      const ex = extractP2PKHSig(inp.scriptSig);
      if (!ex) continue;
      // Pubkey → Adresse ableiten und gegen die gesuchte Adresse prüfen
      let derived: string;
      try {
        derived = publicKeyToP2PKH(ex.pubkeyHex);
      } catch {
        continue;
      }
      if (derived !== address) continue;
      let zHex: string;
      try {
        zHex = computeSigHashAll(tx, i, p2pkhScriptCodeFromPubkey(ex.pubkeyHex));
      } catch {
        continue;
      }
      sigs.push({ txid, inputIndex: i, address, pubkeyHex: ex.pubkeyHex, rHex: ex.rHex, sHex: ex.sHex, zHex });
    }
  }

  log.push(`✓ ${sigs.length} passende Signatur(en) mit z-Wert extrahiert`);
  return { sigs, txScanned, log };
}

// ============================================================================
// SegWit (P2WPKH bc1… / P2SH-P2WPKH 3…) — JSON-basiert (BIP143)
// ============================================================================
function sha256d(b: Buffer): Buffer {
  return createHash("sha256").update(createHash("sha256").update(b).digest()).digest();
}
function base58Check(version: number, payload: Buffer): string {
  const data = Buffer.concat([Buffer.from([version]), payload]);
  const cs = sha256d(data).subarray(0, 4);
  return bs58.encode(Buffer.concat([data, cs]));
}
function pubkeyMatchesAddress(pubkeyHex: string, address: string): boolean {
  const h160 = hash160(Buffer.from(pubkeyHex, "hex"));
  if (address.startsWith("bc1")) {
    const dec = decodeBech32Address(address);
    return !!dec && dec.witnessVersion === 0 && dec.program.length === 20 && dec.program.equals(h160);
  }
  if (address.startsWith("3")) {
    const redeem = Buffer.concat([Buffer.from([0x00, 0x14]), h160]); // P2WPKH redeemScript
    return base58Check(0x05, hash160(redeem)) === address;
  }
  return false;
}

interface TxJson {
  version: number;
  locktime: number;
  vin: Array<{ txid: string; vout: number; sequence: number; witness?: string[]; prevout?: { value: number; scriptpubkey: string } }>;
  vout: Array<{ value: number; scriptpubkey: string }>;
}

/** Sammelt SegWit-v0-Signaturen (P2WPKH/P2SH-P2WPKH) einer Adresse via tx-JSON. */
export async function collectSegwitAddressSignatures(
  address: string,
  opts: { maxTx?: number } = {}
): Promise<CollectResult> {
  const maxTx = Math.min(opts.maxTx ?? 50, 200);
  const log: string[] = [];
  const sigs: ChainSig[] = [];

  const txids = await fetchTxids(address, maxTx);
  if (txids.length === 0) {
    log.push(`○ ${address}: keine Transaktionen gefunden`);
    return { sigs, txScanned: 0, log };
  }
  log.push(`✓ ${txids.length} Transaktion(en) zum Scannen (SegWit-Modus)`);

  let txScanned = 0;
  for (const txid of txids) {
    const tx = await tryJson<TxJson>(`/tx/${txid}`);
    if (!tx || !Array.isArray(tx.vin)) continue;
    txScanned++;
    const view: SegwitTxView = {
      version: tx.version,
      locktime: tx.locktime,
      inputs: tx.vin.map((v) => ({ txidBE: v.txid, vout: v.vout, sequence: v.sequence >>> 0 })),
      outputs: tx.vout.map((o) => ({ value: BigInt(o.value), scriptPubKeyHex: o.scriptpubkey })),
    };
    for (let i = 0; i < tx.vin.length; i++) {
      const v = tx.vin[i];
      if (!v.witness || v.witness.length < 2 || !v.prevout) continue;
      const sigW = v.witness[0];
      const pub = v.witness[1];
      if (!/^[0-9a-f]+$/i.test(pub) || pub.length !== 66) continue; // komprimierter Pubkey
      if (!pubkeyMatchesAddress(pub, address)) continue;
      const der = sigW.length > 2 ? sigW.slice(0, -2) : sigW; // hashtype-Byte entfernen
      let parsed;
      try {
        parsed = parseSignatureAuto(der);
      } catch {
        continue;
      }
      let zHex: string;
      try {
        zHex = sigHashSegwitV0({ tx: view, inputIndex: i, scriptCodeHex: p2wpkhScriptCode(pub), amountSat: BigInt(v.prevout.value) });
      } catch {
        continue;
      }
      sigs.push({ txid, inputIndex: i, address, pubkeyHex: pub, rHex: parsed.r.toString(16), sHex: parsed.s.toString(16), zHex });
    }
  }
  log.push(`✓ ${sigs.length} SegWit-Signatur(en) mit z-Wert extrahiert`);
  return { sigs, txScanned, log };
}

export interface AddressScanResult extends NonceAnalysisResult {
  address: string;
  txScanned: number;
  signatureCount: number;
  log: string[];
}

/** Vollständiger adressbasierter Nonce-Reuse-Scan inkl. Key-Recovery. */
export async function scanAddressForNonceReuse(
  address: string,
  opts: { maxTx?: number } = {}
): Promise<AddressScanResult> {
  // Routing nach Adresstyp: Legacy (1…) vs. SegWit (bc1…/3…)
  const { sigs, txScanned, log } = address.startsWith("1")
    ? await collectAddressSignatures(address, opts)
    : await collectSegwitAddressSignatures(address, opts);

  const ecdsa: ECDSASignature[] = sigs.map((s) => ({
    r: BigInt("0x" + (s.rHex.replace(/^0+/, "") || "0")),
    s: BigInt("0x" + (s.sHex.replace(/^0+/, "") || "0")),
    derEncoded: "",
    rawHex: s.rHex.padStart(64, "0") + s.sHex.padStart(64, "0"),
  }));
  const zValues = sigs.map((s) => s.zHex);

  const analysis = analyzeNonces(ecdsa, zValues, {
    txids: sigs.map((s) => s.txid),
  });
  return { address, txScanned, signatureCount: sigs.length, log, ...analysis };
}
