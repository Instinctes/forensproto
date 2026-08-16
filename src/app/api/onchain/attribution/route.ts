import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { traceAttribution, liveProvider } from "@/lib/onchain-attribution";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * On-Chain-Attribution & Risk-Scoring für eine Adresse.
 * POST { address, caseId? } → AttributionReport (Risk, Exposure, Cluster, Sanktionen).
 */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  try {
    const { address, caseId } = await request.json();
    if (typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "Adresse erforderlich" }, { status: 400 });
    }
    const isBtc = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/.test(address);
    const isEth = /^0x[0-9a-fA-F]{40}$/.test(address);
    if (!isBtc && !isEth) {
      return NextResponse.json({ error: "Adressformat nicht erkannt (BTC/ETH)" }, { status: 400 });
    }

    const report = await traceAttribution(address.trim(), liveProvider());

    appendAuditLog({
      level: report.risk.level === "CRITICAL" || report.risk.level === "HIGH" ? "warning" : "info",
      action: "On-Chain-Attribution",
      message: `Adresse ${address} — Risiko ${report.risk.level} (${report.risk.score}), Cluster ${report.cluster.size}, Sanktionen: ${report.sanctions.clear ? "sauber" : report.sanctions.matches}`,
      source: "onchain/attribution",
      caseId: typeof caseId === "string" ? caseId : undefined,
      user: auth.username,
    });

    return NextResponse.json({ success: true, report });
  } catch (e) {
    console.error("[onchain/attribution] fehlgeschlagen:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Attribution fehlgeschlagen" }, { status: 502 });
  }
}
