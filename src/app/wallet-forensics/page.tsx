"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  Loader2,
  Clock,
  Bitcoin,
  AlertTriangle,
  Search,
  Activity,
  Layers
} from "lucide-react";
import Header from "@/components/Header";

interface AddressCluster {
  addresses: string[];
  reason: string;
  confidence: number;
}

interface UTXOPattern {
  type: string;
  description: string;
  affectedTxIds: string[];
}

interface TemporalPattern {
  type: string;
  description: string;
  timeRange?: {
    start: string;
    end: string;
  };
}

interface ForensicsResult {
  analysis: {
    addressClusters: AddressCluster[];
    utxoPatterns: UTXOPattern[];
    temporalAnalysis: TemporalPattern[];
    summary: string;
  };
  txCount: number;
  addressesAnalyzed: string[];
}

export default function WalletForensicsPage() {
  const [addressInput, setAddressInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForensicsResult | null>(null);

  const handleAnalyze = async () => {
    if (!addressInput.trim()) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const addresses = addressInput
        .split(/[\n,]+/)
        .map(a => a.trim())
        .filter(Boolean);
        
      if (addresses.length === 0) {
        throw new Error("Bitte mindestens eine gültige Adresse eingeben.");
      }
      
      if (addresses.length > 10) {
        throw new Error("Maximal 10 Adressen gleichzeitig für die Deep-Analyse erlaubt.");
      }

      const response = await fetch("/api/crypto-forensics/wallet-forensics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Analyse fehlgeschlagen");
      }
      
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header
        title="Wallet-Forensik Dashboard"
        subtitle="UTXO-Muster, Address-Clustering & Zeitreihenanalyse"
      />
      <main className="page-content">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--space-xl)" }}>
          
          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            <div className="card" style={{ padding: "var(--space-lg)", background: "linear-gradient(135deg, var(--bg-surface), var(--bg-hover))" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Search size={18} /> Deep-Scan Parameter
              </h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "var(--space-md)" }}>
                Bitcoin-Adressen eingeben (eine pro Zeile oder kommagetrennt). Maximal 10 Adressen.
              </p>
              
              <textarea
                className="af-input"
                placeholder="bc1q..., 1A1z..., 3J98..."
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                style={{ minHeight: "150px", resize: "vertical", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", marginBottom: "var(--space-md)" }}
              />
              
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={loading || !addressInput.trim()}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {loading ? (
                  <><Loader2 size={16} className="spin" /> Analysiere Blockchain...</>
                ) : (
                  <><Network size={16} /> Forensic Scan Starten</>
                )}
              </button>
            </div>
            
            {error && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "var(--radius-md)", display: "flex", gap: "var(--space-sm)" }}>
                <AlertTriangle size={16} style={{ color: "var(--danger-400)", flexShrink: 0, marginTop: "2px" }} />
                <span style={{ fontSize: "0.8125rem", color: "var(--danger-400)" }}>{error}</span>
              </motion.div>
            )}
            
            {/* Info Card */}
            <div className="card" style={{ padding: "var(--space-lg)", border: "1px dashed var(--border-subtle)" }}>
              <h4 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--space-sm)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Analyse-Methodik
              </h4>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "0.75rem", color: "var(--text-tertiary)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <li><strong>Common-Input-Ownership:</strong> Gruppiert Adressen, die gemeinsam als Inputs in einer Transaktion verwendet wurden.</li>
                <li><strong>UTXO-Heuristiken:</strong> Erkennt Wechselgeld (Change), Peeling-Chains und Round-Amount-Spends.</li>
                <li><strong>Zeitreihenanalyse:</strong> Identifiziert Burst-Aktivität, automatisierte Bots (CV-Analyse) und Zeitzonen (Peak-Hours).</li>
              </ul>
            </div>
          </div>
          
          {/* Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            {!result && !loading && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-lg)", background: "rgba(0,0,0,0.1)", minHeight: "500px", color: "var(--text-tertiary)" }}>
                <Network size={48} style={{ opacity: 0.2, marginBottom: "var(--space-md)" }} />
                <p style={{ fontSize: "0.875rem" }}>Bereit für Wallet-Forensik</p>
                <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>Die Analyse scannt die Blockchain auf verdächtige Muster.</p>
              </div>
            )}
            
            {loading && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "500px" }}>
                <Loader2 size={48} style={{ color: "var(--primary-400)", animation: "spin 1s linear infinite", marginBottom: "var(--space-md)" }} />
                <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>Mustererkennung läuft...</p>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Transaktions-Graphen werden rekonstruiert</p>
              </div>
            )}
            
            {result && (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
                  
                  {/* Summary */}
                  <div className="card" style={{ padding: "var(--space-lg)", borderLeft: "4px solid var(--primary-500)" }}>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "4px" }}>Forensischer Bericht</h2>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                      {result.analysis.summary}
                    </p>
                    <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "rgba(6, 182, 212, 0.1)", color: "#06b6d4", borderRadius: "100px", fontWeight: 600 }}>
                        {result.addressesAnalyzed.length} Adressen gescannt
                      </span>
                      <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6", borderRadius: "100px", fontWeight: 600 }}>
                        {result.txCount} Transaktionen
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
                    {/* Address Clusters */}
                    <div className="card" style={{ padding: "var(--space-lg)" }}>
                      <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Layers size={16} /> Adress-Cluster ({result.analysis.addressClusters.length})
                      </h3>
                      {result.analysis.addressClusters.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                          {result.analysis.addressClusters.map((cluster, i) => (
                            <div key={i} style={{ padding: "var(--space-sm)", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                <span style={{ fontSize: "0.75rem", color: "var(--primary-400)", fontWeight: 600 }}>Cluster #{i + 1}</span>
                                <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{cluster.reason}</span>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                {cluster.addresses.map((addr, j) => (
                                  <span key={j} className="mono" style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{addr}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Keine Cluster identifiziert.</p>
                      )}
                    </div>
                    
                    {/* Temporal Analysis */}
                    <div className="card" style={{ padding: "var(--space-lg)" }}>
                      <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Clock size={16} /> Zeitreihen-Analyse ({result.analysis.temporalAnalysis.length})
                      </h3>
                      {result.analysis.temporalAnalysis.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                          {result.analysis.temporalAnalysis.map((pattern, i) => (
                            <div key={i} style={{ padding: "var(--space-sm)", background: "rgba(245, 158, 11, 0.05)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                                <Activity size={14} style={{ color: "var(--warning-400)" }} />
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--warning-400)", textTransform: "uppercase" }}>{pattern.type.replace("_", " ")}</span>
                              </div>
                              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                                {pattern.description}
                              </p>
                              {pattern.timeRange && (
                                <div style={{ marginTop: "6px", fontSize: "0.6875rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                                  {new Date(pattern.timeRange.start).toLocaleString()} - {new Date(pattern.timeRange.end).toLocaleString()}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Keine zeitlichen Auffälligkeiten.</p>
                      )}
                    </div>
                  </div>
                  
                  {/* UTXO Patterns */}
                  <div className="card" style={{ padding: "var(--space-lg)" }}>
                    <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Bitcoin size={16} /> UTXO Verhaltensmuster ({result.analysis.utxoPatterns.length})
                    </h3>
                    {result.analysis.utxoPatterns.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                        {result.analysis.utxoPatterns.map((pattern, i) => (
                          <div key={i} style={{ padding: "12px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", borderLeft: `3px solid ${pattern.type === "peeling_chain" ? "var(--danger-400)" : "var(--primary-400)"}` }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: pattern.type === "peeling_chain" ? "var(--danger-400)" : "var(--primary-400)", textTransform: "uppercase", marginBottom: "4px" }}>
                              {pattern.type.replace("_", " ")}
                            </div>
                            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 8px 0" }}>
                              {pattern.description}
                            </p>
                            <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                              <strong>TXID:</strong> <span className="mono">{pattern.affectedTxIds[0].substring(0, 16)}...</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Keine auffälligen UTXO-Muster (wie Consolidation, Peeling) identifiziert.</p>
                    )}
                  </div>
                  
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
