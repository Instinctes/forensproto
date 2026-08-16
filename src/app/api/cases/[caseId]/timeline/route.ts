import { NextRequest, NextResponse } from "next/server";
import { getCase } from "@/lib/cases";
import { buildTimeline, timelineToCsv } from "@/lib/report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  if (!getCase(caseId)) return NextResponse.json({ success: false, error: "Fall nicht gefunden" }, { status: 404 });

  const format = request.nextUrl.searchParams.get("format") || "json";
  const timeline = buildTimeline(caseId);

  if (format === "csv") {
    return new NextResponse(timelineToCsv(timeline), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="forensproto_timeline_${caseId}.csv"`,
      },
    });
  }
  return NextResponse.json({ success: true, timeline });
}
