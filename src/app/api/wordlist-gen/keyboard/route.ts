import { NextRequest, NextResponse } from "next/server";
import { generateKeyboardWalks, germanCharset } from "@/lib/keyboard-walks";
import { appendAuditLog } from "@/lib/audit-log";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { getWordlistsDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";

const WORDLISTS_DIR = getWordlistsDir();

/** Generiert QWERTZ-Tastatur-Walks; optional als Wortliste gespeichert. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const words = generateKeyboardWalks({
      minLen: typeof body.minLen === "number" ? body.minLen : undefined,
      maxLen: typeof body.maxLen === "number" ? body.maxLen : undefined,
    });

    let savedName: string | undefined;
    if (body.save) {
      let name = basename(String(body.name || "")).trim() || "qwertz-walks.txt";
      if (!/\.(txt|dic)$/.test(name)) name += ".txt";
      if (!/^[\w.\-]+$/.test(name)) {
        return NextResponse.json({ success: false, error: "Ungültiger Dateiname" }, { status: 400 });
      }
      const full = join(WORDLISTS_DIR, name);
      if (!full.startsWith(WORDLISTS_DIR)) {
        return NextResponse.json({ success: false, error: "Ungültiger Pfad" }, { status: 400 });
      }
      if (!existsSync(WORDLISTS_DIR)) await mkdir(WORDLISTS_DIR, { recursive: true });
      await writeFile(full, words.join("\n") + "\n", "utf-8");
      savedName = name;
      appendAuditLog({
        level: "info",
        action: "QWERTZ-Walks gespeichert",
        message: `${words.length} Tastatur-Walks → ${name}`,
        source: "wordlist-gen/keyboard",
      });
    }

    return NextResponse.json({
      success: true,
      count: words.length,
      sample: words.slice(0, 40),
      charset: germanCharset(),
      saved: !!savedName,
      name: savedName,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
