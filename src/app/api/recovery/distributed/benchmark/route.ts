import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { simulateDistributedRecovery, fleetThroughput, type SimAgent } from "@/lib/distributed-sim";
import { listAgents } from "@/lib/agents";
import { signData } from "@/lib/report-signer";

export const dynamic = "force-dynamic";

/**
 * Selbsttest / Benchmark der verteilten Recovery.
 * POST {
 *   keyspaceTotal, secretIndex?, faultyAgentIds?,
 *   agents?: [{id,hps}],   // fehlt → registrierte Agenten
 *   sign?: boolean         // signierten Report mitliefern
 * }
 */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "recovery:view");
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const keyspaceTotal = parseInt(String(body.keyspaceTotal), 10);
    if (!Number.isFinite(keyspaceTotal) || keyspaceTotal <= 0) {
      return NextResponse.json({ error: "keyspaceTotal (>0) erforderlich" }, { status: 400 });
    }

    let agents: SimAgent[];
    if (Array.isArray(body.agents) && body.agents.length > 0) {
      agents = body.agents
        .filter((a: unknown) => a && typeof a === "object")
        .map((a: { id?: string; hps?: number }, i: number) => ({ id: a.id || `agent-${i + 1}`, hps: Number(a.hps) > 0 ? Number(a.hps) : 1_000_000 }));
    } else {
      const registered = listAgents();
      if (registered.length === 0) {
        return NextResponse.json({ error: "Keine Agenten registriert und keine agents[] übergeben" }, { status: 400 });
      }
      agents = registered.map((a) => ({ id: a.id, hps: a.benchmarkHps && a.benchmarkHps > 0 ? a.benchmarkHps : 1_000_000 }));
    }

    const secretIndex = body.secretIndex === null || body.secretIndex === undefined ? null : parseInt(String(body.secretIndex), 10);
    const faultyAgentIds = Array.isArray(body.faultyAgentIds) ? body.faultyAgentIds.filter((x: unknown) => typeof x === "string") : [];

    const report = simulateDistributedRecovery({ keyspaceTotal, agents, secretIndex, faultyAgentIds });
    const throughput = fleetThroughput(agents, keyspaceTotal);

    const payload: Record<string, unknown> = { success: true, report, throughput };
    if (body.sign) payload.signature = signData(JSON.stringify(report));

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Benchmark fehlgeschlagen" }, { status: 500 });
  }
}
