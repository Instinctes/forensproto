import { NextRequest, NextResponse } from "next/server";
import { listRuleFiles, saveRuleFile } from "@/lib/rules-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ success: true, rules: await listRuleFiles() });
  } catch {
    return NextResponse.json({ success: false, error: "Regeldateien konnten nicht gelesen werden" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || !Array.isArray(body.rules)) {
      return NextResponse.json({ success: false, error: "name und rules[] erforderlich" }, { status: 400 });
    }
    const result = await saveRuleFile(body.name, body.rules);
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, name: result.name, ruleCount: result.ruleCount });
  } catch {
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }
}
