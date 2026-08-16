import { NextRequest, NextResponse } from "next/server";
import { deriveVisualKey, SUPPORTED_SIZES } from "@/lib/visual-key";

export const dynamic = "force-dynamic";

/**
 * POST /api/visual-key/generate
 * Body: { size: 8|12|16, cells: number[], salt?: string }
 * → CL-1 Visual Key + Adressen (P2PKH, P2SH-P2WPKH, P2WPKH)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const size = Number(body.size);
    const cells = body.cells;
    const salt = typeof body.salt === "string" ? body.salt : undefined;

    if (!SUPPORTED_SIZES.includes(size as 8 | 12 | 16)) {
      return NextResponse.json(
        { success: false, error: `size muss ${SUPPORTED_SIZES.join("|")} sein` },
        { status: 400 }
      );
    }
    if (!Array.isArray(cells)) {
      return NextResponse.json(
        { success: false, error: "cells (Array) erforderlich" },
        { status: 400 }
      );
    }

    const result = deriveVisualKey({ size, cells, salt });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Generierung fehlgeschlagen";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
