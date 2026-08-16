import { NextRequest, NextResponse } from "next/server";
import {
  buildBaselineStrategy,
  buildInterviewPrompt,
  parseInterviewStrategy,
  mergeStrategy,
  type InterviewAnswers,
} from "@/lib/recovery-interview";
import { generateHintCandidates } from "@/lib/hint-gen";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * Erzeugt aus Interview-Antworten eine Suchstrategie. Deterministische
 * Basis + optionale LLM-Verfeinerung (Ollama). Liefert zusätzlich eine
 * Kandidaten-Vorschau-Zahl.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const answers = (body.answers || {}) as InterviewAnswers;
    const useLlm = body.useLlm !== false;
    const model = typeof body.model === "string" ? body.model : "llama3";

    const baseline = buildBaselineStrategy(answers);
    let llmUsed = false;
    let llmStrategy = null;

    if (useLlm) {
      try {
        const res = await fetch("http://127.0.0.1:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: buildInterviewPrompt(answers),
            stream: false,
            options: { temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          const data = await res.json();
          llmStrategy = parseInterviewStrategy(data.response || "");
          llmUsed = !!llmStrategy;
        }
      } catch {
        /* Ollama offline → nur Basis-Strategie */
      }
    }

    const strategy = mergeStrategy(baseline, llmStrategy);

    // Kandidaten-Vorschau (begrenzt)
    const preview = generateHintCandidates({
      parts: strategy.parts,
      optionalParts: strategy.optionalParts,
      separators: strategy.separators,
      caseVariants: strategy.caseVariants,
      leet: strategy.leet,
      permuteOrder: strategy.permuteOrder,
      typos: strategy.typos,
      maxSize: 200_000,
    });

    appendAuditLog({
      level: "info",
      action: "Recovery-Interview ausgewertet",
      message: `Strategie erstellt (${strategy.parts.length} Kern-, ${strategy.optionalParts.length} optionale Fragmente)${llmUsed ? " · KI-verfeinert" : " · heuristisch"}`,
      source: "recovery/interview",
    });

    return NextResponse.json({
      success: true,
      llmUsed,
      strategy,
      previewCount: preview.count,
      previewCapped: preview.capped,
      previewSample: preview.words.slice(0, 25),
    });
  } catch {
    return NextResponse.json({ success: false, error: "Interview-Auswertung fehlgeschlagen" }, { status: 500 });
  }
}
