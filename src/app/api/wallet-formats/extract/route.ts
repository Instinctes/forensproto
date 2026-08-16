import { NextRequest, NextResponse } from "next/server";
import { analyzeWalletFormat } from "@/lib/wallet-formats";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * Erkennt erweiterte Wallet-Formate (ETH Keystore, MetaMask, Electrum)
 * und liefert – wenn möglich – den Hashcat-Hash + Modus.
 * Akzeptiert Roh-Text (JSON-Body {content}) oder Datei-Upload (multipart).
 */
export async function POST(request: NextRequest) {
  try {
    let content = "";
    const ctype = request.headers.get("content-type") || "";
    if (ctype.includes("multipart/form-data")) {
      const fd = await request.formData();
      const file = fd.get("file") as File | null;
      if (file) content = await file.text();
    } else {
      const body = await request.json().catch(() => ({}));
      content = String(body.content || "");
    }

    if (!content.trim()) {
      return NextResponse.json({ success: false, error: "Kein Inhalt übergeben" }, { status: 400 });
    }

    const result = analyzeWalletFormat(content);
    appendAuditLog({
      level: result.hash ? "success" : "info",
      action: "Wallet-Format analysiert",
      message: `${result.format}${result.hashcatMode ? ` (Modus ${result.hashcatMode})` : ""}${result.hash ? " — Hash extrahiert" : ""}`,
      source: "wallet-formats/extract",
    });
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ success: false, error: "Analyse fehlgeschlagen" }, { status: 500 });
  }
}
