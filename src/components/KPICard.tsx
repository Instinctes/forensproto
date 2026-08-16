"use client";

import { motion } from "framer-motion";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  trend?: { value: string; direction: "up" | "down" };
  icon: LucideIcon;
  variant: "primary" | "success" | "warning" | "accent" | "danger";
  delay?: number;
  sparklineData?: number[];
}

const ICON_STYLE: Record<KPICardProps["variant"], { bg: string; shadow: string }> = {
  primary: { bg: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)", shadow: "0 6px 16px -4px rgba(8,145,178,0.45)" },
  success: { bg: "linear-gradient(135deg, #34d399 0%, #059669 100%)", shadow: "0 6px 16px -4px rgba(5,150,105,0.45)" },
  warning: { bg: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)", shadow: "0 6px 16px -4px rgba(217,119,6,0.45)" },
  danger: { bg: "linear-gradient(135deg, #f87171 0%, #dc2626 100%)", shadow: "0 6px 16px -4px rgba(220,38,38,0.45)" },
  accent: { bg: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)", shadow: "0 6px 16px -4px rgba(99,102,241,0.45)" },
};

export default function KPICard({
  title,
  value,
  trend,
  icon: Icon,
  variant,
  delay = 0,
  sparklineData,
}: KPICardProps) {
  const maxVal = sparklineData ? Math.max(...sparklineData) : 1;
  const minVal = sparklineData ? Math.min(...sparklineData) : 0;
  const range = maxVal - minVal || 1;

  return (
    <motion.div
      className={`kpi-card ${variant}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.08 }}
    >
      <div className="kpi-header">
        <div
          className={`kpi-icon ${variant}`}
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            background: ICON_STYLE[variant].bg,
            boxShadow: ICON_STYLE[variant].shadow,
          }}
        >
          <Icon size={22} strokeWidth={2.2} />
        </div>
        {trend && (
          <div className={`kpi-trend ${trend.direction}`}>
            {trend.direction === "up" ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {trend.value}
          </div>
        )}
      </div>
      <motion.div
        className="kpi-value"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: delay * 0.08 + 0.2 }}
      >
        {value}
      </motion.div>
      <div className="kpi-label">{title}</div>

      {sparklineData && (
        <div className="kpi-sparkline">
          <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
            <defs>
              <linearGradient
                id={`sparkGrad-${variant}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={
                    variant === "primary"
                      ? "#06b6d4"
                      : variant === "success"
                      ? "#10b981"
                      : variant === "warning"
                      ? "#f59e0b"
                      : variant === "danger"
                      ? "#ef4444"
                      : "#60a5fa"
                  }
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor={
                    variant === "primary"
                      ? "#06b6d4"
                      : variant === "success"
                      ? "#10b981"
                      : variant === "warning"
                      ? "#f59e0b"
                      : variant === "danger"
                      ? "#ef4444"
                      : "#60a5fa"
                  }
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <motion.path
              d={
                `M0,${40 - ((sparklineData[0] - minVal) / range) * 36} ` +
                sparklineData
                  .map(
                    (d, i) =>
                      `L${(i / (sparklineData.length - 1)) * 200},${
                        40 - ((d - minVal) / range) * 36
                      }`
                  )
                  .join(" ") +
                ` L200,40 L0,40 Z`
              }
              fill={`url(#sparkGrad-${variant})`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: delay * 0.08 + 0.3 }}
            />
            <motion.polyline
              points={sparklineData
                .map(
                  (d, i) =>
                    `${(i / (sparklineData.length - 1)) * 200},${
                      40 - ((d - minVal) / range) * 36
                    }`
                )
                .join(" ")}
              fill="none"
              stroke={
                variant === "primary"
                  ? "#06b6d4"
                  : variant === "success"
                  ? "#10b981"
                  : variant === "warning"
                  ? "#f59e0b"
                  : variant === "danger"
                  ? "#ef4444"
                  : "#60a5fa"
              }
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: delay * 0.08 + 0.3 }}
            />
          </svg>
        </div>
      )}
    </motion.div>
  );
}
