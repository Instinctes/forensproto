"use client";

import { motion } from "framer-motion";
import { Thermometer, Zap, Clock } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

export interface GPU {
  id: string;
  name: string;
  /** null = nicht gemessen (kein Fake-%) */
  utilization: number | null;
  utilizationNote?: string;
  temperature: number | null;
  memory: { used: number | null; total: number | null };
  power: number | null;
  activeJob: string | null;
  uptime: string;
}

interface GPUMonitorProps {
  gpus: GPU[];
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n}${suffix}`;
}

export default function GPUMonitor({ gpus }: GPUMonitorProps) {
  const { t } = useI18n();
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
    >
      <div className="card-header">
        <h3 className="card-title">{t("gpu.title")}</h3>
        <span
          className="card-badge"
          style={{
            background: "rgba(16, 185, 129, 0.1)",
            color: "var(--success-400)",
          }}
        >
          {t("gpu.online", { n: gpus.length })}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {gpus.map((gpu, index) => {
          const util = gpu.utilization;
          const busy = Boolean(gpu.activeJob);
          const barWidth = util != null ? util : busy ? 40 : 0;
          return (
            <motion.div
              key={gpu.id}
              className="gpu-card"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.45 + index * 0.08 }}
            >
              <div className="gpu-card-header">
                <div className="gpu-name">{gpu.name}</div>
                <div className="gpu-status-dot" />
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                    {t("gpu.util")}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: "0.75rem",
                      color: busy ? "var(--warning-400)" : "var(--success-400)",
                      fontWeight: 600,
                    }}
                  >
                    {util != null ? `${util}%` : gpu.utilizationNote || (busy ? "busy" : "0%")}
                  </span>
                </div>
                <div className="progress-bar-container">
                  <motion.div
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                    style={{
                      background: busy
                        ? "linear-gradient(90deg, var(--warning-600), var(--warning-400))"
                        : "linear-gradient(90deg, var(--primary-600), var(--primary-400))",
                      opacity: util == null && busy ? 0.55 : 1,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "8px",
                  marginTop: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <Thermometer size={12} /> {fmt(gpu.temperature, "°C")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <Zap size={12} /> {fmt(gpu.power, " W")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <Clock size={12} /> {gpu.uptime || "—"}
                </div>
              </div>

              {(gpu.memory.used != null || gpu.memory.total != null) && (
                <div style={{ marginTop: 6, fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                  VRAM: {fmt(gpu.memory.used)} / {fmt(gpu.memory.total)} GB
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
