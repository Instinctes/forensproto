"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/context/I18nContext";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ActivitySample {
  time: string; // HH:MM:SS
  hps: number; // Hash-Rate
  util: number; // Auslastung %
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  hpsLabel?: string;
  utilLabel?: string;
}

function fmtHps(v: number) {
  if (v > 1e9) return `${(v / 1e9).toFixed(1)} GH/s`;
  if (v > 1e6) return `${(v / 1e6).toFixed(1)} MH/s`;
  if (v > 1e3) return `${(v / 1e3).toFixed(1)} kH/s`;
  return `${v} H/s`;
}

function CustomTooltip({ active, payload, label, hpsLabel = "Hash-Rate", utilLabel = "Auslastung" }: CustomTooltipProps) {
  if (!active || !payload) return null;
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        padding: "10px 14px",
        fontSize: "0.8125rem",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--text-primary)" }}>{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "1px 0", color: "var(--text-secondary)" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: entry.color }} />
          <span>{entry.name === "hps" ? hpsLabel : utilLabel}:</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {entry.name === "hps" ? fmtHps(entry.value) : `${entry.value}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ActivityChart({ data = [] }: { data?: ActivitySample[] }) {
  const { t } = useI18n();
  const hasData = data.length > 1;

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
    >
      <div className="card-header">
        <h3 className="card-title">{t("chart.title")}</h3>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#06b6d4" }} /> {t("chart.hashRate")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#8b5cf6" }} /> {t("chart.utilization")}
          </div>
        </div>
      </div>

      <div className="chart-container">
        {!hasData ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {t("chart.waiting")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="gradHps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUtil" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtHps(Number(v))} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip hpsLabel={t("chart.hashRate")} utilLabel={t("chart.utilization")} />} />
              <Area yAxisId="left" type="monotone" dataKey="hps" stroke="#06b6d4" strokeWidth={2} fill="url(#gradHps)" name="hps" isAnimationActive={false} />
              <Area yAxisId="right" type="monotone" dataKey="util" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradUtil)" name="util" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
