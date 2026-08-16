import { NextRequest, NextResponse } from "next/server";
import { registerAgent } from "@/lib/agents";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const agent = registerAgent({ name: body.name, gpu: body.gpu, benchmarkHps: body.benchmarkHps });
    appendAuditLog({
      level: "info",
      action: "Recovery-Agent registriert",
      message: `${agent.name} (${agent.gpu}) — ${agent.id}`,
      source: "agents/register",
    });
    return NextResponse.json({ success: true, agentId: agent.id, agent });
  } catch {
    return NextResponse.json({ success: false, error: "Registrierung fehlgeschlagen" }, { status: 500 });
  }
}
