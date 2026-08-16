import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  
  const job = getJob(jobId);
  if (!job) {
     return NextResponse.json({ error: "Job nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json(job);
}
