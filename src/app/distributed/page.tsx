"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Network, Loader2, CheckCircle2, XCircle, Zap } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/context/I18nContext";

interface AgentRes { id: string; healthy: boolean; shardIndices: number[]; candidates: number; simSeconds: number; hps: number; found: boolean }
interface SimReport {
  keyspaceTotal: number; agentCount: number; healthyAgents: number; coverageValid: boolean;
  reassignments: Array<{ shardIndex: number; from: string; to: string }>;
  found: boolean; foundByAgent?: string; foundGlobalIndex?: number; expectedIndex: number | null; matchesExpected: boolean;
  aggregateHps: number; wallClockSec: number; singleNodeSec: number; speedup: number; perAgent: AgentRes[];
}

function Check({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 size={15} style={{ color: "var(--success-400)" }} />
    : <XCircle size={15} style={{ color: "var(--danger-400)" }} />;
}

export default function DistributedPage() {
  const { t } = useI18n();
  const [keyspace, setKeyspace] = useState("1000000");
  const [agents, setAgents] = useState("1000000, 2000000, 4000000");
  const [secret, setSecret] = useState("777777");
  const [faulty, setFaulty] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SimReport | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [throughput, setThroughput] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null); setReport(null); setLoading(true);
    try {
      const hpsList = agents.split(/[\s,]+/).filter(Boolean).map(Number);
      const agentObjs = hpsList.map((hps, i) => ({ id: `agent-${i + 1}`, hps }));
      const faultyIds = faulty.split(/[\s,]+/).filter(Boolean);
      const body = {
        keyspaceTotal: parseInt(keyspace, 10),
        agents: agentObjs,
        secretIndex: secret.trim() === "" ? null : parseInt(secret, 10),
        faultyAgentIds: faultyIds,
      };
      const r = await fetch("/api/recovery/distributed/benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (r.success) { setReport(r.report); setThroughput(r.throughput); } else setErr(r.error || "Fehler");
    } catch { setErr("Netzwerkfehler"); } finally { setLoading(false); }
  };

  return (
    <div className="page-container">
      <Header title={t("dist.title")} subtitle={t("dist.subtitle")} />
      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        <section className="card" style={{ padding: "var(--space-lg)" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}><Network size={18} style={{ color: "var(--primary-400)" }} /> {t("dist.params")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
            <label style={{ fontSize: "0.75rem" }}>{t("dist.keyspace")}<input className="af-input" value={keyspace} onChange={(e) => setKeyspace(e.target.value)} /></label>
            <label style={{ fontSize: "0.75rem" }}>{t("dist.secretIndex")}<input className="af-input" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
            <label style={{ fontSize: "0.75rem" }}>{t("dist.agents")}<input className="af-input" value={agents} onChange={(e) => setAgents(e.target.value)} /></label>
            <label style={{ fontSize: "0.75rem" }}>{t("dist.faulty")}<input className="af-input" value={faulty} onChange={(e) => setFaulty(e.target.value)} /></label>
          </div>
          <button className="btn btn-primary" onClick={run} disabled={loading} style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} {t("dist.runSelfTest")}
          </button>
          {err && <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem", marginTop: "8px" }}>{err}</div>}
        </section>

        {report && (
          <section className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ marginBottom: "var(--space-md)" }}>{t("dist.result")}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px", marginBottom: "var(--space-md)" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}><Check ok={report.coverageValid} /> {t("dist.coverage")}</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}><Check ok={report.matchesExpected} /> {t("dist.aggregation")}</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}><Check ok={report.reassignments.length === 0 || report.found} /> {t("dist.faultTolerance")} ({report.reassignments.length})</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}><Zap size={15} style={{ color: "var(--warning-400)" }} /> {t("dist.speedup")} {report.speedup.toFixed(2)}×</div>
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "var(--space-md)" }}>
              <div>{t("dist.hit")}: {report.found ? `${t("common.yes")} @ ${report.foundGlobalIndex} (${report.foundByAgent})` : `${t("common.no")} (${t("dist.exhaustive")})`}</div>
              <div>{t("dist.aggThroughput")}: {(report.aggregateHps / 1e6).toFixed(2)} MH/s · {t("dist.healthyAgents")} {report.healthyAgents}/{report.agentCount}</div>
              <div>Wall-Clock: {report.wallClockSec.toFixed(3)} s · Single-Node: {report.singleNodeSec.toFixed(3)} s</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {report.perAgent.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "0.75rem", opacity: a.healthy ? 1 : 0.5 }}>
                  <span style={{ width: "80px", fontWeight: 600 }}>{a.id}</span>
                  <span style={{ color: a.healthy ? "var(--success-400)" : "var(--danger-400)" }}>{a.healthy ? t("dist.online") : t("dist.offline")}</span>
                  <span className="mono" style={{ color: "var(--text-tertiary)" }}>{(a.hps / 1e6).toFixed(2)} MH/s</span>
                  <span className="mono" style={{ color: "var(--text-tertiary)" }}>{a.candidates.toLocaleString("de-DE")} Kand.</span>
                  <span className="mono" style={{ color: "var(--text-tertiary)" }}>{a.simSeconds.toFixed(3)} s</span>
                  {a.found && <span style={{ color: "var(--success-400)" }}>★ Treffer</span>}
                </div>
              ))}
            </div>
            {throughput && (
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "var(--space-md)" }}>
                Erschöpfender Lauf (Flotte): {throughput.estExhaustiveSec.toFixed(2)} s · {throughput.speedupVsSingle.toFixed(2)}× schneller als der schnellste Einzelagent.
              </div>
            )}
            <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", marginTop: "8px" }}>
              Deterministischer Selbsttest der Orchestrierung. Für ein Feld-Benchmark dieselbe Struktur mit realen Agenten-H/s speisen.
            </div>
          </section>
        )}
      </motion.main>
    </div>
  );
}
