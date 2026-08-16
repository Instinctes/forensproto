"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import GPUMonitor from "@/components/GPUMonitor";
import AgentsPanel from "@/components/AgentsPanel";
import { useActiveJobs } from "@/hooks/useActiveJobs";
import { Zap, ShieldCheck, Activity, AlertTriangle, Gauge, Loader2 } from "lucide-react";

interface SystemData {
  success: boolean;
  hardware: {
    gpu: {
      name: string;
    };
  };
}

interface BenchmarkResult {
  mode: number;
  label: string;
  speed: number;
  unit: string;
}

export default function GPUClusterPage() {
  const { jobs } = useActiveJobs(2000);
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [benchLoading, setBenchLoading] = useState(false);
  const [benchResults, setBenchResults] = useState<BenchmarkResult[]>([]);

  useEffect(() => {
    fetch("/api/system")
      .then(res => res.json())
      .then(data => {
        if (data.success) setSystemData(data);
      })
      .catch(console.error);
  }, []);

  const runBenchmark = async () => {
    setBenchLoading(true);
    setBenchResults([]);
    try {
      const res = await fetch("/api/benchmark");
      const data = await res.json();
      if (data.success && data.results) {
        setBenchResults(data.results);
      }
    } catch (e) {
      console.error("Benchmark error:", e);
    } finally {
      setBenchLoading(false);
    }
  };

  const activeJobs = useMemo(() => jobs.filter(j => j.status === 'running'), [jobs]);

  const realGPUs = useMemo(() => {
    if (!systemData) return [];

    const maxTemp = activeJobs.length > 0 ? Math.max(...activeJobs.map(j => j.temperature)) : 0;

    // Nur echte lokale GPU — Metriken nur wenn gemessen (Hashcat-Job-Temp).
    // Keine erfundenen Utilization/Power/Memory-Werte.
    const jobSpeed = activeJobs.reduce((s, j) => s + (j.speed || 0), 0);
    return [
      {
        id: "gpu-0",
        name: systemData.hardware.gpu.name || "Unbekanntes GPU-Gerät",
        // utilization: nur als „busy“-Indikator wenn Jobs laufen — kein Fake-%
        utilization: activeJobs.length > 0 ? null : 0,
        utilizationNote:
          activeJobs.length > 0
            ? jobSpeed > 0
              ? `${activeJobs.length} Job(s) · ${jobSpeed.toLocaleString()} H/s`
              : `${activeJobs.length} Job(s) aktiv (GPU-% nicht gemessen)`
            : "Idle",
        temperature: maxTemp || null,
        memory: {
          used: null,
          total: null,
        },
        power: null,
        activeJob: activeJobs[0]?.id || null,
        uptime: "—",
      },
    ];
  }, [systemData, activeJobs]);

  // Berechne echte Metriken statt hardcoded Werte
  const totalHashrate = useMemo(() => {
    const running = activeJobs.filter(j => j.speed && j.speed > 0);
    if (running.length === 0) return "0 H/s";
    const total = running.reduce((sum, j) => sum + (j.speed || 0), 0);
    if (total > 1e9) return `${(total / 1e9).toFixed(1)} GH/s`;
    if (total > 1e6) return `${(total / 1e6).toFixed(1)} MH/s`;
    if (total > 1e3) return `${(total / 1e3).toFixed(1)} kH/s`;
    return `${total.toFixed(0)} H/s`;
  }, [activeJobs]);

  return (
    <div className="page-content">
      <Header
        title="GPU Hardware"
        subtitle="Lokale Hardwarebeschleunigung für Recovery-Jobs"
      />

      <AgentsPanel />

      <div style={{ marginTop: "var(--space-2xl)", display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-xl)" }}>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
           {/* Real Metrics */}
           <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-md)" }}>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "var(--space-sm)" }}>
                    <Activity size={14} /> Aktuelle Hashrate
                 </div>
                 <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{totalHashrate}</div>
                 <div style={{ fontSize: "0.75rem", color: activeJobs.length > 0 ? "var(--success-500)" : "var(--text-tertiary)", marginTop: "4px" }}>
                   {activeJobs.length > 0 ? `${activeJobs.length} Job(s) aktiv` : "Idle — Kein aktiver Job"}
                 </div>
              </div>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "var(--space-sm)" }}>
                    <Zap size={14} /> GPUs erkannt
                 </div>
                 <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{realGPUs.length}</div>
                 <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "4px" }}>
                   {systemData?.hardware.gpu.name || "Lade..."}
                 </div>
              </div>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "var(--space-sm)" }}>
                    <ShieldCheck size={14} /> Status
                 </div>
                 <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{systemData ? "Online" : "Lade..."}</div>
                 <div style={{ fontSize: "0.75rem", color: "var(--success-500)", marginTop: "4px" }}>
                   {systemData ? "Lokal verfügbar" : "Verbinde..."}
                 </div>
              </div>
           </div>

           <GPUMonitor gpus={realGPUs} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
           <div className="card" style={{ padding: "var(--space-lg)", background: "rgba(245, 158, 11, 0.04)", border: "1px solid rgba(245, 158, 11, 0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)", color: "var(--warning-500)" }}>
                 <AlertTriangle size={16} />
                 <h3 style={{ fontSize: "0.875rem", fontWeight: "700" }}>Hinweis</h3>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                Zeigt die lokal erkannte GPU (system_profiler) und echte Hashcat-Job-Metriken
                (Speed/Temp). GPU-Auslastung in % und Power werden nicht erfunden — nur gemessen oder „—“.
                Verteilte Agenten: siehe Panel oben und Recovery → Distributed.
              </p>
           </div>

           {/* Benchmark Section */}
           <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                 <h3 style={{ fontSize: "1rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                   <Gauge size={18} /> Hashcat Benchmark
                 </h3>
                 <button className="btn btn-primary" onClick={runBenchmark} disabled={benchLoading}
                   style={{ padding: "8px 20px", fontSize: "0.8125rem", borderRadius: "var(--radius-lg)" }}>
                   {benchLoading ? <><Loader2 className="spin" size={16} /> Läuft...</> : "Benchmark starten"}
                 </button>
              </div>
              {benchResults.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {benchResults.map((b, i) => {
                    const maxSpeed = Math.max(...benchResults.map(r => r.speed));
                    const pct = maxSpeed > 0 ? (b.speed / maxSpeed) * 100 : 0;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                          <span style={{ color: "var(--text-secondary)" }}>{b.label} <span style={{ color: "var(--text-tertiary)" }}>(Mode {b.mode})</span></span>
                          <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--primary-400)" }}>{b.speed.toLocaleString()} {b.unit}</span>
                        </div>
                        <div style={{ height: "6px", background: "var(--bg-base)", borderRadius: "3px", overflow: "hidden" }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, delay: i * 0.05 }}
                            style={{ height: "100%", background: "linear-gradient(90deg, var(--primary-400), var(--accent-500))", borderRadius: "3px" }} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", textAlign: "center", padding: "var(--space-lg) 0" }}>
                  Benchmark ausführen, um Hash-Geschwindigkeiten pro Wallet-Typ zu messen.
                </p>
              )}
           </div>

           <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: "700", marginBottom: "var(--space-md)" }}>Aktive Jobs</h3>
              {activeJobs.length === 0 ? (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", textAlign: "center", padding: "var(--space-xl) 0" }}>
                  Keine aktiven Recovery-Jobs
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {activeJobs.map((job) => (
                    <div key={job.id} style={{ display: "flex", gap: "10px", fontSize: "0.75rem" }}>
                       <span style={{ color: "var(--success-500)", fontWeight: "600" }}>●</span>
                       <div>
                         <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>Job #{job.id.slice(0, 8)}</div>
                         <div style={{ color: "var(--text-tertiary)" }}>
                           {job.progress ? `${job.progress.toFixed(1)}% abgeschlossen` : "Läuft..."}
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
}
