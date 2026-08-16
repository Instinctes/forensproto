import { NextRequest, NextResponse } from "next/server";
import { addEvidence, getEvidenceForCase, getCase } from "@/lib/cases";
import { requirePermission, isAuthError } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;

  const caseId = request.nextUrl.searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ success: false, error: "caseId erforderlich" }, { status: 400 });
  return NextResponse.json({ success: true, evidence: getEvidenceForCase(caseId) });
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "evidence:import");
  if (isAuthError(auth)) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const caseId = formData.get("caseId") as string | null;
    const source = (formData.get("source") as string) || "Upload";
    const notes = (formData.get("notes") as string) || "";
    const actor = (formData.get("actor") as string) || auth.username;

    if (!file) return NextResponse.json({ success: false, error: "Keine Datei übergeben" }, { status: 400 });
    if (!caseId) return NextResponse.json({ success: false, error: "caseId erforderlich" }, { status: 400 });
    if (!getCase(caseId)) return NextResponse.json({ success: false, error: "Fall nicht gefunden" }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const rec = addEvidence({
      caseId,
      fileName: file.name || "evidence.bin",
      buffer,
      source,
      notes,
      actor,
    });
    return NextResponse.json({ success: true, evidence: rec });
  } catch (e) {
    console.error("Evidence import error:", e);
    return NextResponse.json({ success: false, error: "Import fehlgeschlagen" }, { status: 500 });
  }
}
