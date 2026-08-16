import { NextRequest, NextResponse } from "next/server";
import { heartbeat } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const a = heartbeat(agentId, { benchmarkHps: body.benchmarkHps, status: body.status });
  if (!a) return NextResponse.json({ success: false, error: "Agent unbekannt" }, { status: 404 });
  return NextResponse.json({ success: true, agent: a });
}
