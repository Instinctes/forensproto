import { useState, useEffect, useCallback } from "react";

export interface LogEntry {
  seq: number;
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "danger";
  action: string;
  message: string;
  source: string;
  user: string;
  caseId?: string;
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  totalEntries: number;
  brokenAt?: { seq: number; id: string; reason: string };
}

/**
 * Serverseitiges, hash-verkettetes Audit-Log.
 * Liest und schreibt über /api/audit (append-only). Es gibt bewusst
 * KEINE Löschfunktion mehr – ein forensisches Protokoll ist unveränderlich.
 */
export function useAuditLog(pollMs = 0) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [verification, setVerification] = useState<ChainVerification | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      if (data.success) setLogs(data.logs as LogEntry[]);
    } catch {
      /* offline – bestehende Logs behalten */
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      const t = setInterval(refresh, pollMs);
      return () => clearInterval(t);
    }
  }, [refresh, pollMs]);

  const addLog = useCallback(
    async (log: {
      level: LogEntry["level"];
      action: string;
      message: string;
      source: string;
      user?: string;
      caseId?: string;
    }) => {
      try {
        await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(log),
        });
        await refresh();
      } catch {
        /* ignore */
      }
    },
    [refresh]
  );

  const verify = useCallback(async (): Promise<ChainVerification | null> => {
    try {
      const res = await fetch("/api/audit/verify");
      const data = (await res.json()) as ChainVerification & { success: boolean };
      if (data.success) {
        const v = { valid: data.valid, totalEntries: data.totalEntries, brokenAt: data.brokenAt };
        setVerification(v);
        return v;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  return { logs, addLog, verify, verification, refresh, isLoaded };
}
