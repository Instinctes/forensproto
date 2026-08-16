import { NextRequest, NextResponse } from "next/server";
import { createCase, getAllCases } from "@/lib/cases";
import { requirePermission, isAuthError } from "@/lib/auth/context";
import { scopeToTenant } from "@/lib/auth/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requirePermission(request, "case:view");
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ success: true, cases: scopeToTenant(getAllCases(), auth.tenantId) });
  } catch {
    return NextResponse.json({ success: false, error: "Fälle konnten nicht geladen werden" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "case:create");
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ success: false, error: "Fallname ist erforderlich" }, { status: 400 });
    }
    const rec = createCase({
      name: body.name,
      description: body.description,
      investigator: body.investigator || auth.username,
      caseNumber: body.caseNumber,
      tenantId: auth.tenantId,
      kind: body.kind === "inheritance" ? "inheritance" : "standard",
      beneficiary: body.beneficiary,
    });
    return NextResponse.json({ success: true, case: rec });
  } catch {
    return NextResponse.json({ success: false, error: "Fall konnte nicht erstellt werden" }, { status: 500 });
  }
}
