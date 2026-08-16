"use client";

import { motion } from "framer-motion";
import { CheckCircle, XCircle, Clock, Key } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

interface TimelineEvent {
  id: string;
  type: "success" | "failed" | "running";
  title: string;
  description: string;
  time: string;
  walletType: string;
}

interface RecentResultsProps {
  events: TimelineEvent[];
}

const iconMap = {
  success: CheckCircle,
  failed: XCircle,
  running: Clock,
};

export default function RecentResults({ events }: RecentResultsProps) {
  const { t } = useI18n();
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
    >
      <div className="card-header">
        <h3 className="card-title">{t("results.title")}</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.75rem",
            color: "var(--text-tertiary)",
          }}
        >
          <Key size={12} />
          {t("results.today", { n: 7 })}
        </div>
      </div>

      <div className="timeline">
        {events.map((event, index) => {
          const Icon = iconMap[event.type];
          return (
            <motion.div
              key={event.id}
              className="timeline-item"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.06 }}
            >
              <div className={`timeline-dot ${event.type}`}>
                <Icon size={16} />
              </div>
              <div className="timeline-content">
                <div className="timeline-title">{event.title}</div>
                <div className="timeline-meta">
                  {event.description} · {event.time}
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background:
                    event.walletType === "BTC"
                      ? "rgba(247, 147, 26, 0.1)"
                      : event.walletType === "ETH"
                      ? "rgba(98, 126, 234, 0.1)"
                      : "rgba(139, 92, 246, 0.1)",
                  color:
                    event.walletType === "BTC"
                      ? "#f7931a"
                      : event.walletType === "ETH"
                      ? "#627eea"
                      : "#a78bfa",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  alignSelf: "flex-start",
                }}
              >
                {event.walletType}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
