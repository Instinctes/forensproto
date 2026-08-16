"use client";

import { useState } from "react";
import { Crosshair, Loader2, ShieldAlert, Layers, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

interface RiskFactor { weight: number; reason: string }
interface ExposureCat { category: string; value: number; pct: number; count: number }
interface Counterparty { address: string; label?: string; category: string; value: number; direction: "in" | "out" }
interface AttributionReport {
  address: string; chain: string; balance: number; txCount: number;
  self: { label?: string; category: string };
  risk: { score: number; level: string; factors: RiskFactor[] };
  exposure: { totalValue: number; inbound: number; outbound: number; byCategory: ExposureCat[] };
  counterparties: Counterparty[];
  cluster: { size: number; addresses: string[] };
  sanctions: { clear: boolean; listPresent: boolean; matches: number };
  generatedAt: string;
}

const LEVEL_COLOR: Record<string, string> = {
  LOW: "var(--success-400)", MEDIUM: "var(--warning-400)", HIGH: "#fb923c", CRITICAL: "var(--danger-400)",
};
const CAT_COLOR: Record<string, string> = {
  sanctioned: "var(--danger-400)", mixer: "#fb923c", darknet: "#f43f5e", scam: "#f43f5e",
  gambling: "var(--warning-400)", exchange: "var(--success-400)", service: "var(--primary-400)",
  own: "var(--primary-300)", unknown: "var(--text-tertiary)",
};

export default function AttributionPanel() {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AttributionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!address.trim()) return;
    setLoading(true); setError(null); setReport(null);
    try {
      const r = await fetch("/api/onchain/attribution", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: address.trim() }),
      }).then((x) => x.json());
      if (r.success) setReport(r.report);
      else setError(r.error || "Fehlgeschlagen");
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  };

  const lvlColor = report ? LEVEL_COLOR[report.risk.level] || "var(--text-tertiary)" : "var(--text-tertiary)";

  return (
    <div className="card" style={{ padding: "var(--space-lg)", marginTop: "var(--space-lg)" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}>
        <Crosshair size={18} style={{ color: "var(--primary-400)" }} /> {t("attr.title")}
      </h3>

      <div style={{ display: "flex", gap: "8px", marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
        <input
          className="af-input"
          placeholder={t("attr.placeholder")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          style={{ flex: 1, minWidth: "240px" }}
        />
        <button className="btn btn-primary" onClick={run} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />} {t("attr.attribute")}
        </button>
      </div>

      {error && <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem" }}>{error}</div>}

      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {/* Risk-Header */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "92px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: `1px solid ${lvlColor}` }}>
              <span style={{ fontSize: "1.6rem", fontWeight: 800, color: lvlColor, lineHeight: 1 }}>{report.risk.score}</span>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: lvlColor }}>{report.risk.level}</span>
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              <div><strong>{report.chain.toUpperCase()}</strong> · {report.balance} · {report.txCount} Tx · {report.self.label || report.self.category}</div>
              <div style={{ display: "flex", gap: "12px", marginTop: "4px", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ArrowDownLeft size={13} /> {t("attr.in")} {report.exposure.inbound.toFixed(4)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ArrowUpRight size={13} /> {t("attr.out")} {report.exposure.outbound.toFixed(4)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Layers size={13} /> {t("attr.cluster")} {report.cluster.size}</span>
              </div>
            </div>
            {!report.sanctions.clear && (
              <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--danger-400)", fontWeight: 700, fontSize: "0.8125rem" }}>
                <ShieldAlert size={16} /> {report.sanctions.matches} {t("attr.sanctionsHits")}
              </div>
            )}
          </div>

          {/* Risk-Faktoren */}
          <div>
            <div style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "4px" }}>{t("attr.riskFactors")}</div>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              {report.risk.factors.map((f, i) => (
                <li key={i}>{f.reason} <span style={{ color: f.weight > 0 ? "var(--danger-400)" : f.weight < 0 ? "var(--success-400)" : "var(--text-tertiary)" }}>({f.weight > 0 ? "+" : ""}{f.weight})</span></li>
              ))}
            </ul>
          </div>

          {/* Exposure nach Kategorie */}
          {report.exposure.byCategory.length > 0 && (
            <div>
              <div style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "6px" }}>{t("attr.exposure")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {report.exposure.byCategory.map((c) => (
                  <div key={c.category} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "92px", fontSize: "0.75rem", color: CAT_COLOR[c.category] || "var(--text-secondary)", fontWeight: 600 }}>{c.category}</span>
                    <div style={{ flex: 1, height: "8px", background: "var(--bg-secondary)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(2, c.pct)}%`, height: "100%", background: CAT_COLOR[c.category] || "var(--text-tertiary)" }} />
                    </div>
                    <span className="mono" style={{ fontSize: "0.6875rem", width: "120px", textAlign: "right", color: "var(--text-tertiary)" }}>{c.value.toFixed(4)} · {c.pct.toFixed(0)}% ({c.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>
            Heuristische Attribution (Common-Input-Clustering, Label-DB, lokaler Sanktionsabgleich). Erstellt {new Date(report.generatedAt).toLocaleString("de-DE")}.
          </div>
        </div>
      )}
    </div>
  );
}
