/**
 * Shamir Secret Sharing über GF(256) (Phase 2, Wertsteigerung #5)
 * ==============================================================
 * Die mathematisch tragfähige Threshold-/„MPC-adjazente"-Recovery: ein
 * Geheimnis (Seed, Master-Key, Passwort) wird in n Anteile zerlegt, von
 * denen beliebige k zur Rekonstruktion genügen (k-of-n). Genutzt u. a. von
 * Trezor (SLIP-39) und gängigen Backup-Schemata (Casa, geteilte Sorgerechts-
 * Backups).
 *
 * Implementierung über GF(2^8) mit AES-Reduktionspolynom 0x11b (Generator
 * 0x03) — kompatibel zum verbreiteten byteweisen SSS-Schema. Jeder Byte des
 * Geheimnisses wird unabhängig über ein Polynom vom Grad k-1 geteilt;
 * Rekonstruktion via Lagrange-Interpolation an x=0.
 *
 * Anteils-Serialisierung: 1 Byte x (1..255) || y-Bytes, als Hex.
 * Abhängigkeitsfrei (nur `crypto` für Zufall beim Split).
 */

import { randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// GF(256) Tabellen (Generator 0x03, Poly 0x11b)
// ---------------------------------------------------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // x *= 3 in GF(256)
    let next = x ^ ((x << 1) & 0xff);
    if (x & 0x80) next ^= 0x1b; // Reduktion bei Überlauf (0x11b ohne führendes Bit)
    // obiges berechnet x*2 ^ x = x*3
    x = next;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}
function gdiv(a: number, b: number): number {
  if (b === 0) throw new Error("Division durch 0 in GF(256)");
  if (a === 0) return 0;
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

// ---------------------------------------------------------------------------
// Split / Combine
// ---------------------------------------------------------------------------

export interface Share {
  x: number; // 1..255
  y: Buffer; // gleiche Länge wie das Geheimnis
}

/** Zerlegt ein Geheimnis in n Anteile mit Schwellenwert k (k-of-n). */
export function splitSecret(secret: Buffer, n: number, k: number, rng: (len: number) => Buffer = randomBytes): Share[] {
  if (k < 2 || k > 255) throw new Error("k muss in [2,255] liegen");
  if (n < k || n > 255) throw new Error("n muss in [k,255] liegen");

  const shares: Share[] = [];
  for (let i = 1; i <= n; i++) shares.push({ x: i, y: Buffer.alloc(secret.length) });

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // Polynom: coeff[0] = Geheimnis-Byte, coeff[1..k-1] = zufällig
    const coeffs = new Uint8Array(k);
    coeffs[0] = secret[byteIdx];
    const rnd = rng(k - 1);
    for (let c = 1; c < k; c++) coeffs[c] = rnd[c - 1];

    for (const share of shares) {
      // Horner-Auswertung des Polynoms an x = share.x
      let acc = 0;
      for (let c = k - 1; c >= 0; c--) acc = gmul(acc, share.x) ^ coeffs[c];
      share.y[byteIdx] = acc;
    }
  }
  return shares;
}

/** Rekonstruiert das Geheimnis aus >= k Anteilen (Lagrange-Interpolation an x=0). */
export function combineShares(shares: Share[]): Buffer {
  if (shares.length < 2) throw new Error("Mindestens 2 Anteile erforderlich");
  const xs = shares.map((s) => s.x);
  if (new Set(xs).size !== xs.length) throw new Error("Anteile mit doppeltem x");
  const len = shares[0].y.length;
  if (!shares.every((s) => s.y.length === len)) throw new Error("Anteile unterschiedlicher Länge");

  const secret = Buffer.alloc(len);
  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let result = 0;
    for (let i = 0; i < shares.length; i++) {
      // Lagrange-Basis L_i(0) = Π_{j≠i} x_j / (x_j - x_i)
      let num = 1;
      let den = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        num = gmul(num, shares[j].x); // x_j - 0 = x_j
        den = gmul(den, shares[i].x ^ shares[j].x); // Subtraktion = XOR in GF(2^8)
      }
      const lagrange = gdiv(num, den);
      result ^= gmul(shares[i].y[byteIdx], lagrange);
    }
    secret[byteIdx] = result;
  }
  return secret;
}

// ---------------------------------------------------------------------------
// (De-)Serialisierung
// ---------------------------------------------------------------------------

export function serializeShare(share: Share): string {
  return share.x.toString(16).padStart(2, "0") + share.y.toString("hex");
}

export function parseShare(hex: string): Share {
  const clean = hex.trim().toLowerCase().replace(/\s+/g, "");
  if (!/^[0-9a-f]+$/.test(clean) || clean.length < 4 || clean.length % 2 !== 0) {
    throw new Error("Ungültiges Anteils-Format");
  }
  const x = parseInt(clean.slice(0, 2), 16);
  if (x < 1) throw new Error("Anteils-x muss >= 1 sein");
  return { x, y: Buffer.from(clean.slice(2), "hex") };
}

export interface CombineResult {
  ok: boolean;
  secretHex?: string;
  secretUtf8?: string;
  error?: string;
}

/** Komfort-Wrapper: kombiniert serialisierte Anteile und liefert das Geheimnis. */
export function combineSerialized(hexShares: string[]): CombineResult {
  try {
    const shares = hexShares.filter((s) => s.trim()).map(parseShare);
    const secret = combineShares(shares);
    let utf8: string | undefined;
    // Druckbares UTF-8 nur, wenn plausibel
    const str = secret.toString("utf8");
    if (/^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(str)) utf8 = str;
    return { ok: true, secretHex: secret.toString("hex"), secretUtf8: utf8 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kombination fehlgeschlagen" };
  }
}
