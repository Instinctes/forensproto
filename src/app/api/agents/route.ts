import { NextResponse } from "next/server";
import { listAgents, executionMode } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, mode: executionMode(), agents: listAgents() });
}
