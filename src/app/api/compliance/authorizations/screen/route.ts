import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { screenSanctions } from "@/lib/authorization";

export const dynamic = "force-dynamic";

/**
 * Ad-hoc Sanktions-/OFAC-Abgleich gegen die lokale Liste.
 * Nützlich als Vorprüfung, bevor eine Autorisierung erteilt wird.
 */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const names = Array.isArray(body?.names) ? body.names.filter((s: unknown) => typeof s === "string") : [];
    const addresses = Array.isArray(body?.addresses) ? body.addresses.filter((s: unknown) => typeof s === "string") : [];
    if (typeof body?.name === "string") names.push(body.name);
    if (typeof body?.address === "string") addresses.push(body.address);

    const result = screenSanctions({ names, addresses });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[compliance/screen] fehlgeschlagen:", e);
    return NextResponse.json({ error: "Screening fehlgeschlagen" }, { status: 500 });
  }
}
