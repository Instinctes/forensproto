/**
 * Module H — Key-Struktur-Analyse
 *
 * Erkennung von Key-Formaten, Adress-Ableitung, Validation.
 * WIF, Hex, BIP32 xprv/xpub, Compressed/Uncompressed.
 */

import { createHash } from "crypto";
import bs58 from "bs58";
import {
  decodePublicKey,
  isOnCurve,
  publicKeyFromPrivate,
  encodePublicKey,
  publicKeyToP2PKH,
  publicKeyToP2SH,
  SECP256K1,
} from "./ec-engine";
import type { KeyFormat, KeyStructureAnalysis, AddressType } from "./types";

// ============================================================================
// Format-Erkennung
// ============================================================================

export function detectKeyFormat(input: string): KeyFormat {
  const clean = input.trim();

  // BIP32 Extended Keys
  if (clean.startsWith("xprv") || clean.startsWith("tprv")) return "xprv";
  if (clean.startsWith("xpub") || clean.startsWith("tpub")) return "xpub";

  // WIF Private Keys
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(clean)) {
    try {
      const decoded = bs58.decode(clean);
      if (decoded.length === 37) return "wif_uncompressed";
      if (decoded.length === 38 && decoded[33] === 0x01) return "wif_compressed";
    } catch {
      // Fall through
    }
  }

  // Hex Public Keys
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(clean)) return "hex_public_compressed";
  if (/^04[0-9a-fA-F]{128}$/.test(clean)) return "hex_public_uncompressed";

  // Hex Private Key (64 hex chars)
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return "hex_private";

  return "unknown";
}

// ============================================================================
// WIF Dekodierung
// ============================================================================

function decodeWIF(wif: string): { privateKey: bigint; compressed: boolean; network: "mainnet" | "testnet" } {
  const decoded = Buffer.from(bs58.decode(wif));

  // Checksum validieren
  const payload = decoded.subarray(0, decoded.length - 4);
  const checksum = decoded.subarray(decoded.length - 4);
  const hash = createHash("sha256").update(
    createHash("sha256").update(payload).digest()
  ).digest();

  const checksumValid = hash.subarray(0, 4).equals(checksum);
  if (!checksumValid) {
    throw new Error("WIF Checksum ungültig");
  }

  const versionByte = decoded[0];
  const compressed = decoded.length === 38 && decoded[33] === 0x01;

  let network: "mainnet" | "testnet";
  if (versionByte === 0x80) network = "mainnet";
  else if (versionByte === 0xef) network = "testnet";
  else throw new Error(`Unbekanntes WIF Version-Byte: 0x${versionByte.toString(16)}`);

  const keyBytes = decoded.subarray(1, 33);
  const privateKey = BigInt("0x" + keyBytes.toString("hex"));

  return { privateKey, compressed, network };
}

// ============================================================================
// Vollständige Key-Analyse
// ============================================================================

export function analyzeKeyStructure(input: string): KeyStructureAnalysis {
  const format = detectKeyFormat(input);
  const clean = input.trim();
  const securityNotes: string[] = [];
  const derivedAddresses: Array<{ type: AddressType; address: string; derivationPath?: string }> = [];

  let isValid = false;
  let network: "mainnet" | "testnet" | "unknown" = "unknown";
  const metadata: KeyStructureAnalysis["metadata"] = {
    bitLength: 0,
  };

  try {
    switch (format) {
      case "wif_compressed":
      case "wif_uncompressed": {
        const wif = decodeWIF(clean);
        isValid = true;
        network = wif.network;
        metadata.isCompressed = wif.compressed;
        metadata.bitLength = 256;
        metadata.versionByte = wif.network === "mainnet" ? "0x80" : "0xef";
        metadata.checksumValid = true;

        // Public Key ableiten
        const pubPoint = publicKeyFromPrivate(wif.privateKey);
        const compressedPub = encodePublicKey(pubPoint, true);
        const uncompressedPub = encodePublicKey(pubPoint, false);
        const usedPub = wif.compressed ? compressedPub : uncompressedPub;

        derivedAddresses.push(
          { type: "p2pkh", address: publicKeyToP2PKH(usedPub, network) },
          { type: "p2sh", address: publicKeyToP2SH(compressedPub, network) },
        );

        securityNotes.push(
          "⚠️ Private Key erkannt! Dieser Schlüssel sollte NIEMALS auf einem vernetzten System eingegeben werden."
        );
        break;
      }

      case "hex_private": {
        const privateKey = BigInt("0x" + clean.toLowerCase());
        if (privateKey > 0n && privateKey < SECP256K1.n) {
          isValid = true;
          metadata.bitLength = 256;

          const pubPoint = publicKeyFromPrivate(privateKey);
          const compressedPub = encodePublicKey(pubPoint, true);

          derivedAddresses.push(
            { type: "p2pkh", address: publicKeyToP2PKH(compressedPub) },
            { type: "p2sh", address: publicKeyToP2SH(compressedPub) },
          );

          securityNotes.push(
            "⚠️ Private Key erkannt! Sichern Sie diesen Schlüssel umgehend."
          );
        }
        network = "mainnet";
        break;
      }

      case "hex_public_compressed":
      case "hex_public_uncompressed": {
        const point = decodePublicKey(clean.toLowerCase());
        isValid = isOnCurve(point);
        metadata.isCompressed = format === "hex_public_compressed";
        metadata.bitLength = format === "hex_public_compressed" ? 264 : 520;

        if (isValid) {
          const compPub = encodePublicKey(point, true);
          derivedAddresses.push(
            { type: "p2pkh", address: publicKeyToP2PKH(compPub) },
            { type: "p2sh", address: publicKeyToP2SH(compPub) },
          );
        }
        network = "mainnet";
        break;
      }

      case "xprv":
      case "xpub": {
        // BIP32 Extended Key Analyse (Header-Level)
        try {
          const decoded = Buffer.from(bs58.decode(clean));
          const version = decoded.readUInt32BE(0);
          const depth = decoded[4];
          const fingerprint = decoded.subarray(5, 9).toString("hex");
          const childNumber = decoded.readUInt32BE(9);

          isValid = decoded.length === 82;
          metadata.bitLength = format === "xprv" ? 256 : 264;
          metadata.versionByte = "0x" + version.toString(16).padStart(8, "0");

          // Checksum validieren
          const payload = decoded.subarray(0, 78);
          const checksum = decoded.subarray(78, 82);
          const hash = createHash("sha256").update(
            createHash("sha256").update(payload).digest()
          ).digest();
          metadata.checksumValid = hash.subarray(0, 4).equals(checksum);

          network = version === 0x0488ade4 || version === 0x0488b21e ? "mainnet" : "testnet";

          securityNotes.push(
            `BIP32 Depth: ${depth}, Parent Fingerprint: ${fingerprint}, Child: ${childNumber}`
          );

          if (format === "xprv") {
            securityNotes.push(
              "⚠️ Extended Private Key! Alle abgeleiteten Keys können berechnet werden."
            );
          }
        } catch {
          isValid = false;
        }
        break;
      }

      default:
        securityNotes.push("Format nicht erkannt. Prüfen Sie die Eingabe.");
    }
  } catch (err) {
    isValid = false;
    securityNotes.push(`Analyse-Fehler: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    inputFormat: format,
    isValid,
    network,
    derivedAddresses,
    metadata,
    securityNotes,
  };
}
