import { NextRequest, NextResponse } from "next/server";
import { trainMarkov, generateMarkovCandidates } from "@/lib/markov-gen";
import { getRecoveredPasswords } from "@/lib/pattern-learning";
import { appendAuditLog } from "@/lib/audit-log";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { getWordlistsDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";

const WORDLISTS_DIR = getWordlistsDir();

/**
 * Trainiert ein Markov-Modell auf dem übergebenen Korpus (+ bereits
 * geknackten Passwörtern) und erzeugt wahrscheinlichkeits-geordnete
 * Kandidaten. Optional als Wortliste gespeichert.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const provided: string[] = Array.isArray(body.corpus) ? body.corpus.map((s: unknown) => String(s)) : [];
    const corpus = [...provided, ...(body.includeRecovered !== false ? getRecoveredPasswords() : [])].filter((s) => s.trim());

    if (corpus.length < 2) {
      return NextResponse.json({ success: false, error: "Korpus zu klein (mind. 2 Passwörter — eigene Liste übergeben oder erst Funde sammeln)" }, { status: 400 });
    }

    const order = typeof body.order === "number" && body.order >= 1 && body.order <= 4 ? body.order : 2;
    const model = trainMarkov(corpus, order);
    const words = generateMarkovCandidates(model, {
      count: typeof body.count === "number" ? Math.min(body.count, 100000) : 1000,
      minLen: typeof body.minLen === "number" ? body.minLen : 4,
      maxLen: typeof body.maxLen === "number" ? body.maxLen : 16,
    });

    let savedName: string | undefined;
    if (body.save) {
      let name = basename(String(body.name || "")).trim() || "markov.txt";
      if (!/\.(txt|dic)$/.test(name)) name += ".txt";
      if (!/^[\w.\-]+$/.test(name)) return NextResponse.json({ success: false, error: "Ungültiger Dateiname" }, { status: 400 });
      const full = join(WORDLISTS_DIR, name);
      if (!full.startsWith(WORDLISTS_DIR)) return NextResponse.json({ success: false, error: "Ungültiger Pfad" }, { status: 400 });
      if (!existsSync(WORDLISTS_DIR)) await mkdir(WORDLISTS_DIR, { recursive: true });
      await writeFile(full, words.join("\n") + "\n", "utf-8");
      savedName = name;
      appendAuditLog({
        level: "info",
        action: "Markov-Wortliste gespeichert",
        message: `${words.length} Kandidaten (Ordnung ${order}, Korpus ${corpus.length}) → ${name}`,
        source: "recovery/markov",
      });
    }

    return NextResponse.json({ success: true, count: words.length, corpusSize: corpus.length, order, sample: words.slice(0, 40), saved: !!savedName, name: savedName });
  } catch {
    return NextResponse.json({ success: false, error: "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
