/**
 * Module H API — Key-Analyse
 * POST: Public/Private Key Struktur analysieren
 */

import { NextRequest } from "next/server";
import { analyzeKeyStructure } from "@/lib/crypto-forensics/key-structure-analyzer";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = body as { key?: string };

    if (!key || key.trim().length === 0) {
      return Response.json(
        {
          success: false,
          error: "Bitte geben Sie einen Key (WIF, Hex, xprv/xpub) an.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Input-Begrenzung
    if (key.length > 500) {
      return Response.json(
        {
          success: false,
          error: "Key-Input zu lang. Maximal 500 Zeichen.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    const result = analyzeKeyStructure(key.trim());

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
      analysisId: randomUUID(),
      warnings: result.securityNotes,
      data: result,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
        warnings: [],
        analysisId: randomUUID(),
        timestamp: new Date().toISOString(),
        disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
      },
      { status: 500 }
    );
  }
}
