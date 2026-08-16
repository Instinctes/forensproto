/**
 * Module H API — Nonce-Scan
 * POST: Multiple Signaturen auf Nonce-Reuse prüfen
 */

import { NextRequest } from "next/server";
import { parseSignatureAuto } from "@/lib/crypto-forensics/signature-analyzer";
import { analyzeNonces } from "@/lib/crypto-forensics/nonce-analyzer";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signatures, zValues } = body as { signatures?: string[]; zValues?: string[] };

    if (!signatures || !Array.isArray(signatures) || signatures.length < 2) {
      return Response.json(
        {
          success: false,
          error: "Mindestens 2 Signaturen (Hex-Array) für Nonce-Analyse erforderlich.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    if (signatures.length > 500) {
      return Response.json(
        {
          success: false,
          error: "Maximal 500 Signaturen pro Anfrage.",
          warnings: [],
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Validierung und Parsing — z-Werte synchron mitführen
    const errors: string[] = [];
    const parsedSigs = [];
    const alignedZValues: (string | null)[] = [];

    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      if (!/^[0-9a-fA-F\s]+$/.test(sig)) {
        errors.push(`Signatur #${i + 1}: Ungültige Hex-Zeichen`);
        continue; // z-Wert für diese Signatur wird NICHT übernommen
      }
      try {
        parsedSigs.push(parseSignatureAuto(sig.replace(/\s+/g, "")));
        // Korrespondierenden z-Wert synchron einfügen (null wenn nicht vorhanden)
        const z = Array.isArray(zValues) && zValues[i] ? zValues[i].replace(/\s+/g, "") : null;
        alignedZValues.push(z);
      } catch (err) {
        errors.push(
          `Signatur #${i + 1}: ${err instanceof Error ? err.message : "Parse-Fehler"}`
        );
        // z-Wert dieser Signatur überspringen
      }
    }

    if (parsedSigs.length < 2) {
      return Response.json(
        {
          success: false,
          error: "Weniger als 2 Signaturen konnten geparst werden.",
          warnings: errors,
          analysisId: randomUUID(),
          timestamp: new Date().toISOString(),
          disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
        },
        { status: 400 }
      );
    }

    // Nur definierte z-Werte übergeben (null → undefined für analyzeNonces)
    const filteredZ = alignedZValues.map((z) => z ?? "");
    const hasAnyZ = filteredZ.some((z) => z.length > 0);

    const result = analyzeNonces(parsedSigs, hasAnyZ ? filteredZ : undefined);

    const warnings = [...errors];
    if (result.riskLevel === "CRITICAL") {
      const keyRecovered = result.reusedNonces.some((g) => g.extractedPrivateKey);
      warnings.unshift(
        keyRecovered
          ? "🔓 KRITISCH: Nonce-Wiederverwendung detektiert und Private Key erfolgreich extrahiert! " +
              "Der Schlüssel ist vollständig kompromittiert."
          : "⚠️ KRITISCH: Nonce-Wiederverwendung detektiert! " +
              "Für vollständige Key-Recovery z-Werte (SHA256d Transaktionshashes) eingeben."
      );
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      disclaimer: "FORENSISCHER HINWEIS — Nur für autorisierte Analyse",
      analysisId: randomUUID(),
      warnings,
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
