/**
 * Module H API — Entropy-Analyse
 * POST: Statistische Analyse von Hex-Daten (Shannon, Chi², PRNG-Tests)
 */

import { NextRequest } from "next/server";
import { analyzeEntropy } from "@/lib/crypto-forensics/statistical-analyzer";
import { analyzePRNG } from "@/lib/crypto-forensics/prng-analyzer";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hexData } = body as { hexData?: string };

    if (!hexData || hexData.trim().length === 0) {
      return Response.json(
        {
          success: false,
          error: "Bitte geben Sie Hex-Daten zur Analyse an.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    const clean = hexData.replace(/\s+/g, "");

    // Validierung: nur Hex erlaubt
    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      return Response.json(
        {
          success: false,
          error: "Ungültige Zeichen. Nur Hex (0-9, a-f) erlaubt.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Mindestlänge: 32 Bytes (64 Hex)
    if (clean.length < 64) {
      return Response.json(
        {
          success: false,
          error: "Mindestens 32 Bytes (64 Hex-Zeichen) erforderlich.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Maximallänge: 100KB
    if (clean.length > 200000) {
      return Response.json(
        {
          success: false,
          error: "Maximale Datenmenge: 100KB (200.000 Hex-Zeichen).",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    const entropyResult = analyzeEntropy(clean);
    const prngResult = analyzePRNG(clean);

    const warnings: string[] = [];
    if (entropyResult.entropyLevel === "LOW") {
      warnings.push("Niedrige Entropie — Daten sind wahrscheinlich nicht zufällig.");
    }
    if (prngResult.weakPRNGSuspected) {
      warnings.push("Verdacht auf schwachen PRNG. Weitergehende Analyse empfohlen.");
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
      analysisId: randomUUID(),
      warnings,
      data: {
        entropy: {
          ...entropyResult,
          // Byte-Frequenz auf Top-10 beschränken für Response-Größe
          byteFrequencyTop10: entropyResult.byteFrequency
            .map((count, byte) => ({ byte, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
          byteFrequency: undefined,
        },
        prng: prngResult,
        dataSize: {
          bytes: clean.length / 2,
          bits: clean.length * 4,
        },
      },
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
