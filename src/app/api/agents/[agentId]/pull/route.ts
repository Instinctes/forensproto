import { NextRequest, NextResponse } from "next/server";
import { assignChunk, heartbeat } from "@/lib/agents";

export const dynamic = "force-dynamic";

/** Agent zieht den nächsten Keyspace-Chunk (Shard) zur Bearbeitung. */
export async function POST(_request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await context.params;
  heartbeat(agentId, {});
  const chunk = assignChunk(agentId);
  if (!chunk) return NextResponse.json({ success: true, chunk: null });
  return NextResponse.json({ success: true, chunk });
}
