import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { getUploadsDir } from "@/lib/data-dir";

// Known Hashcat modes for document types
const HASH_MODES: Record<string, { mode: string; label: string }> = {
  pdf: { mode: "10500", label: "PDF 1.4-1.6 (Acrobat 5-8)" },
  pdf_v5: { mode: "10600", label: "PDF 1.7 Level 3 (Acrobat 9)" },
  pdf_v6: { mode: "10700", label: "PDF 1.7 Level 8 (Acrobat 10+)" },
  office_2013: { mode: "9600", label: "MS Office 2013+" },
  office_2010: { mode: "9500", label: "MS Office 2010" },
  office_2007: { mode: "9400", label: "MS Office 2007" },
  office_old: { mode: "9700", label: "MS Office 97-2003 (MD5)" },
  zip: { mode: "13600", label: "WinZip AES-256" },
  zip_pkzip: { mode: "17200", label: "PKZIP (Compressed)" },
  sevenz: { mode: "11600", label: "7-Zip" },
  rar5: { mode: "13000", label: "RAR5" },
  rar3: { mode: "12500", label: "RAR3-hp" },
};

function detectFormat(buffer: Buffer, filename: string): string {
  const ext = path.extname(filename).toLowerCase();

  // PDF magic bytes
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "pdf";

  // ZIP / OOXML / XLSX / DOCX (PK header)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    if (ext === ".zip") return "zip";
    if ([".docx", ".xlsx", ".pptx"].includes(ext)) return "office_ooxml";
    // Could be a zip-based archive
    return "zip";
  }

  // 7z magic
  if (buffer[0] === 0x37 && buffer[1] === 0x7a && buffer[2] === 0xbc && buffer[3] === 0xaf) {
    return "7z";
  }

  // RAR magic
  if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
    // Check RAR version
    if (buffer[6] === 0x01 && buffer[7] === 0x00) return "rar5";
    return "rar3";
  }

  // Legacy Office (OLE2 / Compound Document)
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return "office_ole";
  }

  return "unknown";
}

function tryJohnExtractor(filePath: string, format: string): string | null {
  // Try common *2john scripts from john-the-ripper / hashcat utils
  const scripts: Record<string, string[]> = {
    pdf: ["pdf2john.pl", "pdf2john.py", "pdf2hashcat.py"],
    zip: ["zip2john", "zip2john.py"],
    "7z": ["7z2john.pl", "7z2hashcat.py"],
    rar3: ["rar2john", "rar2john.py"],
    rar5: ["rar2john", "rar2john.py"],
    office_ooxml: ["office2john.py"],
    office_ole: ["office2john.py"],
  };

  const candidates = scripts[format] || [];
  for (const script of candidates) {
    try {
      const result = execSync(`which ${script} 2>/dev/null && ${script} "${filePath}" 2>/dev/null`, {
        timeout: 15000,
        encoding: "utf-8",
      });
      const hash = result.trim().split("\n").pop();
      if (hash && hash.length > 10) return hash;
    } catch {
      // Script not found or failed, try next
    }
  }
  return null;
}

function extractPdfHash(buffer: Buffer): { hash: string; mode: string; label: string } | null {
  const content = buffer.toString("latin1");

  // Check if encrypted
  const encryptMatch = content.match(/\/Encrypt\s/);
  if (!encryptMatch) return null;

  // Detect PDF encryption revision
  const revMatch = content.match(/\/R\s+(\d+)/);
  const rev = revMatch ? parseInt(revMatch[1]) : 3;

  let modeInfo = HASH_MODES.pdf;
  if (rev >= 6) modeInfo = HASH_MODES.pdf_v6;
  else if (rev >= 5) modeInfo = HASH_MODES.pdf_v5;

  // Extract O and U values
  const oMatch = content.match(/\/O\s*\(([^)]*)\)/);
  const uMatch = content.match(/\/U\s*\(([^)]*)\)/);

  const hashParts = [
    `$pdf$${rev}`,
    oMatch ? `*O:${Buffer.from(oMatch[1], "latin1").toString("hex")}` : "",
    uMatch ? `*U:${Buffer.from(uMatch[1], "latin1").toString("hex")}` : "",
  ].filter(Boolean);

  return {
    hash: hashParts.join("") || `[PDF Rev ${rev} - use pdf2john for full hash]`,
    mode: modeInfo.mode,
    label: modeInfo.label,
  };
}

export async function POST(req: NextRequest) {
  let tmpPath = "";

  try {
    let formData;
    try {
      formData = await req.formData();
    } catch (parseErr) {
      console.error("FormData parse error:", parseErr);
      return NextResponse.json({
        error: "Datei konnte nicht gelesen werden. Bitte lade eine gültige Datei hoch.",
      }, { status: 400 });
    }

    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      return NextResponse.json({
        error: "Datei konnte nicht gelesen werden. Möglicherweise ist sie zu groß oder beschädigt.",
      }, { status: 400 });
    }

    const buffer = Buffer.from(bytes);
    const tmpDir = getUploadsDir();

    // Ensure upload dir exists
    const { mkdir } = await import("fs/promises");
    await mkdir(tmpDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    tmpPath = path.join(tmpDir, `${randomUUID()}_${safeName}`);

    await writeFile(tmpPath, buffer);

    const format = detectFormat(buffer, file.name);

    if (format === "unknown") {
      return NextResponse.json({
        error: "Dateiformat nicht erkannt. Unterstützt: PDF, DOCX/XLSX/PPTX, ZIP, 7z, RAR",
      }, { status: 400 });
    }

    // Try john extractors first
    const johnHash = tryJohnExtractor(tmpPath, format);

    if (johnHash) {
      const modeKey = format === "office_ooxml" ? "office_2013" : format === "office_ole" ? "office_old" : format;
      const modeInfo = HASH_MODES[modeKey] || { mode: "?", label: format };
      return NextResponse.json({
        success: true,
        filename: file.name,
        format,
        encryption: modeInfo.label,
        hashcatMode: modeInfo.mode,
        hash: johnHash,
        method: "john_extractor",
      });
    }

    // Fallback: manual extraction for PDF
    if (format === "pdf") {
      const pdfResult = extractPdfHash(buffer);
      if (pdfResult) {
        return NextResponse.json({
          success: true,
          filename: file.name,
          format: "PDF",
          encryption: pdfResult.label,
          hashcatMode: pdfResult.mode,
          hash: pdfResult.hash,
          method: "native_parser",
        });
      }
      return NextResponse.json({
        success: true,
        filename: file.name,
        format: "PDF",
        encryption: "Keine Verschlüsselung erkannt",
        hashcatMode: null,
        hash: null,
        protected: false,
      });
    }

    // Format erkannt, aber kein crackbarer Hash ohne *2john — ehrlich scheitern
    const modeKey = format === "office_ooxml" ? "office_2013" : format === "office_ole" ? "office_old" : format;
    const modeInfo = HASH_MODES[modeKey] || { mode: "?", label: format };

    return NextResponse.json(
      {
        success: false,
        filename: file.name,
        format: format.toUpperCase(),
        encryption: modeInfo.label,
        hashcatMode: modeInfo.mode,
        hash: null,
        hashComplete: false,
        method: "magic_bytes_only",
        error:
          `Format erkannt (${modeInfo.label}), aber kein Hash extrahiert. ` +
          `Bitte john-the-ripper / *2john installieren (z. B. brew install john-jumbo) und erneut versuchen.`,
      },
      { status: 422 }
    );
  } catch (err) {
    console.error("Doc-Breaker error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unbekannter Fehler bei der Verarbeitung",
    }, { status: 500 });
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath); } catch { /* ignore cleanup errors */ }
    }
  }
}

