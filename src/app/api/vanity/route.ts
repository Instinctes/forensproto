import { NextRequest, NextResponse } from "next/server";
import {
  startVanitySearch,
  getVanityState,
  requestVanityStop,
  validatePrefix,
  type VanityAddressType,
} from "@/lib/vanity";

export const dynamic = "force-dynamic";

const TYPES: VanityAddressType[] = ["p2pkh", "p2sh-p2wpkh", "p2wpkh"];

/**
 * POST /api/vanity
 * Body: { action: "validate" | "start" | "status" | "stop", type?, prefix?, caseSensitive? }
 *
 * Vanity-Adress-Generator: erzeugt neue Schlüsselpaare (CSPRNG), bis die
 * Adresse das gewünschte Präfix trägt. Siehe src/lib/vanity.ts.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const type: VanityAddressType = TYPES.includes(body?.type) ? body.type : "p2pkh";
  const prefix = typeof body?.prefix === "string" ? body.prefix : "";
  const caseSensitive = body?.caseSensitive !== false;

  switch (action) {
    case "validate":
      return NextResponse.json({ success: true, ...validatePrefix(type, prefix, caseSensitive) });

    case "start":
      try {
        startVanitySearch({ type, prefix, caseSensitive });
        return NextResponse.json({ success: true, state: getVanityState() });
      } catch (e) {
        return NextResponse.json(
          { success: false, error: e instanceof Error ? e.message : "Start fehlgeschlagen" },
          { status: 400 }
        );
      }

    case "stop":
      requestVanityStop();
      return NextResponse.json({ success: true, state: getVanityState() });

    case "status":
    default:
      return NextResponse.json({ success: true, state: getVanityState() });
  }
}
