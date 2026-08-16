/**
 * Module H API — Signatur-Analyse
 * POST: ECDSA-Signaturen analysieren
 */

import { NextRequest } from "next/server";
import { parseSignatureAuto, analyzeSignature, analyzeSignatures } from "@/lib/crypto-forensics/signature-analyzer";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Input: single signature or array
    const { signature, signatures } = body as {
      signature?: string;
      signatures?: string[];
    };

    if (!signature && (!signatures || signatures.length === 0)) {
      return Response.json(
        {
          success: false,
          error: "Bitte geben Sie eine Signatur (hex) oder ein Array von Signaturen an.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Längen-Begrenzung
    const maxSignatures = 100;
    const inputSigs = signatures || [signature!];
    if (inputSigs.length > maxSignatures) {
      return Response.json(
        {
          success: false,
          error: `Maximal ${maxSignatures} Signaturen pro Anfrage.`,
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Validierung: nur Hex-Zeichen erlaubt
    for (const sig of inputSigs) {
      if (!/^[0-9a-fA-F\s]+$/.test(sig)) {
        return Response.json(
          {
            success: false,
            error: `Ungültige Zeichen in Signatur. Nur Hex (0-9, a-f) erlaubt.`,
            warnings: [],
            analysisId: randomUUID(),
            timestamp: new Date().toISOString(),
            disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
          },
          { status: 400 }
        );
      }
    }

    const parsedSigs = inputSigs.map((s) => parseSignatureAuto(s.replace(/\s+/g, "")));

    const results = inputSigs.length === 1
      ? [analyzeSignature(parsedSigs[0])]
      : analyzeSignatures(parsedSigs);

    // Serialisierung: BigInt → String
    const serializable = results.map((r) => ({
      ...r,
      signature: {
        r: r.signature.r.toString(16).padStart(64, "0"),
        s: r.signature.s.toString(16).padStart(64, "0"),
        derEncoded: r.signature.derEncoded,
        rawHex: r.signature.rawHex,
      },
    }));

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
      analysisId: randomUUID(),
      warnings: results.flatMap((r) => r.patterns.map((p) => p.description)),
      data: serializable,
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
