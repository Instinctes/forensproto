"use client";

import { useState } from "react";
import { Coins, Loader2, TrendingUp, CircleSlash, Activity } from "lucide-react";

interface AddrResult {
  address: string;
  chain: string;
  balance: string;
  unit: string;
  txCount: number;
  active: boolean;
  error?: string;
}
interface Resp {
  success: boolean;
  error?: string;
  verdict: "value" | "active" | "empty";
  results: AddrResult[];
}

/** „Lohnt sich der Aufwand?" — On-Chain-Wertcheck vor dem Recovery-Job. */
export default function WorthCheck({ addresses = [] }: { addresses?: string[] }) {
  const [input, setInput] = useState(addresses.join("\n"));
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const addrs = input.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (addrs.length === 0) {
      setError("Bitte mindestens eine Adresse angeben");
      return;
    }
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/onchain/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: addrs }),
      }).then((x) => x.json());
      if (r.success) setRes(r);
      else setError(r.error || "Prüfung fehlgeschlagen");
    } catch {
      setError("Prüfung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const verdictBox = () => {
    if (!res) return null;
    const cfg =
      res.verdict === "value"
        ? { color: "var(--success-400)", bg: "rgba(16,185,129,0.1)", icon: <TrendingUp size={18} />, text: "Guthaben gefunden — Recovery lohnt sich klar." }
        : res.verdict === "active"
          ? { color: "var(--warning-400)", bg: "rgba(245,158,11,0.1)", icon: <Activity size={18} />, text: "Aktive Wallet (Transaktionshistorie), aktuell kein Guthaben — Abwägung sinnvoll." }
          : { color: "var(--text-tertiary)", bg: "var(--bg-secondary)", icon: <CircleSlash size={18} />, text: "Leer & ohne Historie — Aufwand lohnt sich vermutlich nicht." };
    return (
      <div style={{ marginTop: "var(--space-md)", padding: "var(--space-md) var(--space-lg)", borderRadius: "var(--radius-md)", background: cfg.bg, border: `1px solid ${cfg.color}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: cfg.color, fontWeight: 700, marginBottom: "8px" }}>
          {cfg.icon} {cfg.text}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {res.results.map((r, i) => (
            <div key={i} style={{ fontSize: "0.75rem", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <span className="mono" style={{ color: "var(--text-tertiary)", wordBreak: "break-all" }}>{r.address}</span>
              <span className="mono" style={{ color: parseFloat(r.balance) > 0 ? "var(--success-400)" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {r.error ? `⚠ ${r.error}` : `${r.balance} ${r.unit} · ${r.txCount} Tx`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ padding: "var(--space-lg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-sm)" }}>
        <Coins size={18} style={{ color: "var(--primary-500)" }} />
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lohnt sich der Aufwand?</h3>
      </div>
      <p style={{ margin: "0 0 var(--space-md)", fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
        On-Chain-Wertcheck der Wallet-Adressen (BTC/ETH) vor dem Recovery-Job.
      </p>
      <textarea
        className="af-input form-input"
        rows={3}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Adresse(n), eine pro Zeile (1..., bc1..., 0x...)"
        style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", width: "100%" }}
      />
      <button className="btn btn-secondary" onClick={run} disabled={loading} style={{ marginTop: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />} Wert prüfen
      </button>
      {error && <div style={{ marginTop: "var(--space-sm)", color: "var(--danger-400)", fontSize: "0.8125rem" }}>{error}</div>}
      {verdictBox()}
    </div>
  );
}
