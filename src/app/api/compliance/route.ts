import { NextRequest, NextResponse } from "next/server";
import { getComplianceStatus, applyRetention } from "@/lib/compliance";
import { requirePermission, isAuthError } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, ...getComplianceStatus() });
}

/** Wendet die Aufbewahrungsrichtlinie an (Admin). */
export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "admin:system");
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ success: true, ...applyRetention() });
}
