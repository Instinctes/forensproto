/**
 * Module H — Mathematical Analysis & Cryptographic Forensics
 * Zentrale Typdefinitionen
 *
 * Ausschließlich für legitime forensische Analysezwecke.
 * Keine automatisierte Ausnutzung von Schwachstellen.
 */

// ============================================================================
// Forensic Result Envelope
// ============================================================================

export interface ForensicResult<T> {
  success: boolean;
  timestamp: string;
  /** Alle Ergebnisse sind als forensische Hinweise gekennzeichnet */
  disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse";
  data?: T;
  error?: string;
  warnings: string[];
  /** Audit-Trail ID */
  analysisId: string;
}

// ============================================================================
// Elliptic Curve Types
// ============================================================================

export interface ECPoint {
  x: bigint;
  y: bigint;
}

export interface CurveParams {
  name: string;
  p: bigint;     // Field prime
  a: bigint;     // Curve coefficient a
  b: bigint;     // Curve coefficient b
  n: bigint;     // Curve order
  Gx: bigint;    // Generator x
  Gy: bigint;    // Generator y
}

export interface ECValidationResult {
  isOnCurve: boolean;
  isInSubgroup: boolean;
  isCompressed: boolean;
  format: "compressed" | "uncompressed" | "hybrid" | "invalid";
  publicKeyHex: string;
  addressP2PKH?: string;
  addressP2SH?: string;
  addressBech32?: string;
}

// ============================================================================
// Signature Analysis Types
// ============================================================================

export interface ECDSASignature {
  r: bigint;
  s: bigint;
  derEncoded: string;
  /** Raw hex der vollen Signatur */
  rawHex: string;
}

export interface SignatureAnalysis {
  /** Geparste r/s Werte */
  signature: ECDSASignature;
  /** DER-Encoding korrekt? */
  validDER: boolean;
  /** r und s innerhalb [1, n-1]? */
  validRange: boolean;
  /** Low-S (BIP-62) konform? */
  isLowS: boolean;
  /** Signatur-Malleability möglich? */
  malleabilityRisk: boolean;
  /** r-Wert Bitlänge */
  rBitLength: number;
  /** s-Wert Bitlänge */
  sBitLength: number;
  /** Auffällige Muster in r oder s */
  patterns: SignaturePattern[];
}

export type SignaturePattern =
  | { type: "low_entropy_r"; description: string }
  | { type: "low_entropy_s"; description: string }
  | { type: "repeated_r"; description: string; count: number }
  | { type: "small_s"; description: string }
  | { type: "known_weak_nonce"; description: string };

// ============================================================================
// Nonce Analysis Types
// ============================================================================

export interface NonceAnalysisResult {
  totalSignatures: number;
  uniqueRValues: number;
  /** Gruppen von Signaturen die den gleichen r-Wert verwenden */
  reusedNonces: NonceReuseGroup[];
  /** Statistische Auffälligkeiten */
  statisticalFindings: string[];
  /** Risikobewertung 0-100 */
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface NonceReuseGroup {
  rValue: string;
  /** Anzahl Signaturen mit diesem r-Wert */
  count: number;
  /** Indizes der betroffenen Signaturen */
  signatureIndices: number[];
  s1?: string;
  s2?: string;
  /** Echte Blockchain-TxIDs (wenn aus On-Chain-Scan bekannt) */
  txHash1?: string;
  txHash2?: string;
  /**
   * @deprecated Alias für txHash1 — nur gesetzt wenn echte TxID bekannt.
   * Früher: Pseudo-Hash aus s-Wert (irreführend); nicht mehr als TxID faken.
   */
  mockedTxHash1?: string;
  mockedTxHash2?: string;
  rValueFull?: string;
  /** Mathematisch extrapolierter Private Key (aus Nonce-Reuse) */
  extractedPrivateKey?: string;
  /** Abgeleiteter Public Key */
  derivedPublicKey?: string;
  /** Die mathematische Adresse des extrahierten Keys */
  derivedAddress?: string;
  /** WIF-komprimiert des extrahierten Keys */
  wifCompressed?: string;
  /** WIF-unkomprimiert des extrahierten Keys */
  wifUncompressed?: string;
  /** Forensischer Hinweis */
  forensicNote: string;
}

// ============================================================================
// Statistical Analysis Types
// ============================================================================

export interface EntropyAnalysis {
  /** Shannon-Entropy in bit/byte (0-8) */
  shannonEntropy: number;
  /** Bewertung */
  entropyLevel: "LOW" | "NORMAL" | "HIGH" | "MAXIMUM";
  /** Chi-Quadrat Teststatistik */
  chiSquare: number;
  /** p-Wert des Chi-Quadrat Tests */
  chiSquarePValue: number;
  /** Monobit Test (Anzahl 1-Bits vs 0-Bits) */
  monobitRatio: number;
  monobitPass: boolean;
  /** Runs Test */
  runsCount: number;
  runsPass: boolean;
  /** Byte-Häufigkeitsverteilung (256 Einträge) */
  byteFrequency: number[];
  /** Textuelle Bewertung */
  assessment: string;
}

// ============================================================================
// Key Structure Types
// ============================================================================

export type KeyFormat =
  | "wif_uncompressed"
  | "wif_compressed"
  | "hex_private"
  | "hex_public_uncompressed"
  | "hex_public_compressed"
  | "xprv"
  | "xpub"
  | "unknown";

export type AddressType =
  | "p2pkh"   // 1...
  | "p2sh"    // 3...
  | "p2wpkh"  // bc1q...
  | "p2tr"    // bc1p...
  | "eth";    // 0x...

export interface KeyStructureAnalysis {
  inputFormat: KeyFormat;
  isValid: boolean;
  network: "mainnet" | "testnet" | "unknown";
  /** Abgeleitete Adressen (wenn möglich) */
  derivedAddresses: Array<{
    type: AddressType;
    address: string;
    derivationPath?: string;
    liveBalance?: number;
  }>;
  /** Key-Metadaten */
  metadata: {
    bitLength: number;
    versionByte?: string;
    isCompressed?: boolean;
    checksum?: string;
    checksumValid?: boolean;
  };
  /** Sicherheitsbewertung */
  securityNotes: string[];
}

// ============================================================================
// PRNG Analysis Types
// ============================================================================

export interface PRNGAnalysis {
  /** Frequenz-Test (NIST SP 800-22) */
  frequencyTest: {
    pass: boolean;
    pValue: number;
    statistic: number;
  };
  /** Block-Frequenz-Test */
  blockFrequencyTest: {
    pass: boolean;
    pValue: number;
    blockSize: number;
  };
  /** Runs-Test */
  runsTest: {
    pass: boolean;
    pValue: number;
    totalRuns: number;
  };
  /** Gesamtbewertung */
  overallPass: boolean;
  /** Verdacht auf schwache PRNG? */
  weakPRNGSuspected: boolean;
  assessment: string;
}

// ============================================================================
// Wallet Forensics Types
// ============================================================================

export interface WalletForensicsResult {
  /** Adress-Clustering */
  addressClusters: AddressCluster[];
  /** UTXO-Muster */
  utxoPatterns: UTXOPattern[];
  /** Zeitbasierte Analyse */
  temporalAnalysis: TemporalPattern[];
  /** Zusammenfassung */
  summary: string;
}

export interface AddressCluster {
  addresses: string[];
  reason: string;
  confidence: number;
}

export interface UTXOPattern {
  type: "round_amount" | "change_detection" | "consolidation" | "peeling_chain";
  description: string;
  affectedTxIds: string[];
}

export interface TemporalPattern {
  type: "regular_interval" | "burst_activity" | "dormancy" | "timezone_hint";
  description: string;
  timeRange?: { start: string; end: string };
}
