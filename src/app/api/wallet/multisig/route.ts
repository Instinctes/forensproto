import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { parseMultisigScript, composeMultisigScript, multisigAddresses, assessMultisigRecovery } from "@/lib/multisig";

export const dynamic = "force-dynamic";

/**
 * Multisig-Analyse.
 * POST { script }                         → parse + Adressen
 * POST { m, pubkeys[], sort?, available? } → komponieren + Adressen + Readiness
 */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    let scriptHex: string | undefined = typeof body.script === "string" ? body.script : undefined;

    if (!scriptHex && Array.isArray(body.pubkeys) && typeof body.m === "number") {
      const pubkeys = body.pubkeys.filter((k: unknown) => typeof k === "string");
      if (pubkeys.length === 0) return NextResponse.json({ error: "Keine Pubkeys" }, { status: 400 });
      scriptHex = composeMultisigScript(body.m, pubkeys, body.sort !== false);
    }
    if (!scriptHex) return NextResponse.json({ error: "script oder (m, pubkeys[]) erforderlich" }, { status: 400 });

    const parsed = parseMultisigScript(scriptHex);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, parsed }, { status: 400 });

    const network = body.network === "testnet" ? "testnet" : "mainnet";
    const addresses = multisigAddresses(scriptHex, network);
    const available = typeof body.available === "number" ? body.available : undefined;
    const recovery = available !== undefined ? assessMultisigRecovery(parsed.m, parsed.n, available) : undefined;

    return NextResponse.json({ success: true, script: scriptHex, parsed, addresses, recovery });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Multisig-Analyse fehlgeschlagen" }, { status: 500 });
  }
}
