import { NextRequest, NextResponse } from "next/server";
import { stopHashcatJob } from "@/lib/hashcat-manager";
import { getJob } from "@/lib/job-store";

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  const job = getJob(jobId);
  if (!job) {
     return NextResponse.json({ error: "Job nicht gefunden" }, { status: 404 });
  }
  
  if (job.status !== "running") {
     return NextResponse.json({ error: `Job läuft nicht. Status: ${job.status}` }, { status: 400 });
  }

  await stopHashcatJob(jobId);
  return NextResponse.json({ success: true, status: "stopped" });
}
