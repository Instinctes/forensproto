import { useEffect, useState, useRef, useCallback } from "react";
import { Job } from "@/lib/job-store";

export function useActiveJobs(pollInterval = 2000) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sseRefs = useRef<Map<string, EventSource>>(new Map());

  // Close all SSE connections
  const closeAllSSE = useCallback(() => {
    sseRefs.current.forEach((es) => es.close());
    sseRefs.current.clear();
  }, []);

  // Open SSE stream for a specific running job
  const openSSE = useCallback((jobId: string) => {
    if (sseRefs.current.has(jobId)) return; // Already connected

    try {
      const es = new EventSource(`/api/recovery/stream/${jobId}`);
      
      es.onmessage = (event) => {
        try {
          const jobData = JSON.parse(event.data);
          if (jobData.error) {
            es.close();
            sseRefs.current.delete(jobId);
            return;
          }
          // Merge SSE data into jobs state
          setJobs((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, ...jobData } : j))
          );
          // Auto-close when job is done
          if (["completed", "failed", "stopped"].includes(jobData.status)) {
            es.close();
            sseRefs.current.delete(jobId);
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        sseRefs.current.delete(jobId);
      };

      sseRefs.current.set(jobId, es);
    } catch {
      // EventSource not supported or connection failed — rely on polling
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchJobs() {
      try {
        const res = await fetch("/api/recovery/jobs");
        if (!res.ok) throw new Error("Failed to fetch jobs");
        const data = await res.json();
        
        if (isMounted) {
            const fetchedJobs: Job[] = data.jobs || [];
            setJobs(fetchedJobs);
            setInitialLoad(false);

            // Open SSE for running jobs that don't have a connection yet
            const runningIds = new Set(
              fetchedJobs.filter((j) => j.status === "running").map((j) => j.id)
            );

            // Open new SSE connections for newly running jobs
            runningIds.forEach((id) => openSSE(id));

            // Close SSE for jobs that are no longer running
            sseRefs.current.forEach((es, id) => {
              if (!runningIds.has(id)) {
                es.close();
                sseRefs.current.delete(id);
              }
            });
        }
      } catch (err) {
        console.error("Job Polling Error", err);
      } finally {
        if (isMounted) {
            timeoutRef.current = setTimeout(fetchJobs, pollInterval);
        }
      }
    }

    fetchJobs();

    return () => {
      isMounted = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      closeAllSSE();
    };
  }, [pollInterval, openSSE, closeAllSSE]);

  const stopJob = async (jobId: string) => {
    try {
      await fetch(`/api/recovery/stop/${jobId}`, { method: "POST" });
      // Close SSE for this job
      const es = sseRefs.current.get(jobId);
      if (es) { es.close(); sseRefs.current.delete(jobId); }
      // Optimistic update
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: "stopped", speed: 0 } : j));
    } catch (e) {
      console.error("Failed to stop job", e);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      await fetch("/api/recovery/delete", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }) 
      });
      // Close SSE for this job
      const es = sseRefs.current.get(jobId);
      if (es) { es.close(); sseRefs.current.delete(jobId); }
      // Optimistic update
      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch (e) {
      console.error("Failed to delete job", e);
    }
  };

  const resumeJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/recovery/resume/${jobId}`, { method: "POST" });
      if (res.ok) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: "running", error: undefined } : j)));
        openSSE(jobId);
      }
    } catch (e) {
      console.error("Failed to resume job", e);
    }
  };

  return { jobs, initialLoad, stopJob, deleteJob, resumeJob };
}

