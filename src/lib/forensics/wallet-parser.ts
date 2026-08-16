import { createHash } from 'crypto';
import bs58 from 'bs58';

export interface WalletMetadata {
  mkey?: {
    encrypted: string;
    salt: string;
    iv: string;
    iterations: number;
    method: number;
  };
  ckeys: Array<{
    encrypted: string;
    publicKey: string;
    address: string;
  }>;
  intermediateHashes?: {
    sha256: string;
    ripemd160: string;
  };
  isValid: boolean;
  authenticityScore: number;
  authenticityStatus: 'valid' | 'suspicious' | 'fake';
  warnings: string[];
  entropy?: number;
  error?: string;
}

export class WalletParser {
  private static BITCOIN_MAGIC = Buffer.from([0x62, 0x31, 0x05, 0x00, 0x09, 0x00, 0x00, 0x00]);
  private static BDB_MAGIC = Buffer.from([0x00, 0x05, 0x31, 0x62]); // Berkeley DB Magic
  private static MKEY_MARKER = Buffer.from([0x04, 0x6d, 0x6b, 0x65, 0x79, 0x01, 0x00, 0x00, 0x00]); // \x04mkey\x01\x00\x00\x00
  private static CKEY_MARKER = Buffer.from([0x04, 0x63, 0x6b, 0x65, 0x79]); // \x04ckey
  private static SCAM_SIGNATURES = [
    'xingfeng',
    'wallet_generator_pro',
    'fake_wallet'
  ];

  static async parse(buffer: Buffer): Promise<WalletMetadata> {
    const result: WalletMetadata = {
      ckeys: [],
      isValid: false,
      authenticityScore: 0,
      authenticityStatus: 'fake',
      warnings: []
    };

    try {
      let score = 0;

      // 1. Check Magic Bytes / Metadata Header
      const magicOffset12 = buffer.slice(12, 20);
      const bdbMagicOffset12 = buffer.slice(12, 16);

      if (magicOffset12.equals(this.BITCOIN_MAGIC) || bdbMagicOffset12.equals(this.BDB_MAGIC)) {
        score += 30;
      } else {
        result.warnings.push("Ungültige Berkeley DB Header (Vielleicht keine echte wallet.dat)");
      }

      // 2. Scan for scam signatures
      const contentStr = buffer.toString('utf8', 0, Math.min(buffer.length, 1024 * 5)); // Scan first 5KB
      for (const sig of this.SCAM_SIGNATURES) {
        if (contentStr.includes(sig)) {
          score -= 50;
          result.warnings.push(`Bekannte Scam-Signatur gefunden: ${sig}`);
        }
      }

      // 3. Find Master Key (mkey)
      const mkeyPos = buffer.indexOf(this.MKEY_MARKER);
      if (mkeyPos !== -1) {
        score += 25;
        const dataStart = mkeyPos + this.MKEY_MARKER.length;
        const mkeyData = buffer.slice(dataStart, dataStart + 49);
        const salt = buffer.slice(dataStart + 49, dataStart + 58);
        const method = buffer.readUInt32LE(dataStart + 58);
        const iterations = buffer.readUInt32LE(dataStart + 62);

        result.mkey = {
          encrypted: mkeyData.toString('hex'),
          salt: salt.toString('hex'),
          iv: mkeyData.slice(16, 32).toString('hex'),
          iterations,
          method
        };

        // Entropy check on salt/metadata (should be high for encrypted wallets)
        const saltEntropy = this.calculateEntropy(salt);
        if (saltEntropy > 2.5) { // Random enough
          score += 10;
        } else {
          result.warnings.push("Niedrige Entropie in den Metadaten (Verdacht auf Fake-Keys)");
        }
      } else {
        result.warnings.push("Kein Master Key (mkey) gefunden - Wallet ist entweder unverschlüsselt oder eine Watch-Only-Wallet (Scam)");
      }

      // 4. Find Encrypted Private Keys (ckeys)
      let currentPos = 0;
      let ckeysFound = 0;
      while ((currentPos = buffer.indexOf(this.CKEY_MARKER, currentPos)) !== -1) {
        const dataStart = currentPos + this.CKEY_MARKER.length;
        const encryptedKey = buffer.slice(dataStart, dataStart + 48).toString('hex');
        const pubKeyLen = buffer[currentPos + 57];
        
        if (pubKeyLen === 33 || pubKeyLen === 65) {
          const pubKey = buffer.slice(currentPos + 58, currentPos + 58 + pubKeyLen);
          const { address, sha256, ripemd160 } = this.pubKeyToAddress(pubKey);
          
          if (!result.intermediateHashes) {
            result.intermediateHashes = { sha256, ripemd160 };
          }
          
          result.ckeys.push({
            encrypted: encryptedKey,
            publicKey: pubKey.toString('hex'),
            address
          });
          ckeysFound++;
        }
        currentPos += 1;
      }

      if (ckeysFound > 0) {
        score += 20;
        result.isValid = true;
      } else {
        result.warnings.push("Keine gültigen Bitcoin-Adressen/Keys extrahiert.");
      }

      // Final Scoring & Status
      result.authenticityScore = Math.max(0, Math.min(100, score));
      if (result.authenticityScore >= 80) result.authenticityStatus = 'valid';
      else if (result.authenticityScore >= 40) result.authenticityStatus = 'suspicious';
      else result.authenticityStatus = 'fake';

      return result;
    } catch (e) {
      result.error = `Parsemfehler: ${e instanceof Error ? e.message : String(e)}`;
      return result;
    }
  }

  static calculateEntropy(buffer: Buffer): number {
    const frequencies: { [key: number]: number } = {};
    for (const byte of buffer) {
      frequencies[byte] = (frequencies[byte] || 0) + 1;
    }
    
    let entropy = 0;
    const len = buffer.length;
    if (len === 0) return 0;
    
    for (const count of Object.values(frequencies)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  static pubKeyToAddress(pubKey: Buffer): { address: string, sha256: string, ripemd160: string } {
    const sha256 = createHash('sha256').update(pubKey).digest();
    const ripemd160 = createHash('rmd160').update(sha256).digest();
    const networkByte = Buffer.from([0x00]);
    const extendedRipemd = Buffer.concat([networkByte, ripemd160]);
    const doubleSha = createHash('sha256').update(
      createHash('sha256').update(extendedRipemd).digest()
    ).digest();
    const checksum = doubleSha.slice(0, 4);
    const finalBinary = Buffer.concat([extendedRipemd, checksum]);
    
    return {
      address: bs58.encode(finalBinary),
      sha256: sha256.toString('hex'),
      ripemd160: ripemd160.toString('hex')
    };
  }
}
