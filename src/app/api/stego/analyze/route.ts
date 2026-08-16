import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getUploadsDir } from "@/lib/data-dir";

interface StegoFinding {
  type: string;
  severity: "info" | "suspicious" | "critical";
  description: string;
  data?: string;
}

function extractExifMetadata(buffer: Buffer): StegoFinding[] {
  const findings: StegoFinding[] = [];
  const text = buffer.toString("latin1");

  // JPEG EXIF marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    // Search for EXIF data
    const exifMarker = buffer.indexOf(Buffer.from("Exif"));
    if (exifMarker > 0) {
      findings.push({
        type: "EXIF",
        severity: "info",
        description: `EXIF-Daten gefunden bei Offset 0x${exifMarker.toString(16)}`,
      });
    }

    // Look for comment markers (0xFFFE)
    let idx = 0;
    while (idx < buffer.length - 2) {
      if (buffer[idx] === 0xff && buffer[idx + 1] === 0xfe) {
        const len = buffer.readUInt16BE(idx + 2);
        const comment = buffer.subarray(idx + 4, idx + 4 + len - 2).toString("utf-8").replace(/\0/g, "");
        if (comment.trim().length > 0) {
          findings.push({
            type: "JPEG Kommentar",
            severity: "suspicious",
            description: `Versteckter Kommentar in JPEG-Metadaten`,
            data: comment.substring(0, 200),
          });
        }
      }
      idx++;
    }
  }

  // PNG tEXt/iTXt/zTXt chunks
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    let offset = 8; // Skip PNG signature
    while (offset < buffer.length - 8) {
      const chunkLength = buffer.readUInt32BE(offset);
      const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");

      if (chunkType === "tEXt" || chunkType === "iTXt" || chunkType === "zTXt") {
        const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength).toString("latin1");
        const parts = chunkData.split("\0");
        findings.push({
          type: `PNG ${chunkType}`,
          severity: "suspicious",
          description: `Text-Chunk: ${parts[0]}`,
          data: parts.slice(1).join("").substring(0, 200),
        });
      }

      offset += 12 + chunkLength; // Length + Type + Data + CRC
      if (chunkType === "IEND") break;
    }
  }

  // Search for suspicious keywords in raw data
  const suspiciousPatterns = [
    { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/i, label: "Private Key (PEM)" },
    { pattern: /[5KL][1-9A-HJ-NP-Za-km-z]{50,51}/g, label: "Bitcoin WIF Key" },
    { pattern: /seed|mnemonic|passphrase|wallet|private.?key/gi, label: "Krypto-Keyword" },
  ];

  for (const { pattern, label } of suspiciousPatterns) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        type: `String-Scan: ${label}`,
        severity: "critical",
        description: `Verdächtiger String "${label}" im Bilddaten-Stream gefunden`,
        data: match[0].substring(0, 100),
      });
    }
  }

  return findings;
}

function analyzeLSB(buffer: Buffer, isJpeg: boolean): StegoFinding[] {
  const findings: StegoFinding[] = [];

  if (isJpeg) {
    // JPEG uses DCT, LSB analysis is different
    findings.push({
      type: "LSB-Hinweis",
      severity: "info",
      description: "JPEG nutzt DCT-Kompression. LSB-Analyse ist bei JPEG eingeschränkt. Für Steghide-Erkennung wird eine Signatursuche durchgeführt.",
    });

    // Look for steghide signature
    const steghideMarker = buffer.indexOf(Buffer.from([0x73, 0x74, 0x68, 0x6c])); // "sthl"
    if (steghideMarker > 0) {
      findings.push({
        type: "Steghide Signatur",
        severity: "critical",
        description: `Steghide-Marker bei Offset 0x${steghideMarker.toString(16)} erkannt! Diese Datei enthält wahrscheinlich versteckte Daten.`,
      });
    }
    return findings;
  }

  // For PNG/BMP: Extract LSB from raw pixel data
  // Find IDAT chunk in PNG or pixel data in BMP
  let pixelStart = 0;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    // PNG - find first IDAT
    let offset = 8;
    while (offset < buffer.length - 8) {
      const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      if (chunkType === "IDAT") {
        pixelStart = offset + 8;
        break;
      }
      const chunkLength = buffer.readUInt32BE(offset);
      offset += 12 + chunkLength;
    }
  } else if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    // BMP
    pixelStart = buffer.readUInt32LE(10);
  }

  if (pixelStart === 0) return findings;

  // Extract first 1024 bytes of LSB data
  const lsbBytes: number[] = [];
  const maxScan = Math.min(pixelStart + 8192, buffer.length);

  for (let i = pixelStart; i < maxScan; i += 3) {
    if (i + 2 < buffer.length) {
      let byte = 0;
      for (let bit = 0; bit < 8 && (i + bit * 3) < buffer.length; bit++) {
        byte |= (buffer[i + bit * 3] & 1) << (7 - bit);
      }
      lsbBytes.push(byte);
    }
  }

  // Try to decode as UTF-8 text
  const lsbData = Buffer.from(lsbBytes);
  const lsbText = lsbData.toString("utf-8").replace(/[^\x20-\x7E]/g, "");

  if (lsbText.length > 10) {
    // Check if it looks like meaningful text
    const wordCount = lsbText.split(/\s+/).filter(w => w.length > 2).length;
    if (wordCount >= 2) {
      findings.push({
        type: "LSB-Extraktion",
        severity: "critical",
        description: `Versteckter Text in den niederwertigsten Bits gefunden!`,
        data: lsbText.substring(0, 300),
      });
    }
  }

  // Entropy analysis on LSB stream
  const freq = new Array(256).fill(0);
  for (const b of lsbBytes) freq[b]++;
  let entropy = 0;
  for (const f of freq) {
    if (f > 0) {
      const p = f / lsbBytes.length;
      entropy -= p * Math.log2(p);
    }
  }

  const entropyLevel = entropy > 7.5 ? "critical" : entropy > 6.5 ? "suspicious" : "info";
  findings.push({
    type: "Entropy-Analyse",
    severity: entropyLevel,
    description: `Shannon-Entropy der LSB-Daten: ${entropy.toFixed(3)} bit/byte${
      entropy > 7.5 ? " — SEHR HOCH! Wahrscheinlich verschlüsselte/versteckte Daten!" :
      entropy > 6.5 ? " — Erhöht. Möglicherweise versteckte Daten." :
      " — Normal. Keine Auffälligkeiten."
    }`,
  });

  return findings;
}

function scanEmbeddedFiles(buffer: Buffer): StegoFinding[] {
  const findings: StegoFinding[] = [];

  // Search for embedded file signatures AFTER the image header
  const signatures = [
    { magic: Buffer.from("%PDF"), label: "PDF-Dokument" },
    { magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]), label: "ZIP/Archiv" },
    { magic: Buffer.from([0x52, 0x61, 0x72, 0x21]), label: "RAR-Archiv" },
    { magic: Buffer.from("-----BEGIN"), label: "PEM-Zertifikat/Key" },
    { magic: Buffer.from([0x37, 0x7a, 0xbc, 0xaf]), label: "7-Zip Archiv" },
  ];

  const startSearch = 100; // Skip image header

  for (const { magic, label } of signatures) {
    let idx = startSearch;
    while (idx < buffer.length) {
      const found = buffer.indexOf(magic, idx);
      if (found === -1 || found < startSearch) break;

      findings.push({
        type: `Eingebettete Datei: ${label}`,
        severity: "critical",
        description: `${label}-Signatur bei Offset 0x${found.toString(16)} im Bilddaten-Stream entdeckt!`,
      });
      idx = found + magic.length;
      break; // Report first occurrence only
    }
  }

  return findings;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".bmp", ".gif"].includes(ext)) {
    return NextResponse.json({ error: "Nur Bilddateien (.png, .jpg, .bmp) werden unterstützt" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const tmpPath = path.join(getUploadsDir(), `stego_${randomUUID()}${ext}`);

  try {
    await writeFile(tmpPath, buffer);

    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isBMP = buffer[0] === 0x42 && buffer[1] === 0x4d;

    const format = isJpeg ? "JPEG" : isPNG ? "PNG" : isBMP ? "BMP" : "Unknown";

    // Run all analysis passes
    const metadataFindings = extractExifMetadata(buffer);
    const lsbFindings = analyzeLSB(buffer, isJpeg);
    const embeddedFindings = scanEmbeddedFiles(buffer);

    const allFindings = [...metadataFindings, ...lsbFindings, ...embeddedFindings];

    // Calculate risk score
    const criticalCount = allFindings.filter(f => f.severity === "critical").length;
    const suspiciousCount = allFindings.filter(f => f.severity === "suspicious").length;
    const riskScore = Math.min(100, criticalCount * 35 + suspiciousCount * 15);

    return NextResponse.json({
      success: true,
      filename: file.name,
      format,
      fileSize: buffer.length,
      fileSizeKB: (buffer.length / 1024).toFixed(2),
      findings: allFindings,
      findingCount: allFindings.length,
      riskScore,
      riskLevel: riskScore >= 70 ? "CRITICAL" : riskScore >= 30 ? "SUSPICIOUS" : "CLEAN",
    });
  } finally {
    try { await unlink(tmpPath); } catch { /* cleanup */ }
  }
}
