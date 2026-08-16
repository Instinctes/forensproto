import { NextResponse } from "next/server";

interface CarvedFile {
  type: string;
  extension: string;
  offset: number;
  offsetHex: string;
  size: number | null;
  headerHex: string;
}

const SIGNATURES: { name: string; ext: string; magic: number[] }[] = [
  { name: "JPEG Image", ext: "jpg", magic: [0xFF, 0xD8, 0xFF] },
  { name: "PNG Image", ext: "png", magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { name: "PDF Document", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { name: "ZIP Archive", ext: "zip", magic: [0x50, 0x4B, 0x03, 0x04] },
  { name: "SQLite Database", ext: "sqlite", magic: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65] },
  { name: "GIF Image", ext: "gif", magic: [0x47, 0x49, 0x46, 0x38] },
  { name: "BMP Image", ext: "bmp", magic: [0x42, 0x4D] },
  { name: "RAR Archive", ext: "rar", magic: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07] },
  { name: "7z Archive", ext: "7z", magic: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
  { name: "ELF Executable", ext: "elf", magic: [0x7F, 0x45, 0x4C, 0x46] },
  { name: "Windows PE/EXE", ext: "exe", magic: [0x4D, 0x5A] },
  { name: "GZIP Archive", ext: "gz", magic: [0x1F, 0x8B] },
];

function matchSignature(buffer: Uint8Array, offset: number, magic: number[]): boolean {
  if (offset + magic.length > buffer.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buffer[offset + i] !== magic[i]) return false;
  }
  return true;
}

function toHex(buffer: Uint8Array, offset: number, length: number): string {
  const end = Math.min(offset + length, buffer.length);
  const bytes: string[] = [];
  for (let i = offset; i < end; i++) {
    bytes.push(buffer[i].toString(16).padStart(2, "0").toUpperCase());
  }
  return bytes.join(" ");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const results: CarvedFile[] = [];

    // Scan entire buffer for magic bytes
    for (let offset = 0; offset < buffer.length - 2; offset++) {
      for (const sig of SIGNATURES) {
        if (matchSignature(buffer, offset, sig.magic)) {
          results.push({
            type: sig.name,
            extension: sig.ext,
            offset,
            offsetHex: "0x" + offset.toString(16).toUpperCase().padStart(8, "0"),
            size: null,
            headerHex: toHex(buffer, offset, 32),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      fileSize: buffer.length,
      carved: results,
      carvedCount: results.length,
      scanComplete: true,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "File Carving fehlgeschlagen",
    }, { status: 500 });
  }
}
