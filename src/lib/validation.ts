/**
 * Gerichtsfeste Validierungs-Suite (Phase 1, Wertsteigerung #1)
 * ============================================================
 * Im Stil des NIST-CFTT-Programms / nach dem Daubert-Standard: Die
 * kryptografisch heiklen Kernfunktionen werden gegen ÖFFENTLICHE,
 * STANDARDISIERTE Testvektoren geprüft und das Ergebnis als
 * reproduzierbarer, signierbarer Report dokumentiert – inklusive
 * Methodik, Soll/Ist je Fall und ausgewiesener Fehlerrate.
 *
 * Warum das wertbildend ist: Es verwandelt „synthetisch verifiziert" in
 * „gegen offizielle Vektoren validiert, mit dokumentierter Fehlerrate" –
 * genau das, was Gerichte (Daubert) und Behörden (Tool-Validierung für
 * Laborakkreditierung) verlangen. Deterministisch, abhängigkeitsfrei.
 *
 * Quellen der Vektoren:
 *   - BIP-32 (HD Wallets) Test Vector 1   (seed 000102…0e0f)
 *   - BIP-39 (Mnemonic→Seed) Trezor-Vektor (passphrase "TREZOR")
 *   - secp256k1 Generator-Vielfache         (d=1, d=2)
 *   - WIF / P2PKH bekannte Referenzwerte     (d=1)
 *   - BIP-143 (SegWit v0) P2WPKH-Beispiel    (sigHash c37af3…cb670)
 *   - BIP-173 (bech32) Adress-Vektor
 *   - ECDSA-Nonce-Reuse: synthetischer Round-Trip (d → r,s1,s2 → d)
 */

import { readFileSync } from "fs";
import { join } from "path";

import {
  SECP256K1,
  mod,
  modInverse,
  scalarMultiply,
  getGenerator,
  publicKeyFromPrivate,
  encodePublicKey,
  publicKeyToP2PKH,
  encodeWIF,
} from "./crypto-forensics/ec-engine";
import { masterFromSeed, ckdPriv, mnemonicToSeed } from "./seed-recovery";
import { sigHashSegwitV0, p2wpkhScriptCode, decodeBech32Address } from "./crypto-forensics/bip143";
import { analyzeNonces } from "./crypto-forensics/nonce-analyzer";
import { composeMultisigScript, multisigAddresses } from "./multisig";
import { splitSecret, combineShares } from "./shamir";
import type { ECDSASignature } from "./crypto-forensics/types";
import { signData, type Signature } from "./report-signer";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface ValidationCase {
  id: string;
  category: string;
  standard: string; // Referenz auf den offiziellen Standard/Vektor
  description: string;
  expected: string;
  actual: string;
  pass: boolean;
  error?: string;
}

export interface ValidationReport {
  tool: string;
  version: string;
  nodeVersion: string;
  generatedAt: string;
  cases: ValidationCase[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errorRate: number; // 0..1
    valid: boolean; // errorRate === 0
    byCategory: Record<string, { passed: number; total: number }>;
  };
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function toolVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function hx(k: bigint): string {
  return k.toString(16).padStart(64, "0");
}

/** Definiert einen Fall; run() liefert den Ist-Wert. */
interface CaseDef {
  id: string;
  category: string;
  standard: string;
  description: string;
  expected: string;
  run: () => string;
}

function execCase(def: CaseDef): ValidationCase {
  try {
    const actual = def.run();
    return {
      id: def.id,
      category: def.category,
      standard: def.standard,
      description: def.description,
      expected: def.expected,
      actual,
      pass: actual === def.expected,
    };
  } catch (e) {
    return {
      id: def.id,
      category: def.category,
      standard: def.standard,
      description: def.description,
      expected: def.expected,
      actual: "(Ausnahme)",
      pass: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Synthetischer Nonce-Reuse-Vektor (deterministisch)
// ---------------------------------------------------------------------------

function nonceReuseRoundTrip(): { expected: string; actual: string } {
  const n = SECP256K1.n;
  // Bekannter Beispiel-Privatschlüssel (< n), Mastering-Bitcoin-Wert.
  const d = 0x1e99423a4ed27608a15a2616a2b0e9e52ced330ac530edcc32c8ffc6a526aeddn % n;
  const k = 0x49a0d7b786ec9cde0d0721d72804befd06571c974b191efb42ecf322ba9ddd9an % n;
  const z1 = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefn % n;
  const z2 = 0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacen % n;

  const R = scalarMultiply(k, getGenerator());
  const r = mod(R.x, n);
  const kInv = modInverse(k, n);
  const s1 = mod(kInv * mod(z1 + mod(r * d, n), n), n);
  const s2 = mod(kInv * mod(z2 + mod(r * d, n), n), n);

  const mk = (s: bigint): ECDSASignature => ({ r, s, derEncoded: "", rawHex: "" });
  const res = analyzeNonces([mk(s1), mk(s2)], [hx(z1), hx(z2)]);
  const recovered = res.reusedNonces[0]?.extractedPrivateKey ?? "(keine Recovery)";

  return { expected: hx(d), actual: recovered };
}

// ---------------------------------------------------------------------------
// Fallkatalog
// ---------------------------------------------------------------------------

function caseDefs(): CaseDef[] {
  const defs: CaseDef[] = [];

  // ---- secp256k1 Engine ----
  defs.push({
    id: "ec-G1",
    category: "secp256k1",
    standard: "secp256k1 Generatorpunkt G (d=1)",
    description: "Public Key für Privatschlüssel 1 = komprimierter Generatorpunkt G",
    expected: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    run: () => encodePublicKey(publicKeyFromPrivate(1n), true).toLowerCase(),
  });
  defs.push({
    id: "ec-G2",
    category: "secp256k1",
    standard: "secp256k1 2·G (d=2)",
    description: "Public Key für Privatschlüssel 2 (bekanntes Vielfaches von G)",
    expected: "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
    run: () => encodePublicKey(publicKeyFromPrivate(2n), true).toLowerCase(),
  });

  // ---- P2PKH-Adresse ----
  defs.push({
    id: "p2pkh-d1",
    category: "Adressen",
    standard: "P2PKH aus komprimiertem Pubkey (d=1)",
    description: "Legacy-Adresse für Privatschlüssel 1 (komprimiert)",
    expected: "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
    run: () => publicKeyToP2PKH(encodePublicKey(publicKeyFromPrivate(1n), true)),
  });

  // ---- WIF ----
  defs.push({
    id: "wif-d1-c",
    category: "WIF",
    standard: "WIF komprimiert (d=1, Mainnet)",
    description: "Wallet Import Format, komprimiert, für Privatschlüssel 1",
    expected: "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn",
    run: () => encodeWIF(hx(1n), true),
  });
  defs.push({
    id: "wif-d1-u",
    category: "WIF",
    standard: "WIF unkomprimiert (d=1, Mainnet)",
    description: "Wallet Import Format, unkomprimiert, für Privatschlüssel 1",
    expected: "5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf",
    run: () => encodeWIF(hx(1n), false),
  });

  // ---- BIP-32 Test Vector 1 ----
  const seed = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
  defs.push({
    id: "bip32-m-priv",
    category: "BIP-32",
    standard: "BIP-32 Test Vector 1 — m (Master Private Key)",
    description: "Masterschlüssel aus Seed 000102…0e0f",
    expected: "e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35",
    run: () => hx(masterFromSeed(seed).key),
  });
  defs.push({
    id: "bip32-m-cc",
    category: "BIP-32",
    standard: "BIP-32 Test Vector 1 — m (Master Chain Code)",
    description: "Master Chain Code aus Seed 000102…0e0f",
    expected: "873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508",
    run: () => masterFromSeed(seed).chainCode.toString("hex"),
  });
  defs.push({
    id: "bip32-m0h-priv",
    category: "BIP-32",
    standard: "BIP-32 Test Vector 1 — m/0' (Private Key)",
    description: "Gehärtete Ableitung m/0' (Index 0x80000000)",
    expected: "edb2e14f9ee77d26dd93b4ecede8d16ed408ce149b6cd80b0715a2d911a0afea",
    run: () => hx(ckdPriv(masterFromSeed(seed), 0x80000000).key),
  });
  defs.push({
    id: "bip32-m0h-cc",
    category: "BIP-32",
    standard: "BIP-32 Test Vector 1 — m/0' (Chain Code)",
    description: "Chain Code der gehärteten Ableitung m/0'",
    expected: "47fdacbd0f1097043b78c63c20c34ef4ed9a111d980047ad16282c7ae6236141",
    run: () => ckdPriv(masterFromSeed(seed), 0x80000000).chainCode.toString("hex"),
  });

  // ---- BIP-39 (Trezor) ----
  defs.push({
    id: "bip39-trezor",
    category: "BIP-39",
    standard: "BIP-39 Trezor-Testvektor (passphrase \"TREZOR\")",
    description: "Mnemonic (11×abandon + about) → 512-bit Seed",
    expected:
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    run: () =>
      mnemonicToSeed("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", "TREZOR").toString("hex"),
  });

  // ---- BIP-143 (SegWit v0) P2WPKH ----
  defs.push({
    id: "bip143-scriptcode",
    category: "BIP-143",
    standard: "BIP-143 P2WPKH scriptCode",
    description: "scriptCode für Pubkey 025476…ee6357 = 1976a914{hash160}88ac",
    expected: "1976a9141d0f172a0ecb48aee1be1f2687d2963ae33f71a188ac",
    run: () => p2wpkhScriptCode("025476c2e83188368da1ff3e292e7acafcdb3566bb0ad253f62fc70f07aeee6357"),
  });
  defs.push({
    id: "bip143-sighash",
    category: "BIP-143",
    standard: "BIP-143 P2WPKH SIGHASH (offizielles Beispiel, Input 1)",
    description: "SegWit-v0-Signatur-Hash des kanonischen BIP-143-Beispiels",
    expected: "c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670",
    run: () =>
      sigHashSegwitV0({
        tx: {
          version: 1,
          locktime: 0x11,
          inputs: [
            { txidBE: "9f96ade4b41d5433f4eda31e1738ec2b36f6e7d1420d94a6af99801a88f7f7ff", vout: 0, sequence: 0xffffffee },
            { txidBE: "8ac60eb9575db5b2d987e29f301b5b819ea83a5c6579d282d189cc04b8e151ef", vout: 1, sequence: 0xffffffff },
          ],
          outputs: [
            { value: 0x06b22c20n, scriptPubKeyHex: "76a9148280b37df378db99f66f85c95a783a76ac7a6d5988ac" },
            { value: 0x0d519390n, scriptPubKeyHex: "76a9143bde42dbee7e4dbe6a21b2d50ce2f0167faa815988ac" },
          ],
        },
        inputIndex: 1,
        scriptCodeHex: "1976a9141d0f172a0ecb48aee1be1f2687d2963ae33f71a188ac",
        amountSat: 600000000n,
        hashType: 0x01,
      }),
  });

  // ---- BIP-173 (bech32) ----
  defs.push({
    id: "bech32-bip173",
    category: "BIP-173",
    standard: "BIP-173 bech32 Adress-Vektor",
    description: "BC1QW508…F3T4 → Witness v0 + 20-Byte-Programm",
    expected: "v0:751e76e8199196d454941c45d1b3a323f1433bd6",
    run: () => {
      const d = decodeBech32Address("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4");
      if (!d) return "(decode fehlgeschlagen)";
      return `v${d.witnessVersion}:${d.program.toString("hex")}`;
    },
  });

  // ---- Multisig (P2SH 2-of-3) ----
  defs.push({
    id: "multisig-p2sh-2of3",
    category: "Multisig",
    standard: "P2SH 2-of-3 Adresse (BIP67-sortiert, Pubkeys d=1,2,3)",
    description: "Adressableitung aus komponiertem m-of-n Redeem-Script",
    expected: "33hG2q39jRi2NqicRJB4ggY1J8EJm97Szz",
    run: () => {
      const script = composeMultisigScript(
        2,
        [
          "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
          "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
          "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
        ],
        true
      );
      return multisigAddresses(script).p2sh;
    },
  });

  // ---- Shamir Secret Sharing (3-of-5 Round-Trip, deterministisch) ----
  defs.push({
    id: "shamir-3of5",
    category: "Threshold",
    standard: "Shamir GF(256) 3-of-5 Round-Trip (split → combine)",
    description: "Rekonstruiertes Geheimnis == ursprüngliches Geheimnis",
    expected: "00112233445566778899aabbccddeeff",
    run: () => {
      const secret = Buffer.from("00112233445566778899aabbccddeeff", "hex");
      const shares = splitSecret(secret, 5, 3, (len) => Buffer.alloc(len, 7));
      return combineShares([shares[0], shares[2], shares[4]]).toString("hex");
    },
  });

  // ---- ECDSA-Nonce-Reuse Recovery (synthetisch, deterministisch) ----
  const nr = nonceReuseRoundTrip();
  defs.push({
    id: "nonce-reuse",
    category: "Nonce-Reuse-Recovery",
    standard: "ECDSA Nonce-Reuse Round-Trip (d → r,s1,s2 → d)",
    description: "Wiederhergestellter Private Key == ursprünglicher Private Key",
    expected: nr.expected,
    run: () => nr.actual,
  });

  return defs;
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/** Führt die vollständige Validierungs-Suite aus und liefert den Report. */
export function runValidationSuite(): ValidationReport {
  const cases = caseDefs().map(execCase);
  const passed = cases.filter((c) => c.pass).length;
  const total = cases.length;
  const failed = total - passed;

  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const c of cases) {
    const b = (byCategory[c.category] ??= { passed: 0, total: 0 });
    b.total++;
    if (c.pass) b.passed++;
  }

  return {
    tool: "ForensProto",
    version: toolVersion(),
    nodeVersion: process.version,
    generatedAt: new Date().toISOString(),
    cases,
    summary: {
      total,
      passed,
      failed,
      errorRate: total > 0 ? failed / total : 0,
      valid: failed === 0,
      byCategory,
    },
  };
}

/** Kanonische, stabile Serialisierung des Reports (für Signatur/Hash). */
export function canonicalReport(report: ValidationReport): string {
  return JSON.stringify(report);
}

export interface SignedValidationReport {
  report: ValidationReport;
  signature: Signature;
}

/** Validierungs-Report inkl. Ed25519-Signatur über den kanonischen Inhalt. */
export function signedValidationReport(): SignedValidationReport {
  const report = runValidationSuite();
  const signature = signData(canonicalReport(report));
  return { report, signature };
}
