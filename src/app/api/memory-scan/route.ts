import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { wordlists as BIP39_WORDLISTS } from "bip39";
import { getUploadsDir } from "@/lib/data-dir";

// Vollständige BIP-39-Wortlisten (jeweils 2048 Wörter), nicht nur eine
// 200-Wörter-Stichprobe. Alle Sprachen werden zu einer Lookup-Menge
// vereinigt, damit auch nicht-englische Seed-Phrasen erkannt werden
// (mehrsprachige Speicherforensik). Quelle: das bereits vorhandene
// npm-Paket "bip39" (dieselbe Bibliothek, die auch die Seed-Recovery
// nutzt) – keine erneut hardcodierte/gekürzte Liste mehr.
// Vollständige BIP-39-Wörter aller Sprachen inkl. Englisch (EN wurde früher
// fälschlich ausgeschlossen → Seeds wurden oft nicht erkannt).
const BIP39_ALL_WORDS = new Set<string>(
  Object.values(BIP39_WORDLISTS).flatMap((list) => list || [])
);

interface ScanResult {
  offset: number;
  type: string;
  value: string;
  context: string;
}

function scanChunk(chunk: Buffer, baseOffset: number): ScanResult[] {
  const results: ScanResult[] = [];
  const text = chunk.toString("latin1");

  // 1. Bitcoin WIF Private Keys (start with 5, K, or L)
  const wifRegex = /[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/g;
  let match;
  while ((match = wifRegex.exec(text)) !== null) {
    results.push({
      offset: baseOffset + match.index,
      type: "Bitcoin WIF Key",
      value: match[0],
      context: text.substring(Math.max(0, match.index - 10), match.index + match[0].length + 10).replace(/[^\x20-\x7E]/g, "."),
    });
  }

  // 2. Extended Keys (xprv / xpub)
  const xkeyRegex = /xpr[vb][1-9A-HJ-NP-Za-km-z]{107,108}/g;
  while ((match = xkeyRegex.exec(text)) !== null) {
    results.push({
      offset: baseOffset + match.index,
      type: match[0].startsWith("xprv") ? "BIP-32 xprv (Master Private)" : "BIP-32 xpub (Master Public)",
      value: match[0],
      context: "Extended Key",
    });
  }

  // 3. Ethereum-style hex private keys (64 hex chars)
  const hexKeyRegex = /(?:^|[^0-9a-f])([0-9a-f]{64})(?:[^0-9a-f]|$)/gi;
  while ((match = hexKeyRegex.exec(text)) !== null) {
    const candidate = match[1];
    // Filter: must not be all zeros or all f's
    if (!/^0+$/.test(candidate) && !/^f+$/i.test(candidate)) {
      // Heuristic: check surrounding context for key-related keywords
      const surroundStart = Math.max(0, match.index - 50);
      const surroundEnd = Math.min(text.length, match.index + 120);
      const surrounding = text.substring(surroundStart, surroundEnd).toLowerCase();
      if (surrounding.includes("key") || surrounding.includes("priv") || surrounding.includes("secret") || surrounding.includes("wallet") || surrounding.includes("eth")) {
        results.push({
          offset: baseOffset + match.index,
          type: "Hex Private Key (ETH-style)",
          value: candidate,
          context: surrounding.replace(/[^\x20-\x7E]/g, ".").substring(0, 60),
        });
      }
    }
  }

  // 4. BIP-39 Seed Phrases (12 or 24 consecutive BIP-39 words)
  // Wortlängen 3-10, da einzelne Nicht-Englisch-Listen (z.B. Französisch)
  // bis zu 10 Zeichen lange Wörter enthalten (rein englische Listen: 3-8).
  const asciiRegex = /[a-z]{3,10}(?:\s+[a-z]{3,10}){11,23}/gi;
  while ((match = asciiRegex.exec(text)) !== null) {
    const words = match[0].toLowerCase().split(/\s+/);
    const bip39Matches = words.filter(w => BIP39_ALL_WORDS.has(w));
    // If >80% of words are BIP-39 words, it's likely a seed phrase
    if (bip39Matches.length >= words.length * 0.8 && words.length >= 12) {
      results.push({
        offset: baseOffset + match.index,
        type: `BIP-39 Seed Phrase (${words.length} words)`,
        value: match[0],
        context: "Mnemonic sequence detected",
      });
    }
  }

  // 5. Printable ASCII strings > 8 chars between null bytes (potential passwords)
  const stringsRegex = /[\x20-\x7E]{8,64}/g;
  const strText = chunk.toString("binary");
  while ((match = stringsRegex.exec(strText)) !== null) {
    const val = match[0];
    // Heuristic: must contain mix of character classes
    const hasUpper = /[A-Z]/.test(val);
    const hasLower = /[a-z]/.test(val);
    const hasDigit = /[0-9]/.test(val);
    const hasSpecial = /[^A-Za-z0-9]/.test(val);
    const complexity = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

    // Only report strings with 3+ character classes (likely passwords)
    if (complexity >= 3 && val.length >= 8 && val.length <= 40) {
      // Check it's not obviously code/path
      if (!val.includes("/") && !val.includes("\\") && !val.includes("=") && !val.includes("<")) {
        results.push({
          offset: baseOffset + match.index,
          type: "Potential Password",
          value: val,
          context: `Complexity: ${complexity}/4, Length: ${val.length}`,
        });
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const tmpDir = getUploadsDir();
  const tmpPath = path.join(tmpDir, `mem_${randomUUID()}`);

  try {
    await writeFile(tmpPath, buffer);
    const fileInfo = await stat(tmpPath);

    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
    const allResults: ScanResult[] = [];
    const seen = new Set<string>(); // Deduplicate

    // Stream-process the file in chunks
    const totalChunks = Math.ceil(fileInfo.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks && allResults.length < 500; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE + 200, fileInfo.size); // Overlap 200 bytes

      const chunkBuf = buffer.subarray(start, end);
      const hits = scanChunk(chunkBuf, start);

      for (const hit of hits) {
        const dedup = `${hit.type}:${hit.value}`;
        if (!seen.has(dedup)) {
          seen.add(dedup);
          allResults.push(hit);
        }
      }
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      fileSize: fileInfo.size,
      fileSizeMB: (fileInfo.size / 1024 / 1024).toFixed(2),
      chunksScanned: totalChunks,
      results: allResults,
      resultCount: allResults.length,
      scanPatterns: [
        "Bitcoin WIF Private Keys",
        "BIP-32 Extended Keys (xprv/xpub)",
        "Ethereum Hex Private Keys",
        `BIP-39 Seed Phrases (${Object.keys(BIP39_WORDLISTS).length} Sprachen, ${BIP39_ALL_WORDS.size} Wörter gesamt)`,
        "Password-like Strings",
      ],
    });
  } finally {
    try { await unlink(tmpPath); } catch { /* cleanup */ }
  }
}
