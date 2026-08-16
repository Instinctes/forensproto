import { NextRequest } from "next/server";
import { getJob } from "@/lib/job-store";

// Vercel / Next.js Edge function konfiguration für langlebige SSE connections
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      // Puse interval für Hashcat
      const interval = setInterval(() => {
        if (isClosed) return;

        const job = getJob(jobId);
        
        if (job) {
          // Push job data
          const dataPayload = `data: ${JSON.stringify(job)}\n\n`;
          controller.enqueue(new TextEncoder().encode(dataPayload));

          // Beende Stream wenn Job fertig oder abgebrochen
          if (["completed", "failed", "stopped"].includes(job.status)) {
            isClosed = true;
            clearInterval(interval);
            try { controller.close(); } catch {}
          }
        } else {
          // Job existiert nicht (mehr)
          controller.enqueue(new TextEncoder().encode(`data: {"error": "Job not found"}\n\n`));
          isClosed = true;
          clearInterval(interval);
          try { controller.close(); } catch {}
        }
      }, 1000); // 1 Sekunde Interval für UI Reactivity

      // Handle client disconnect gracefully
      request.signal.addEventListener("abort", () => {
         isClosed = true;
         clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}
