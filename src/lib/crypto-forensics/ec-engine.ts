/**
 * Module H — Elliptic Curve Engine (secp256k1)
 *
 * Reine TypeScript/BigInt Implementierung für forensische Analyse.
 * Keine externen Abhängigkeiten — alle Berechnungen lokal.
 */

import { createHash } from "crypto";
import bs58 from "bs58";
import type { ECPoint, CurveParams, ECValidationResult } from "./types";

// ============================================================================
// secp256k1 Kurvenparameter
// ============================================================================

export const SECP256K1: CurveParams = {
  name: "secp256k1",
  p: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn,
  a: 0n,
  b: 7n,
  n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,
  Gx: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  Gy: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
};

export const INFINITY: ECPoint = { x: 0n, y: 0n };

// ============================================================================
// Modulare Arithmetik
// ============================================================================

export function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

export function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];

  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }

  if (old_r !== 1n) throw new Error("Inverse existiert nicht");
  return mod(old_s, m);
}

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  base = mod(base, m);
  while (exp > 0n) {
    if (exp & 1n) result = mod(result * base, m);
    exp >>= 1n;
    base = mod(base * base, m);
  }
  return result;
}

// ============================================================================
// EC Punkt-Arithmetik
// ============================================================================

export function isInfinity(p: ECPoint): boolean {
  return p.x === 0n && p.y === 0n;
}

export function isOnCurve(point: ECPoint, curve: CurveParams = SECP256K1): boolean {
  if (isInfinity(point)) return true;
  const { x, y } = point;
  const { p, a, b } = curve;
  const lhs = mod(y * y, p);
  const rhs = mod(x * x * x + a * x + b, p);
  return lhs === rhs;
}

export function pointAdd(p1: ECPoint, p2: ECPoint, curve: CurveParams = SECP256K1): ECPoint {
  if (isInfinity(p1)) return p2;
  if (isInfinity(p2)) return p1;

  const { p } = curve;

  if (p1.x === p2.x && p1.y !== p2.y) return INFINITY;

  let lambda: bigint;
  if (p1.x === p2.x && p1.y === p2.y) {
    // Point doubling
    if (p1.y === 0n) return INFINITY;
    lambda = mod(
      (3n * p1.x * p1.x + curve.a) * modInverse(2n * p1.y, p),
      p
    );
  } else {
    // Point addition
    lambda = mod(
      (p2.y - p1.y) * modInverse(mod(p2.x - p1.x, p), p),
      p
    );
  }

  const x3 = mod(lambda * lambda - p1.x - p2.x, p);
  const y3 = mod(lambda * (p1.x - x3) - p1.y, p);

  return { x: x3, y: y3 };
}

export function pointDouble(p: ECPoint, curve: CurveParams = SECP256K1): ECPoint {
  return pointAdd(p, p, curve);
}

export function scalarMultiply(k: bigint, point: ECPoint, curve: CurveParams = SECP256K1): ECPoint {
  if (k === 0n || isInfinity(point)) return INFINITY;
  if (k < 0n) {
    k = -k;
    point = { x: point.x, y: mod(-point.y, curve.p) };
  }

  let result = INFINITY;
  let addend = point;

  while (k > 0n) {
    if (k & 1n) {
      result = pointAdd(result, addend, curve);
    }
    addend = pointDouble(addend, curve);
    k >>= 1n;
  }

  return result;
}

// ============================================================================
// Generatorpunkt
// ============================================================================

export function getGenerator(curve: CurveParams = SECP256K1): ECPoint {
  return { x: curve.Gx, y: curve.Gy };
}

// ============================================================================
// Public Key Operationen
// ============================================================================

export function publicKeyFromPrivate(privateKey: bigint, curve: CurveParams = SECP256K1): ECPoint {
  if (privateKey <= 0n || privateKey >= curve.n) {
    throw new Error("Private Key außerhalb des gültigen Bereichs [1, n-1]");
  }
  return scalarMultiply(privateKey, getGenerator(curve), curve);
}

export function encodePublicKey(point: ECPoint, compressed: boolean = true): string {
  if (isInfinity(point)) throw new Error("Infinity-Punkt kann nicht encodiert werden");

  const xHex = point.x.toString(16).padStart(64, "0");

  if (compressed) {
    const prefix = point.y % 2n === 0n ? "02" : "03";
    return prefix + xHex;
  } else {
    const yHex = point.y.toString(16).padStart(64, "0");
    return "04" + xHex + yHex;
  }
}

export function decodePublicKey(hex: string): ECPoint {
  const prefix = hex.slice(0, 2);

  if (prefix === "04") {
    // Uncompressed
    if (hex.length !== 130) throw new Error("Ungültige Länge für uncompressed Key");
    return {
      x: BigInt("0x" + hex.slice(2, 66)),
      y: BigInt("0x" + hex.slice(66, 130)),
    };
  }

  if (prefix === "02" || prefix === "03") {
    // Compressed — y aus x berechnen
    if (hex.length !== 66) throw new Error("Ungültige Länge für compressed Key");
    const x = BigInt("0x" + hex.slice(2, 66));
    const { p, b } = SECP256K1;

    // y² = x³ + 7 mod p
    const ySquared = mod(x * x * x + b, p);
    // Tonelli-Shanks / Euler's criterion für p ≡ 3 mod 4
    const y = modPow(ySquared, (p + 1n) / 4n, p);

    // Prüfe ob y gerade/ungerade zum Prefix passt
    const isEven = y % 2n === 0n;
    const wantEven = prefix === "02";

    return {
      x,
      y: isEven === wantEven ? y : mod(-y, p),
    };
  }

  throw new Error(`Unbekannter Public Key Prefix: ${prefix}`);
}

// ============================================================================
// Adress-Ableitung
// ============================================================================

function hash160(data: Buffer): Buffer {
  const sha = createHash("sha256").update(data).digest();
  return createHash("rmd160").update(sha).digest();
}

function doubleSha256(data: Buffer): Buffer {
  return createHash("sha256").update(
    createHash("sha256").update(data).digest()
  ).digest();
}

export function publicKeyToP2PKH(pubKeyHex: string, network: "mainnet" | "testnet" = "mainnet"): string {
  const pubKeyBuf = Buffer.from(pubKeyHex, "hex");
  const h160 = hash160(pubKeyBuf);
  const versionByte = network === "mainnet" ? 0x00 : 0x6f;
  const versioned = Buffer.concat([Buffer.from([versionByte]), h160]);
  const checksum = doubleSha256(versioned).subarray(0, 4);
  return bs58.encode(Buffer.concat([versioned, checksum]));
}

export function publicKeyToP2SH(pubKeyHex: string, network: "mainnet" | "testnet" = "mainnet"): string {
  const pubKeyBuf = Buffer.from(pubKeyHex, "hex");
  const h160 = hash160(pubKeyBuf);
  // P2SH-P2WPKH: OP_0 <20-byte-hash>
  const redeemScript = Buffer.concat([Buffer.from([0x00, 0x14]), h160]);
  const scriptHash = hash160(redeemScript);
  const versionByte = network === "mainnet" ? 0x05 : 0xc4;
  const versioned = Buffer.concat([Buffer.from([versionByte]), scriptHash]);
  const checksum = doubleSha256(versioned).subarray(0, 4);
  return bs58.encode(Buffer.concat([versioned, checksum]));
}

// ============================================================================
// Validierung
// ============================================================================

export function validatePublicKey(hex: string): ECValidationResult {
  try {
    const prefix = hex.slice(0, 2);
    let format: ECValidationResult["format"] = "invalid";
    let isCompressed = false;

    if (prefix === "04" && hex.length === 130) {
      format = "uncompressed";
    } else if ((prefix === "02" || prefix === "03") && hex.length === 66) {
      format = "compressed";
      isCompressed = true;
    } else if ((prefix === "06" || prefix === "07") && hex.length === 130) {
      format = "hybrid";
    } else {
      return {
        isOnCurve: false,
        isInSubgroup: false,
        isCompressed: false,
        format: "invalid",
        publicKeyHex: hex,
      };
    }

    const point = decodePublicKey(
      format === "hybrid"
        ? "04" + hex.slice(2) // treat hybrid like uncompressed for decode
        : hex
    );

    const onCurve = isOnCurve(point);

    // Subgroup check: n * P = O
    const subgroupCheck = onCurve ? isInfinity(scalarMultiply(SECP256K1.n, point)) : false;

    // Adressen ableiten
    const compressedHex = encodePublicKey(point, true);
    const uncompressedHex = encodePublicKey(point, false);

    return {
      isOnCurve: onCurve,
      isInSubgroup: subgroupCheck,
      isCompressed,
      format,
      publicKeyHex: isCompressed ? compressedHex : uncompressedHex,
      addressP2PKH: onCurve ? publicKeyToP2PKH(compressedHex) : undefined,
      addressP2SH: onCurve ? publicKeyToP2SH(compressedHex) : undefined,
    };
  } catch {
    return {
      isOnCurve: false,
      isInSubgroup: false,
      isCompressed: false,
      format: "invalid",
      publicKeyHex: hex,
    };
  }
}

// ============================================================================
// WIF (Wallet Import Format) & Forensics Ext.
// ============================================================================

export function encodeWIF(privateKeyHex: string, compressed: boolean): string {
  // Ensure privateKeyHex is exactly 64 chars long (32 bytes)
  let pkStr = privateKeyHex;
  while (pkStr.length < 64) pkStr = "0" + pkStr;
  
  const pkBuffer = Buffer.from(pkStr, "hex");
  let payload: Buffer;
  
  if (compressed) {
    payload = Buffer.alloc(34);
    payload[0] = 0x80; // Mainnet 128
    pkBuffer.copy(payload, 1);
    payload[33] = 0x01; // Compressed flag
  } else {
    payload = Buffer.alloc(33);
    payload[0] = 0x80; // Mainnet 128
    pkBuffer.copy(payload, 1);
  }

  const checksum = doubleSha256(payload).subarray(0, 4);
  const wifBuffer = Buffer.concat([payload, checksum]);
  
  return bs58.encode(wifBuffer);
}

export function getOppositeS(s: bigint): bigint {
  return mod(SECP256K1.n - s, SECP256K1.n);
}

