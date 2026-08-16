import { NextRequest, NextResponse } from "next/server";
import { resumeHashcatJob } from "@/lib/hashcat-manager";
import { getJob } from "@/lib/job-store";

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job nicht gefunden" }, { status: 404 });
  }
  if (job.status === "running") {
    return NextResponse.json({ error: "Job läuft bereits" }, { status: 400 });
  }
  if (job.status === "completed") {
    return NextResponse.json({ error: "Job ist bereits abgeschlossen" }, { status: 400 });
  }

  const result = await resumeHashcatJob(jobId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, status: "running" });
}
