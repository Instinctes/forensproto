import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { combineSerialized, splitSecret, serializeShare } from "@/lib/shamir";

export const dynamic = "force-dynamic";

/**
 * Shamir-Threshold-Recovery.
 * POST { mode:"combine", shares: string[] }            → Geheimnis rekonstruieren
 * POST { mode:"split", secretHex, n, k }               → Anteile erzeugen (Test/Setup)
 */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const mode = body.mode === "split" ? "split" : "combine";

    if (mode === "split") {
      if (typeof body.secretHex !== "string" || !/^[0-9a-fA-F]+$/.test(body.secretHex) || body.secretHex.length % 2 !== 0) {
        return NextResponse.json({ error: "secretHex (gerade Hex-Länge) erforderlich" }, { status: 400 });
      }
      const n = parseInt(String(body.n), 10);
      const k = parseInt(String(body.k), 10);
      if (!Number.isFinite(n) || !Number.isFinite(k)) return NextResponse.json({ error: "n und k erforderlich" }, { status: 400 });
      const shares = splitSecret(Buffer.from(body.secretHex, "hex"), n, k).map(serializeShare);
      return NextResponse.json({ success: true, n, k, shares });
    }

    if (!Array.isArray(body.shares)) return NextResponse.json({ error: "shares[] erforderlich" }, { status: 400 });
    const result = combineSerialized(body.shares.filter((s: unknown) => typeof s === "string"));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Shamir-Operation fehlgeschlagen" }, { status: 500 });
  }
}
