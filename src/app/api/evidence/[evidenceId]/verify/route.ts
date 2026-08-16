import { NextRequest, NextResponse } from "next/server";
import { getEvidence, verifyEvidence } from "@/lib/cases";
import { requirePermission, isAuthError } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * Lifecycle-Hash-Check: Soll-Ist-Abgleich gegen den registrierten SHA-256.
 * Wird eine Datei mitgeschickt, wird diese verifiziert (z.B. erneuter
 * Import derselben Asservat-Kopie von einem anderen Ort). Wird keine
 * Datei mitgeschickt, verifiziert die Route den intern im Evidence
 * Locker gespeicherten Blob gegen den registrierten Hash (Selbstprüfung
 * der Ablage) – vorausgesetzt, ein Blob wurde beim Import gespeichert.
 * Ergebnis wird als Chain-of-Custody-Ereignis protokolliert.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = requirePermission(request, "evidence:verify");
  if (isAuthError(auth)) return auth;

  const { evidenceId } = await context.params;
  const ev = getEvidence(evidenceId);
  if (!ev) return NextResponse.json({ success: false, error: "Asservat nicht gefunden" }, { status: 404 });

  try {
    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer | undefined;
    let actor = auth.username;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      actor = (formData.get("actor") as string) || auth.username;
      if (file) buffer = Buffer.from(await file.arrayBuffer());
    }

    const result = verifyEvidence(evidenceId, buffer, actor);
    if (result.source === "unavailable") {
      return NextResponse.json(
        { success: false, error: "Keine Datei übergeben und kein gespeicherter Evidence-Blob vorhanden.", ...result },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ success: false, error: "Verifikation fehlgeschlagen" }, { status: 500 });
  }
}
