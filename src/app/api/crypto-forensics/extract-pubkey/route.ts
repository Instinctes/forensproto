import { NextResponse } from "next/server";
import crypto from "crypto";
import bs58 from "bs58";
import {
  SECP256K1,
  publicKeyFromPrivate,
  encodePublicKey,
  validatePublicKey,
} from "@/lib/crypto-forensics/ec-engine";

// Helper for WIF decoding
function decodeWifOrHex(input: string): { privateKeyHex: string; isCompressedWif?: boolean } {
  const trimmed = input.trim();
  
  // RAW HEX detection (exactly 64 chars, valid hex)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { privateKeyHex: trimmed };
  }

  // Fallback: assume it's WIF
  try {
    const decoded = Buffer.from(bs58.decode(trimmed));
    const payload = decoded.subarray(0, decoded.length - 4);
    const checksum = decoded.subarray(decoded.length - 4);
    
    // Checksum verification
    const h1 = crypto.createHash("sha256").update(payload).digest();
    const h2 = crypto.createHash("sha256").update(h1).digest();
    if (!checksum.equals(h2.subarray(0, 4))) {
      throw new Error("Invalid WIF Checksum");
    }

    if (payload[0] !== 0x80 && payload[0] !== 0xef) {
      throw new Error("Unsupported WIF Network Byte");
    }

    let keyBuf = payload.subarray(1); // skip network byte
    let isCompressedWif = false;
    
    if (keyBuf.length === 33 && keyBuf[32] === 0x01) {
      isCompressedWif = true;
      keyBuf = keyBuf.subarray(0, 32);
    } else if (keyBuf.length !== 32) {
      throw new Error("Invalid Private Key Length in WIF");
    }

    return { privateKeyHex: keyBuf.toString("hex"), isCompressedWif };
  } catch (err: unknown) {
    throw new Error(
      "Input is neither a valid 64-character HEX string nor a valid WIF key. " + 
      (err instanceof Error ? err.message : String(err))
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { keyInput } = body;

    if (!keyInput) {
      return NextResponse.json({ error: "Missing required parameters (keyInput)" }, { status: 400 });
    }

    // Is it a raw public key?
    // Compressed starts with 02/03 and length 66
    // Uncompressed starts with 04 and length 130
    const trimmed = keyInput.trim();
    if (
      (trimmed.length === 66 && (trimmed.startsWith("02") || trimmed.startsWith("03"))) ||
      (trimmed.length === 130 && trimmed.startsWith("04"))
    ) {
      const validation = validatePublicKey(trimmed);
      if (validation.isOnCurve) {
        return NextResponse.json({
          source: "public_key",
          analysis: {
            isCompressed: validation.isCompressed,
            format: validation.format,
            publicKeyHex: validation.publicKeyHex,
            addressP2PKH: validation.addressP2PKH,
            addressP2SH: validation.addressP2SH,
          }
        });
      }
    }

    // Try parsing as Private Key (WIF or Hex)
    const { privateKeyHex, isCompressedWif } = decodeWifOrHex(keyInput);
    const pkBigInt = BigInt("0x" + privateKeyHex);

    if (pkBigInt <= 0n || pkBigInt >= SECP256K1.n) {
      throw new Error("Private Key is out of valid range for secp256k1");
    }

    // Derive Public Key point
    const pubPoint = publicKeyFromPrivate(pkBigInt);

    // Encode
    const pubCompressed = encodePublicKey(pubPoint, true);
    const pubUncompressed = encodePublicKey(pubPoint, false);

    // Validate and get Addresses
    const validationC = validatePublicKey(pubCompressed);
    const validationU = validatePublicKey(pubUncompressed);

    return NextResponse.json({
      source: "private_key",
      privateKeyHex,
      isCompressedWif,
      analysis: {
        compressed: {
          hex: pubCompressed,
          addressP2PKH: validationC.addressP2PKH,
          addressP2SH: validationC.addressP2SH,
        },
        uncompressed: {
          hex: pubUncompressed,
          addressP2PKH: validationU.addressP2PKH,
        }
      }
    });

  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Public Key Extraction Error: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
