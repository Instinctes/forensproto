import { NextRequest, NextResponse } from "next/server";
import { readdir, stat, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { getWordlistsDir } from "@/lib/data-dir";

const WORDLISTS_DIR = getWordlistsDir();

export async function GET() {
  try {
    const wordlistsDir = WORDLISTS_DIR;
    const files = await readdir(wordlistsDir);
    
    const wordlists = [];
    for (const file of files) {
      if (file.endsWith(".txt") || file.endsWith(".dic")) {
        const stats = await stat(join(wordlistsDir, file));
        wordlists.push({
          name: file,
          sizeBytes: stats.size
        });
      }
    }
    
    // Sortiere alphabetisch
    wordlists.sort((a, b) => a.name.localeCompare(b.name));
    
    return NextResponse.json({ success: true, wordlists });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // Wenn der Ordner (noch) nicht existiert, leeres Array liefern
    if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, wordlists: [] });
    }
    return NextResponse.json({ success: false, error: error.message || "Unbekannter Fehler" }, { status: 500 });
  }
}

/** Speichert eine (generierte) Wortliste als .txt im wordlists-Ordner. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.words) || body.words.length === 0) {
      return NextResponse.json({ success: false, error: "words[] erforderlich" }, { status: 400 });
    }
    let name = basename(String(body.name || "")).trim() || `wordlist-${Date.now().toString(36)}.txt`;
    if (!/\.(txt|dic)$/.test(name)) name += ".txt";
    if (!/^[\w.\-]+$/.test(name)) {
      return NextResponse.json({ success: false, error: "Ungültiger Dateiname (nur [A-Za-z0-9._-])" }, { status: 400 });
    }
    const full = join(WORDLISTS_DIR, name);
    if (!full.startsWith(WORDLISTS_DIR)) {
      return NextResponse.json({ success: false, error: "Ungültiger Pfad" }, { status: 400 });
    }
    const clean = (body.words as unknown[])
      .map((w) => String(w).trim())
      .filter((w) => w.length > 0);
    if (!existsSync(WORDLISTS_DIR)) await mkdir(WORDLISTS_DIR, { recursive: true });
    await writeFile(full, clean.join("\n") + "\n", "utf-8");
    return NextResponse.json({ success: true, name, count: clean.length });
  } catch {
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }
}
