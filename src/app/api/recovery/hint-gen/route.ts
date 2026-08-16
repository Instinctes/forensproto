import { NextRequest, NextResponse } from "next/server";
import { generateHintCandidates, type TypoOptions } from "@/lib/hint-gen";
import { appendAuditLog } from "@/lib/audit-log";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { getWordlistsDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";

const WORDLISTS_DIR = getWordlistsDir();

/**
 * Erzeugt aus erinnerten Fragmenten + Tippfehler-Modellen einen
 * Kandidatenraum. Liefert Anzahl + Beispielauszug (Vorschau). Optional
 * wird das Ergebnis direkt als Wortliste gespeichert.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parts: string[] = Array.isArray(body.parts) ? body.parts.map((p: unknown) => String(p)) : [];
    const optionalParts: string[] = Array.isArray(body.optionalParts)
      ? body.optionalParts.map((p: unknown) => String(p))
      : [];

    if (parts.filter((p) => p.trim()).length === 0 && optionalParts.filter((p) => p.trim()).length === 0) {
      return NextResponse.json({ success: false, error: "Mindestens ein Fragment erforderlich" }, { status: 400 });
    }

    const typos: TypoOptions | undefined = body.typos && typeof body.typos === "object" ? body.typos : undefined;
    const result = generateHintCandidates({
      parts,
      optionalParts,
      separators: Array.isArray(body.separators) ? body.separators.map((s: unknown) => String(s)) : undefined,
      caseVariants: body.caseVariants !== false,
      leet: !!body.leet,
      permuteOrder: !!body.permuteOrder,
      typos,
      maxSize: typeof body.maxSize === "number" ? body.maxSize : 200_000,
    });

    let savedName: string | undefined;
    if (body.save) {
      let name = basename(String(body.name || "")).trim() || `hints-${Date.now().toString(36)}.txt`;
      if (!/\.(txt|dic)$/.test(name)) name += ".txt";
      if (!/^[\w.\-]+$/.test(name)) {
        return NextResponse.json({ success: false, error: "Ungültiger Dateiname" }, { status: 400 });
      }
      const full = join(WORDLISTS_DIR, name);
      if (!full.startsWith(WORDLISTS_DIR)) {
        return NextResponse.json({ success: false, error: "Ungültiger Pfad" }, { status: 400 });
      }
      if (!existsSync(WORDLISTS_DIR)) await mkdir(WORDLISTS_DIR, { recursive: true });
      await writeFile(full, result.words.join("\n") + "\n", "utf-8");
      savedName = name;
      appendAuditLog({
        level: "info",
        action: "Hint-Wortliste gespeichert",
        message: `${result.count} Kandidaten aus Fragmenten → ${name}`,
        source: "recovery/hint-gen",
      });
    }

    return NextResponse.json({
      success: true,
      count: result.count,
      capped: result.capped,
      sample: result.words.slice(0, 40),
      saved: !!savedName,
      name: savedName,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
