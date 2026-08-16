import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog, getAuditLogs, type LogLevel, type NewLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const caseId = sp.get("caseId") || undefined;
    const limitRaw = sp.get("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const logs = getAuditLogs({ caseId, limit });
    return NextResponse.json({ success: true, logs });
  } catch {
    return NextResponse.json({ success: false, error: "Audit-Log konnte nicht gelesen werden" }, { status: 500 });
  }
}

const VALID_LEVELS: LogLevel[] = ["info", "success", "warning", "error", "danger"];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<NewLog>;
    if (!body.action || !body.message || !body.source) {
      return NextResponse.json(
        { success: false, error: "action, message und source sind erforderlich" },
        { status: 400 }
      );
    }
    const level: LogLevel = VALID_LEVELS.includes(body.level as LogLevel)
      ? (body.level as LogLevel)
      : "info";

    const entry = appendAuditLog({
      level,
      action: body.action,
      message: body.message,
      source: body.source,
      user: body.user,
      caseId: body.caseId,
    });
    return NextResponse.json({ success: true, entry });
  } catch {
    return NextResponse.json({ success: false, error: "Eintrag konnte nicht erstellt werden" }, { status: 500 });
  }
}
