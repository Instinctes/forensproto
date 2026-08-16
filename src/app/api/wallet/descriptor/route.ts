import { NextRequest, NextResponse } from "next/server";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { parseDescriptor } from "@/lib/descriptor";

export const dynamic = "force-dynamic";

/** Output-Descriptor (HW-/Descriptor-Wallets) strukturell parsen. POST { descriptor }. */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  try {
    const { descriptor } = await request.json();
    if (typeof descriptor !== "string" || !descriptor.trim()) {
      return NextResponse.json({ error: "descriptor erforderlich" }, { status: 400 });
    }
    const result = parseDescriptor(descriptor);
    return NextResponse.json({ success: result.ok, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Descriptor-Parse fehlgeschlagen" }, { status: 500 });
  }
}
