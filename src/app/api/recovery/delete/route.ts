import { NextRequest, NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/job-store";
import { appendAuditLog } from "@/lib/audit-log";
import { requirePermission, isAuthError } from "@/lib/auth/context";

export async function POST(request: NextRequest) {
  const auth = requirePermission(request, "recovery:delete");
  if (isAuthError(auth)) return auth;
  try {
    const { jobId } = await request.json();
    
    if (!jobId) {
      return NextResponse.json({ error: "Fehlende Job ID" }, { status: 400 });
    }
    
    const job = getJob(jobId);
    if (!job) {
       return NextResponse.json({ error: "Job nicht gefunden" }, { status: 404 });
    }
    
    if (job.status === "starting" || job.status === "running") {
       return NextResponse.json({ error: "Aktive Jobs müssen erst gestoppt werden" }, { status: 400 });
    }

    deleteJob(jobId);

    appendAuditLog({
      level: "warning",
      action: "Recovery-Job gelöscht",
      message: `Job ${jobId} (${job.walletName}) wurde entfernt`,
      source: "recovery/delete",
      caseId: job.caseId,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Delete Error", error);
    return NextResponse.json(
      { error: "Konnte Job nicht löschen." },
      { status: 500 }
    );
  }
}
