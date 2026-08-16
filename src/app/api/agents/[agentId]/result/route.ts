import { NextRequest, NextResponse } from "next/server";
import { submitResult, reportProgress } from "@/lib/agents";

export const dynamic = "force-dynamic";

/**
 * Agent meldet entweder Fortschritt (progress/speed) oder ein Endergebnis
 * (found/exhausted) für seinen Chunk.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await context.params;
  try {
    const body = await request.json();
    if (!body.jobId) return NextResponse.json({ success: false, error: "jobId erforderlich" }, { status: 400 });

    if (body.progress !== undefined || body.speed !== undefined) {
      reportProgress(body.jobId, { speed: body.speed, progress: body.progress, temperature: body.temperature, utilization: body.utilization });
      return NextResponse.json({ success: true, ack: "progress" });
    }

    const r = submitResult(agentId, body.jobId, {
      found: body.found,
      password: body.password,
      exhausted: body.exhausted,
      error: body.error,
    });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    return NextResponse.json({ success: true, ack: "result" });
  } catch {
    return NextResponse.json({ success: false, error: "Ergebnis-Verarbeitung fehlgeschlagen" }, { status: 500 });
  }
}
