import { NextRequest, NextResponse } from "next/server";
import { learnFromHistory, analyzePatterns } from "@/lib/pattern-learning";
import { saveRuleFile } from "@/lib/rules-store";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/** GET: Muster-Analyse über alle bisher wiederhergestellten Passwörter. */
export async function GET() {
  try {
    return NextResponse.json({ success: true, analysis: learnFromHistory() });
  } catch {
    return NextResponse.json({ success: false, error: "Analyse fehlgeschlagen" }, { status: 500 });
  }
}

/**
 * POST: speichert die abgeleiteten Regeln (Closed-Loop) als Regeldatei.
 * Optional kann ein eigenes Passwort-Sample mitgegeben werden.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = body.name || "learned.rule";
    const analysis = Array.isArray(body.passwords)
      ? analyzePatterns(body.passwords.filter((p: unknown) => typeof p === "string"))
      : learnFromHistory();

    if (analysis.suggestedRules.length === 0) {
      return NextResponse.json({ success: false, error: "Keine Regeln ableitbar (noch keine Funde?)" }, { status: 400 });
    }

    const result = await saveRuleFile(name, analysis.suggestedRules);
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });

    appendAuditLog({
      level: "info",
      action: "Closed-Loop Regeln gespeichert",
      message: `${result.ruleCount} gelernte Regeln aus ${analysis.sampleSize} Funden → ${result.name}`,
      source: "recovery/learn",
    });

    return NextResponse.json({ success: true, name: result.name, ruleCount: result.ruleCount, analysis });
  } catch {
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }
}
