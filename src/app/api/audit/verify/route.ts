import { NextResponse } from "next/server";
import { verifyChain } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ success: true, ...verifyChain() });
  } catch {
    return NextResponse.json(
      { success: false, error: "Integritätsprüfung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
