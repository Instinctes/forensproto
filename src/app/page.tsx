/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { Activity, CheckCircle2, Cpu, ScrollText, Zap, Upload, Loader2, ArrowRight, Clock, Gauge, Thermometer, HardDrive, Database, Plus, X, Settings } from "lucide-react";
import Header from "@/components/Header";
import SetupBanner from "@/components/SetupBanner";
import KPICard from "@/components/KPICard";
import JobTable from "@/components/JobTable";
import ActivityChart from "@/components/ActivityChart";
import GPUMonitor from "@/components/GPUMonitor";
import RecentResults from "@/components/RecentResults";
import { useI18n } from "@/context/I18nContext";
import { useActiveJobs } from "@/hooks/useActiveJobs";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";


function formatSpeed(speed: number) {
  if (speed === 0) return "0 H/s";
  if (speed > 1000000000) return `${(speed / 1000000000).toFixed(1)} GH/s`;
  if (speed > 1000000) return `${(speed / 1000000).toFixed(1)} MH/s`;
  if (speed > 1000) return `${(speed / 1000).toFixed(1)} kH/s`;
  return `${speed} H/s`;
}

const TILES_STORAGE_KEY = "af_dashboard_tiles";
const DEFAULT_TILES = ["active_jobs", "global_speed", "utilization", "eta", "gpu_temp", "found"];

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { jobs } = useActiveJobs(2000);

  const activeJobsCount = jobs.filter(j => j.status === "running").length;

  const [systemData, setSystemData] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [activity, setActivity] = useState<{ time: string; hps: number; util: number }[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);

  // Quick-Drop States
  const [isDragging, setIsDragging] = useState(false);
  const [quickUploadStatus, setQuickUploadStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [quickUploadResult, setQuickUploadResult] = useState<string | null>(null);
  const quickFileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportDigest = useCallback(async (file: File) => {
    try {
      const digest = JSON.parse(await file.text());
      const res = await fetch("/api/recovery/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Import fehlgeschlagen");
      }
    } catch (err) {
      console.error("Digest-Import:", err);
    }
  }, []);

  const handleQuickDrop = useCallback(async (file: File) => {
    setQuickUploadStatus("uploading");
    setQuickUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen");

      const typeLabel = data.walletType === "bitcoin_core" ? "Bitcoin Wallet"
        : data.walletType === "ethereum_keystore" ? "Ethereum Keystore"
        : data.format || "Datei";

      setQuickUploadResult(typeLabel);
      setQuickUploadStatus("done");

      // Auto-redirect to recovery after 1.5s
      setTimeout(() => {
        const query = new URLSearchParams({
          jobId: data.jobId,
          filePath: data.filePath,
          walletType: data.walletType,
          filename: file.name,
          quickStart: "true"
        }).toString();
        router.push(`/recovery?${query}`);
      }, 1500);
    } catch (err: any) {
      setQuickUploadStatus("idle");
      setQuickUploadResult(err.message || "Fehler beim Upload");
      // Reset after 3s so user can try again
      setTimeout(() => setQuickUploadResult(null), 3000);
    }
  }, [router]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleQuickDrop(file);
  }, [handleQuickDrop]);

  // Load Timeline Events
  useEffect(() => {
    try {
      const saved = localStorage.getItem("af_timeline_events");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setTimelineEvents(JSON.parse(saved).slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  // Fetch true hardware topology
  useEffect(() => {
    fetch("/api/system")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
           setSystemData(data);
        }
      })
      .catch(console.error);
  }, []);
  
  const { totalSpeed, maxGpuTemp, jobUtil, runningEta } = useMemo(() => {
    let speed = 0;
    let temp = 0;
    let util = 0;
    let eta = 0;
    jobs.forEach((j) => {
      if (j.status === "running") {
        speed += j.speed;
        if (j.temperature > temp) temp = j.temperature;
        if ((j.utilization || 0) > util) util = j.utilization || 0;
        if (j.eta > 0 && (eta === 0 || j.eta < eta)) eta = j.eta;
      }
    });
    return { totalSpeed: speed, maxGpuTemp: temp, jobUtil: util, runningEta: eta };
  }, [jobs]);

  // Live-Hardware-Telemetrie pollen (echte Werte via systeminformation)
  useEffect(() => {
    let mounted = true;
    const poll = () => {
      fetch("/api/system/live")
        .then((r) => r.json())
        .then((d) => { if (mounted && d.success) setLive(d); })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  // Effektive, echte Kennzahlen – kein erfundener Fallback mehr
  const cpuLoad: number | null = live?.cpu?.loadPct ?? null;
  const cpuTemp: number | null = live?.cpu?.tempC ?? null;
  const gpuTemp: number | null = maxGpuTemp > 0 ? maxGpuTemp : (live?.gpu?.tempC ?? null);
  const utilization: number = jobUtil > 0 ? jobUtil : (live?.gpu?.utilPct ?? cpuLoad ?? 0);
  const ramUsed: number | null = live?.ram?.usedGB ?? null;
  const ramTotal: number | null = live?.ram?.totalGB ?? (systemData?.hardware?.system?.ramGB ?? null);

  // Rollende Live-Aktivitätskurve aus echten Messwerten (letzte ~2 min)
  const sampleRef = useRef({ hps: 0, util: 0 });
  useEffect(() => {
    sampleRef.current = { hps: totalSpeed, util: Math.round(utilization) };
  }, [totalSpeed, utilization]);
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date().toLocaleTimeString("de-DE", { hour12: false });
      setActivity((prev) => {
        const next = [...prev, { time: now, hps: sampleRef.current.hps, util: sampleRef.current.util }];
        return next.length > 40 ? next.slice(next.length - 40) : next;
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const fmtDuration = (sec: number) => {
    if (sec <= 0) return "—";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };
  const etaDisplay = runningEta > 0 ? fmtDuration(runningEta) : (activeJobsCount > 0 ? t("dash.calc") : "—");

  const realGPUs = useMemo(() => {
    const name = systemData?.hardware?.gpu?.name || live?.gpu?.name || "System GPU";
    const vramUsed = live?.gpu?.vramUsedMB ? Math.round(live.gpu.vramUsedMB / 1024) : (ramUsed ?? 0);
    const vramTotal = live?.gpu?.vramTotalMB ? Math.round(live.gpu.vramTotalMB / 1024) : (ramTotal ?? 0);
    // Geschätzte GPU-Leistung: konfigurierte Watt × Auslastung (nur wenn ein Job läuft)
    const nominalW = live?.powerWConfig ?? 300;
    const power = activeJobsCount > 0 ? Math.round((nominalW * Math.min(utilization, 100)) / 100) : 0;
    // Temperatur: GPU-Sensor falls vorhanden, sonst CPU-Die-Temp (Apple Silicon teilt den Thermalraum)
    const temp = gpuTemp ?? cpuTemp ?? 0;
    return [
      {
        id: "gpu-0",
        name,
        utilization: Math.round(utilization),
        temperature: temp,
        memory: { used: vramUsed, total: vramTotal },
        power,
        activeJob: jobs.find((j) => j.status === "running")?.id || "",
        uptime: live ? "Live Sys API" : "—",
      },
    ];
  }, [systemData, live, utilization, gpuTemp, cpuTemp, ramUsed, ramTotal, jobs, activeJobsCount]);

  // ---- Anpassbares Dashboard: Kachel-Katalog + Persistenz ----
  const foundCount = jobs.filter((j) => j.recoveredPassword).length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;

  type TileDef = {
    title: string;
    icon: typeof Activity;
    variant: "primary" | "success" | "warning" | "accent" | "danger";
    value: string;
    trend?: { value: string; direction: "up" | "down" };
    sparkline?: number[];
  };
  const tileCatalog: Record<string, TileDef> = {
    active_jobs: { title: t("tile.activeJobs"), icon: Activity, variant: "primary", value: activeJobsCount.toString(), trend: { value: t("trend.live"), direction: activeJobsCount > 0 ? "up" : "down" } },
    global_speed: { title: t("tile.globalSpeed"), icon: Zap, variant: "success", value: formatSpeed(totalSpeed), trend: { value: systemData?.hardware?.system?.os || t("trend.device"), direction: "up" }, sparkline: activity.length > 1 ? activity.map((a) => a.hps) : undefined },
    utilization: { title: t("tile.utilization"), icon: Gauge, variant: utilization > 90 ? "danger" : "warning", value: `${Math.round(utilization)}%`, trend: { value: jobUtil > 0 ? t("trend.gpuHashcat") : live?.gpu?.utilPct != null ? t("trend.gpu") : t("trend.cpu"), direction: utilization > 0 ? "up" : "down" }, sparkline: activity.length > 1 ? activity.map((a) => a.util) : undefined },
    eta: { title: t("tile.eta"), icon: Clock, variant: "primary", value: etaDisplay, trend: { value: activeJobsCount > 0 ? t("trend.active") : t("trend.idle"), direction: activeJobsCount > 0 ? "up" : "down" } },
    gpu_temp: { title: t("tile.gpuTemp"), icon: Thermometer, variant: gpuTemp != null && gpuTemp > 80 ? "danger" : "warning", value: gpuTemp != null ? `${gpuTemp}°C` : t("trend.na"), trend: { value: gpuTemp != null ? (gpuTemp > 80 ? t("trend.hot") : t("trend.safe")) : t("trend.metal"), direction: "up" } },
    found: { title: t("tile.found"), icon: CheckCircle2, variant: "accent", value: foundCount.toString(), trend: { value: t("trend.total"), direction: "up" } },
    cpu_load: { title: t("tile.cpuLoad"), icon: Cpu, variant: "warning", value: cpuLoad != null ? `${cpuLoad}%` : t("trend.na"), trend: { value: "systeminformation", direction: cpuLoad && cpuLoad > 0 ? "up" : "down" } },
    cpu_temp: { title: t("tile.cpuTemp"), icon: Thermometer, variant: "primary", value: cpuTemp != null ? `${cpuTemp}°C` : t("trend.na"), trend: { value: cpuTemp != null ? t("trend.sensor") : t("trend.na"), direction: "up" } },
    ram: { title: t("tile.ram"), icon: HardDrive, variant: "accent", value: ramUsed != null && ramTotal != null ? `${ramUsed} / ${ramTotal} GB` : t("trend.na"), trend: { value: t("trend.memory"), direction: "up" } },
    queue: { title: t("tile.queue"), icon: Database, variant: "primary", value: queuedCount.toString(), trend: { value: t("trend.waiting"), direction: queuedCount > 0 ? "up" : "down" } },
    total_jobs: { title: t("tile.totalJobs"), icon: Activity, variant: "primary", value: jobs.length.toString(), trend: { value: t("trend.history"), direction: "up" } },
  };

  const [tiles, setTiles] = useState<string[]>(DEFAULT_TILES);
  const [editMode, setEditMode] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TILES_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setTiles(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);
  const persistTiles = (next: string[]) => {
    setTiles(next);
    try { localStorage.setItem(TILES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const removeTile = (id: string) => persistTiles(tiles.filter((t) => t !== id));
  const addTile = (id: string) => persistTiles([...tiles, id]);
  const resetTiles = () => persistTiles(DEFAULT_TILES);
  const hiddenTiles = Object.keys(tileCatalog).filter((id) => !tiles.includes(id));

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Live-Überblick aller lokalen Recovery-Operationen"
      />
      <main className="page-content">
          <SetupBanner />
          {/* Quick-Drop Recovery Zone */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="card"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => quickUploadStatus === "idle" && quickFileRef.current?.click()}
            style={{
              marginBottom: "var(--space-xl)",
              padding: "24px",
              cursor: quickUploadStatus === "idle" ? "pointer" : "default",
              border: isDragging ? "2px dashed var(--primary-500)" : "1px solid var(--border-default)",
              background: isDragging ? "rgba(6, 182, 212, 0.04)" : "var(--bg-surface)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <input
              type="file"
              ref={quickFileRef}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleQuickDrop(f);
              }}
            />
            <div style={{
              width: "56px", height: "56px", borderRadius: "16px",
              background: quickUploadStatus === "done" ? "rgba(16, 185, 129, 0.1)" : "rgba(6, 182, 212, 0.08)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {quickUploadStatus === "uploading" ? (
                <Loader2 size={24} className="animate-spin" style={{ color: "var(--primary-500)" }} />
              ) : quickUploadStatus === "done" ? (
                <CheckCircle2 size={24} style={{ color: "var(--success-500)" }} />
              ) : (
                <Upload size={24} style={{ color: "var(--primary-500)" }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--text-primary)" }}>
                {quickUploadStatus === "uploading" ? t("dash.analyzing")
                  : quickUploadStatus === "done" ? t("dash.detected", { type: quickUploadResult || "" })
                  : t("dash.quickRecovery")}
              </div>
              <div style={{ fontSize: "0.8125rem", color: quickUploadResult ? "var(--danger-500)" : "var(--text-tertiary)", marginTop: "2px" }}>
                {quickUploadStatus === "done" ? t("dash.redirecting")
                  : quickUploadResult ? quickUploadResult
                  : t("dash.quickHint")}
              </div>
            </div>
            {quickUploadStatus === "idle" && (
              <div style={{
                padding: "8px 16px", borderRadius: "var(--radius-full)",
                background: "var(--primary-500)", color: "#fff",
                fontSize: "0.8125rem", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "6px",
              }}>
                {t("dash.upload")} <ArrowRight size={14} />
              </div>
            )}
          </motion.div>

          {/* KPI-Kacheln – Echtzeit & anpassbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-md)", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>{t("dash.liveMetrics")}</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              {editMode && (
                <button onClick={resetTiles} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>
                  {t("dash.reset")}
                </button>
              )}
              <button
                onClick={() => setEditMode((v) => !v)}
                className={editMode ? "btn btn-primary" : "btn btn-secondary"}
                style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {editMode ? <><CheckCircle2 size={14} /> {t("dash.done")}</> : <><Settings size={14} /> {t("dash.customize")}</>}
              </button>
            </div>
          </div>
          <div className="kpi-grid">
            {tiles.map((id, i) => {
              const def = tileCatalog[id];
              if (!def) return null;
              return (
                <div key={id} style={{ position: "relative" }}>
                  {editMode && (
                    <button
                      onClick={() => removeTile(id)}
                      title={t("dash.removeTile")}
                      style={{
                        position: "absolute", top: "8px", right: "8px", zIndex: 5, width: "24px", height: "24px",
                        borderRadius: "50%", border: "none", cursor: "pointer", background: "#ef4444", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-md)",
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <KPICard icon={def.icon} title={def.title} value={def.value} trend={def.trend} variant={def.variant} delay={i} sparklineData={def.sparkline} />
                </div>
              );
            })}
            {editMode &&
              hiddenTiles.map((id) => {
                const def = tileCatalog[id];
                const Icon = def.icon;
                return (
                  <button
                    key={id}
                    onClick={() => addTile(id)}
                    title={t("dash.addTile")}
                    style={{
                      border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)", background: "var(--bg-surface)",
                      cursor: "pointer", padding: "var(--space-lg)", display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", gap: "8px", color: "var(--text-tertiary)", minHeight: "130px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Plus size={16} />
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>{def.title}</span>
                    <span style={{ fontSize: "0.6875rem" }}>{t("dash.add")}</span>
                  </button>
                );
              })}
          </div>

          {/* Job Queue & Tracking */}
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            style={{ marginTop: "var(--space-2xl)", padding: "var(--space-lg) var(--space-xl) var(--space-xl)" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-md)",
                paddingBottom: "var(--space-lg)",
                marginBottom: "var(--space-md)",
                borderBottom: "1px solid var(--border-subtle)",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 700 }}>{t("dash.jobQueue")}</h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
                  {t("dash.jobQueueSub")}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => importFileRef.current?.click()}
                  className="btn btn-secondary"
                  title={t("dash.importDigestTitle")}
                  style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Upload size={14} /> {t("dash.importDigest")}
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportDigest(f); e.target.value = ""; }}
                />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 14px",
                    borderRadius: "var(--radius-full)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    background: activeJobsCount > 0 ? "rgba(16,185,129,0.1)" : "var(--bg-secondary)",
                    color: activeJobsCount > 0 ? "var(--success-400)" : "var(--text-tertiary)",
                  }}
                >
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: activeJobsCount > 0 ? "var(--success-400)" : "var(--text-muted)",
                    }}
                    className={activeJobsCount > 0 ? "animate-pulse" : undefined}
                  />
                  {t("dash.activeTotal", { a: activeJobsCount, b: jobs.length })}
                </span>
              </div>
            </div>
            <JobTable />
          </motion.div>

          {/* Activity Chart + GPU Monitor */}
          <div
            className="dashboard-grid-3"
            style={{ marginTop: "var(--space-lg)" }}
          >
            <ActivityChart data={activity} />
            <GPUMonitor gpus={realGPUs} />
          </div>

          {/* Recent Results */}
          <RecentResults events={timelineEvents} />
      </main>
    </>
  );
}
