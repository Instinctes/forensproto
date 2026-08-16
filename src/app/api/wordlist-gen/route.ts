import { NextRequest, NextResponse } from "next/server";
import { generateWordlist } from "@/lib/wordlist-gen";
import { getRecoveredPasswords } from "@/lib/pattern-learning";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * Erzeugt eine zielgerichtete Wortliste aus Keywords (+ optional bereits
 * geknackten Passwörtern als Basis). Gibt die Kandidaten zurück; das
 * Speichern erfolgt separat über POST /api/wordlists.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keywords: string[] = Array.isArray(body.keywords)
      ? body.keywords.map((k: unknown) => String(k)).filter(Boolean)
      : [];
    const extraBases: string[] = Array.isArray(body.passwords)
      ? body.passwords.map((p: unknown) => String(p)).filter(Boolean)
      : [];
    const includeRecovered = body.includeRecovered !== false;

    if (keywords.length === 0 && extraBases.length === 0) {
      return NextResponse.json({ success: false, error: "Mindestens ein Keyword erforderlich" }, { status: 400 });
    }

    const bases = includeRecovered ? [...extraBases, ...getRecoveredPasswords()] : extraBases;
    const words = generateWordlist({
      keywords,
      bases,
      maxSize: typeof body.maxSize === "number" ? body.maxSize : 5000,
    });

    appendAuditLog({
      level: "info",
      action: "Wortliste generiert",
      message: `${words.length} Kandidaten aus ${keywords.length} Keywords (+${bases.length} Basis-Wörter)`,
      source: "wordlist-gen",
    });

    return NextResponse.json({ success: true, count: words.length, words });
  } catch {
    return NextResponse.json({ success: false, error: "Generierung fehlgeschlagen" }, { status: 500 });
  }
}
