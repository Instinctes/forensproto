"use client";

import { useState, useEffect, useCallback } from "react";
import { Server, Cloud } from "lucide-react";

interface AgentRow {
  id: string;
  name: string;
  gpu: string;
  benchmarkHps: number;
  status: string;
  online: boolean;
  lastSeen: number;
}

/** Übersicht registrierter Remote-/Cloud-Recovery-Agenten. */
export default function AgentsPanel() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [mode, setMode] = useState("local");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agents").then((x) => x.json());
      if (r.success) {
        setAgents(r.agents);
        setMode(r.mode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const fmtHps = (v: number) => (v > 1e6 ? `${(v / 1e6).toFixed(1)} MH/s` : v > 1e3 ? `${(v / 1e3).toFixed(1)} kH/s` : `${v} H/s`);

  return (
    <div className="card" style={{ padding: "var(--space-lg)", marginTop: "var(--space-xl)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Cloud size={16} /> Remote-/Cloud-Agenten ({agents.filter((a) => a.online).length} online)
        </h3>
        <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "4px 10px", borderRadius: "var(--radius-full)", background: mode === "agents" ? "rgba(16,185,129,0.1)" : "var(--bg-secondary)", color: mode === "agents" ? "var(--success-400)" : "var(--text-tertiary)" }}>
          Modus: {mode === "agents" ? "verteilt (Agenten)" : "lokal"}
        </span>
      </div>

      {agents.length === 0 ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
          Keine Agenten registriert. Starte auf einer Remote-/Cloud-GPU:{" "}
          <code style={{ fontSize: "0.75rem" }}>python3 scripts/forensproto-agent.py --server http://DEIN_HOST:3000</code>
          {mode !== "agents" && <> · Server im Agenten-Modus starten: <code style={{ fontSize: "0.75rem" }}>FORENSPROTO_EXECUTION_MODE=agents</code></>}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {agents.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
              <Server size={15} style={{ color: a.online ? "var(--success-400)" : "var(--text-muted)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{a.name} <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>· {a.gpu}</span></div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{fmtHps(a.benchmarkHps)} · {a.status}</div>
              </div>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: a.online ? "var(--success-400)" : "var(--text-muted)" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
