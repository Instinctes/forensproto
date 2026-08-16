"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  Clock,
} from "lucide-react";
import Header from "@/components/Header";
import { useAuditLog } from "@/hooks/useAuditLog";

const LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  info: { color: "var(--primary-400)", bg: "rgba(var(--primary-rgb), 0.08)", icon: <Info size={14} />, label: "Info" },
  success: { color: "var(--success-400)", bg: "rgba(34,197,94,0.08)", icon: <CheckCircle2 size={14} />, label: "Erfolg" },
  warning: { color: "var(--warning-400)", bg: "rgba(245,158,11,0.08)", icon: <AlertTriangle size={14} />, label: "Warnung" },
  error: { color: "var(--danger-400)", bg: "rgba(239,68,68,0.08)", icon: <XCircle size={14} />, label: "Fehler" },
  danger: { color: "var(--danger-400)", bg: "rgba(239,68,68,0.08)", icon: <XCircle size={14} />, label: "Kritisch" },
};

export default function AuditLogPage() {
  const { logs, verify, verification, isLoaded } = useAuditLog(5000);
  const [verifying, setVerifying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const runVerify = async () => {
    setVerifying(true);
    await verify();
    setVerifying(false);
  };
  const [levelFilter, setLevelFilter] = useState<string>("all");

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = searchQuery === "" ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = levelFilter === "all" || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const exportLogs = () => {
    const csv = [
      "Timestamp,Level,Action,Message,Source,User,Hash",
      ...logs.map((l) => `"${l.timestamp}","${l.level}","${l.action}","${l.message}","${l.source}","${l.user}","${l.hash}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forensproto_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch { return ts; }
  };

  if (!isLoaded) return <div className="page-container"><Header title="Audit Log" subtitle="Lade..." /></div>;

  return (
    <div className="page-container">
      <Header
        title="Forensischer Audit-Trail"
        subtitle={`${logs.length} Einträge — serverseitig, append-only, SHA-256 Hash-Chain`}
      />

      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* Controls */}
          <div className="card" style={{ padding: "var(--space-lg)", display: "flex", gap: "var(--space-md)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
              <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
              <input
                type="text"
                className="af-input"
                placeholder="Logs durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "36px", fontSize: "0.875rem" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Filter size={14} style={{ color: "var(--text-tertiary)" }} />
              {["all", "info", "success", "warning", "error"].map((lvl) => (
                <button key={lvl} onClick={() => setLevelFilter(lvl)}
                  style={{
                    padding: "4px 12px", borderRadius: "var(--radius-full)", fontSize: "0.6875rem",
                    fontWeight: 600, border: "1px solid var(--border-subtle)", cursor: "pointer",
                    background: levelFilter === lvl ? "rgba(var(--primary-rgb), 0.1)" : "transparent",
                    color: levelFilter === lvl ? "var(--primary-400)" : "var(--text-secondary)",
                  }}>
                  {lvl === "all" ? "Alle" : LEVEL_CONFIG[lvl]?.label || lvl}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
              {verification && (
                <span
                  style={{
                    display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px",
                    borderRadius: "var(--radius-full)", fontSize: "0.6875rem", fontWeight: 700,
                    background: verification.valid ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    color: verification.valid ? "var(--success-400)" : "var(--danger-400)",
                  }}
                  title={
                    verification.valid
                      ? `Kette intakt (${verification.totalEntries} Einträge)`
                      : `Bruch bei Eintrag #${verification.brokenAt?.seq}: ${verification.brokenAt?.reason}`
                  }
                >
                  {verification.valid ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                  {verification.valid ? "Kette intakt" : "Manipulation erkannt"}
                </span>
              )}
              <button className="btn btn-secondary" onClick={runVerify} disabled={verifying}
                style={{ padding: "6px 14px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                <Shield size={14} /> {verifying ? "Prüfe…" : "Integrität prüfen"}
              </button>
              <button className="btn btn-secondary" onClick={exportLogs} disabled={logs.length === 0}
                style={{ padding: "6px 14px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                <Download size={14} /> CSV Export
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "var(--space-md)" }}>
            {["info", "success", "warning", "error", "danger"].map((lvl) => {
              const cfg = LEVEL_CONFIG[lvl];
              const count = logs.filter((l) => l.level === lvl).length;
              return (
                <div key={lvl} className="card" style={{ padding: "var(--space-md)", display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color }}>
                    {cfg.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>{count}</div>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{cfg.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Log Entries */}
          <AnimatePresence>
            {filteredLogs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {filteredLogs.map((log, i) => {
                  const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                  return (
                    <motion.div key={log.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.5) }}
                      className="card" style={{ padding: "var(--space-sm) var(--space-lg)", borderLeft: `3px solid ${cfg.color}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                        <div style={{ color: cfg.color, flexShrink: 0 }}>{cfg.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{log.action}</span>
                            <span style={{ padding: "1px 6px", borderRadius: "var(--radius-full)", background: cfg.bg, color: cfg.color, fontSize: "0.5625rem", fontWeight: 700 }}>{cfg.label}</span>
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{log.source}</span>
                          </div>
                          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>{log.message}</p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Clock size={10} /> {formatTimestamp(log.timestamp)}
                          </div>
                          <div style={{ fontSize: "0.5rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                            {log.hash.slice(0, 16)}...
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="card" style={{ padding: "var(--space-2xl)", textAlign: "center" }}>
                <Shield size={48} style={{ color: "var(--text-muted)", margin: "0 auto var(--space-md)", opacity: 0.3 }} />
                <p style={{ color: "var(--text-tertiary)", fontSize: "0.9375rem" }}>
                  {logs.length === 0 ? "Noch keine forensischen Aktionen protokolliert." : "Keine Einträge für den aktuellen Filter."}
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.main>
    </div>
  );
}
