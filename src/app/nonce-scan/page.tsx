"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, ShieldAlert, KeyRound, Activity, AlertTriangle } from "lucide-react";
import Header from "@/components/Header";

interface ReuseGroup {
  rValue: string;
  rValueFull: string;
  count: number;
  s1: string;
  s2: string;
  extractedPrivateKey?: string;
  derivedAddress?: string;
  wifCompressed?: string;
  recoveryNote?: string;
}
interface ScanResult {
  success: boolean;
  error?: string;
  address: string;
  txScanned: number;
  signatureCount: number;
  uniqueRValues: number;
  reusedNonces: ReuseGroup[];
  riskLevel: string;
  log: string[];
}

export default function NonceScanPage() {
  const [address, setAddress] = useState("");
  const [maxTx, setMaxTx] = useState(50);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!address.trim()) { setError("Bitte eine Bitcoin-Adresse eingeben"); return; }
    setLoading(true); setError(null); setRes(null);
    try {
      const r = await fetch("/api/crypto-forensics/address-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), maxTx }),
      }).then((x) => x.json());
      if (r.success) setRes(r);
      else setError(r.error || "Scan fehlgeschlagen");
    } catch {
      setError("Scan fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const recovered = res?.reusedNonces.filter((g) => g.extractedPrivateKey) ?? [];

  const stat = (label: string, value: string | number, danger = false) => (
    <div className="card" style={{ padding: "var(--space-md)", textAlign: "center" }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: danger ? "var(--danger-400)" : "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );

  return (
    <div className="page-content">
      <Header title="Nonce-Scanner (Adresse)" subtitle="ECDSA-Nonce-Reuse für eine Bitcoin-Adresse (Legacy + SegWit) — On-Chain, ohne wallet.dat" />

      <motion.div className="card" style={{ padding: "var(--space-xl)", marginTop: "var(--space-xl)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: "var(--space-md)", alignItems: "end" }}>
          <div>
            <label className="form-label">Bitcoin-Adresse (1… / 3… / bc1…)</label>
            <input className="af-input form-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1Bitkvo9K9eLspt9K64uPBN7kxnSWe6taW" style={{ fontFamily: "var(--font-mono)", width: "100%" }} />
          </div>
          <div>
            <label className="form-label">Max. Transaktionen</label>
            <input type="number" className="af-input form-input" value={maxTx} min={1} max={200} onChange={(e) => setMaxTx(parseInt(e.target.value) || 50)} style={{ width: "100%" }} />
          </div>
          <button className="btn btn-primary" onClick={run} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "8px", height: "fit-content", padding: "10px 18px" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Scannen
          </button>
        </div>
        <div style={{ marginTop: "var(--space-md)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", background: "var(--bg-secondary)", padding: "10px 14px", borderRadius: "var(--radius-md)" }}>
          k = (z₁ − z₂)·(s₁ − s₂)⁻¹ mod n &nbsp;|&nbsp; d = (s₁·k − z₁)·r⁻¹ mod n
        </div>
        {error && <div style={{ marginTop: "var(--space-md)", color: "var(--danger-400)", fontSize: "0.8125rem" }}>{error}</div>}
      </motion.div>

      {res && (
        <div style={{ marginTop: "var(--space-xl)", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-md)" }}>
            {stat("Transaktionen", res.txScanned)}
            {stat("Signaturen", res.signatureCount)}
            {stat("eindeutige r", res.uniqueRValues)}
            {stat("Reuse-Gruppen", res.reusedNonces.length, res.reusedNonces.length > 0)}
            {stat("Keys wiederhergestellt", recovered.length, recovered.length > 0)}
          </div>

          {recovered.length > 0 ? (
            recovered.map((g, i) => (
              <div key={i} className="card" style={{ padding: "var(--space-lg)", border: "1px solid var(--danger-400)", background: "rgba(239,68,68,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--danger-400)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
                  <ShieldAlert size={18} /> Private Key wiederhergestellt
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8125rem" }}>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Adresse:</span> <span className="mono">{g.derivedAddress}</span></div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Private Key (hex):</span> <span className="mono" style={{ wordBreak: "break-all", color: "var(--danger-300)" }}>{g.extractedPrivateKey}</span></div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>WIF:</span> <span className="mono" style={{ wordBreak: "break-all" }}>{g.wifCompressed}</span></div>
                </div>
              </div>
            ))
          ) : res.reusedNonces.length > 0 ? (
            <div className="card" style={{ padding: "var(--space-lg)", borderLeft: "3px solid var(--warning-400)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--warning-400)", fontWeight: 700 }}>
                <AlertTriangle size={18} /> {res.reusedNonces.length} Nonce-Reuse-Gruppe(n) — aber keine Key-Recovery möglich
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "8px 0 0" }}>
                Gleiche r-Werte gefunden, aber die zugehörigen Signaturpaare ließen sich nicht zu einem gültigen Schlüssel auflösen (z-Werte passen nicht / Malleability). Echte verwertbare Reuses sind selten.
              </p>
            </div>
          ) : (
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--success-400)", fontWeight: 700 }}>
                <Activity size={18} /> Kein Nonce-Reuse gefunden
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "8px 0 0" }}>
                Alle {res.signatureCount} Signaturen verwenden eindeutige Nonces — Adresse ist gegen diesen Angriff sicher (modernes RFC-6979-Verhalten).
              </p>
            </div>
          )}

          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ marginTop: 0, fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "8px" }}><KeyRound size={15} /> Scan-Log</h3>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", display: "flex", flexDirection: "column", gap: "3px" }}>
              {res.log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
