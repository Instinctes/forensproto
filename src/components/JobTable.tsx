"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, AlertCircle, Key, Activity, Check, Trash2, Loader2, Download, FileKey } from "lucide-react";
import { useActiveJobs } from "@/hooks/useActiveJobs";
import { useI18n } from "@/context/I18nContext";
import type { Job, JobStatus } from "@/lib/job-store";
import { estimateEnergy } from "@/lib/energy";

function exportDigest(job: Job) {
  const digest = {
    v: 1,
    exportedAt: new Date().toISOString(),
    walletName: job.walletName,
    walletType: job.walletType,
    hashcatMode: job.hashcatMode,
    attackMode: job.attackMode,
    method: job.method,
    hashString: job.hashString,
    wordlist: job.wordlist,
    mask: job.mask,
    ruleFiles: job.ruleFiles,
  };
  const blob = new Blob([JSON.stringify(digest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `forensproto_digest_${job.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Übersetzt bekannte, serverseitig erzeugte Job-Fehlermeldungen; unbekannte bleiben unverändert.
function translateJobError(err: string, t: (k: string) => string): string {
  const e = err.trim();
  if (/^Keyspace ersch[oö]pft/i.test(e)) return t("jobErr.keyspaceExhausted");
  if (/^Chunk ersch[oö]pft/i.test(e)) return t("jobErr.chunkExhausted");
  return err;
}

function formatTime(seconds: number) {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatSpeed(speed: number) {
  if (!speed) return "0 H/s";
  if (speed > 1e9) return `${(speed / 1e9).toFixed(1)} GH/s`;
  if (speed > 1e6) return `${(speed / 1e6).toFixed(1)} MH/s`;
  if (speed > 1e3) return `${(speed / 1e3).toFixed(1)} kH/s`;
  return `${speed} H/s`;
}

const STATUS: Record<JobStatus, { label: string; color: string; bg: string }> = {
  running: { label: "Läuft", color: "var(--success-400)", bg: "rgba(16,185,129,0.12)" },
  queued: { label: "Wartet", color: "var(--text-tertiary)", bg: "var(--bg-secondary)" },
  starting: { label: "Startet", color: "var(--primary-400)", bg: "rgba(6,182,212,0.12)" },
  paused: { label: "Pausiert", color: "var(--warning-400)", bg: "rgba(245,158,11,0.12)" },
  stopped: { label: "Gestoppt", color: "var(--warning-400)", bg: "rgba(245,158,11,0.12)" },
  failed: { label: "Fehlgeschlagen", color: "var(--danger-400)", bg: "rgba(239,68,68,0.12)" },
  completed: { label: "Geknackt", color: "var(--success-400)", bg: "rgba(16,185,129,0.12)" },
};

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        {label}
      </span>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

export default function JobTable() {
  const { jobs, initialLoad, stopJob, deleteJob, resumeJob } = useActiveJobs(2000);
  const { t } = useI18n();

  if (initialLoad) {
    return (
      <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
        <Loader2 size={16} className="animate-spin" /> {t("job.loading")}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
        {t("job.empty")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <AnimatePresence>
        {jobs.map((job) => {
          const st = STATUS[job.status] || STATUS.queued;
          const isRecovered = !!job.recoveredPassword;
          const accent = isRecovered ? STATUS.completed.color : st.color;
          return (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="card"
              style={{ padding: "var(--space-lg)", borderLeft: `3px solid ${accent}`, display: "flex", flexDirection: "column", gap: "var(--space-md)" }}
            >
              {/* Kopfzeile: Status · Wallet · Aktionen */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px",
                      borderRadius: "var(--radius-full)", fontSize: "0.6875rem", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.04em", background: st.bg, color: st.color, flexShrink: 0,
                    }}
                  >
                    {job.status === "running" && <Activity size={12} className="animate-pulse" />}
                    {job.status === "completed" && <Check size={12} />}
                    {job.status === "failed" && <AlertCircle size={12} />}
                    {(job.status === "stopped" || job.status === "paused") && <Square size={11} />}
                    {(job.status === "starting" || job.status === "queued") && <Loader2 size={12} className={job.status === "starting" ? "animate-spin" : undefined} />}
                    {isRecovered ? t("job.cracked") : t(`job.status.${job.status}`)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.walletName}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {job.walletType} · {job.method}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <button onClick={() => exportDigest(job)} className="header-btn" title={t("job.btn.export")}>
                    <Download size={16} />
                  </button>
                  {job.status === "running" && (
                    <button onClick={() => stopJob(job.id)} className="header-btn" title={t("job.btn.stop")}>
                      <Square size={16} />
                    </button>
                  )}
                  {(job.status === "stopped" || job.status === "failed") && (
                    <button onClick={() => resumeJob(job.id)} className="header-btn" title={t("job.btn.resume")}>
                      <Play size={16} />
                    </button>
                  )}
                  {(job.status === "stopped" || job.status === "failed" || job.status === "completed") && (
                    <button onClick={() => deleteJob(job.id)} className="header-btn" title={t("job.btn.delete")} style={{ color: "var(--danger-400)" }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Ergebnis / Fehler / Live-Kacheln */}
              {isRecovered ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div
                    className="mono"
                    style={{
                      background: "rgba(16,185,129,0.12)", color: "var(--success-300)", padding: "10px 14px",
                      borderRadius: "var(--radius-md)", fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px",
                    }}
                  >
                    <Key size={16} /> {t("job.password")}: {job.recoveredPassword}
                  </div>
                  {job.dumpAvailable && (
                    <a
                      href={`/api/recovery/${job.id}/dump`}
                      className="btn btn-secondary"
                      style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", padding: "6px 12px" }}
                    >
                      <FileKey size={14} /> {t("job.dump")}
                    </a>
                  )}
                </div>
              ) : job.error ? (
                <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem", background: "rgba(239,68,68,0.08)", padding: "10px 14px", borderRadius: "var(--radius-md)" }}>
                  {translateJobError(job.error, t)}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                  <Tile label={t("job.tile.progress")}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div className="progress-bar-container" style={{ flex: 1, minWidth: "60px", height: "6px" }}>
                        <div style={{ height: "100%", width: `${job.progress}%`, borderRadius: "var(--radius-full)", background: accent, transition: "width 1s ease" }} />
                      </div>
                      <span className="mono" style={{ fontSize: "0.8125rem" }}>{job.progress.toFixed(1)}%</span>
                    </div>
                  </Tile>
                  <Tile label={t("job.tile.speed")}>
                    <span className="mono">{formatSpeed(job.speed)}</span>
                  </Tile>
                  <Tile label={t("job.tile.eta")}>
                    <span className="mono" style={{ color: job.eta > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>{formatTime(job.eta)}</span>
                  </Tile>
                  <Tile label={t("job.tile.util")}>
                    <span className="mono">{job.utilization && job.utilization > 0 ? `${job.utilization}%` : "n/a"}</span>
                  </Tile>
                  <Tile label={t("job.tile.temp")}>
                    <span className="mono" style={{ color: job.temperature > 80 ? "var(--danger-400)" : "var(--text-primary)" }}>
                      {job.temperature > 0 ? `${job.temperature}°C` : "n/a"}
                    </span>
                  </Tile>
                  <Tile label={t("job.tile.energy")}>
                    <span className="mono" style={{ fontSize: "0.75rem" }}>
                      {estimateEnergy({ elapsedSec: ((job.endTime || Date.now()) - job.startTime) / 1000 }).human}
                    </span>
                  </Tile>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
