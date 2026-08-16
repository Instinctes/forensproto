"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanSearch,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Key,
  Copy,
  Check,
  Cpu,
  ShieldAlert,
} from "lucide-react";
import Header from "@/components/Header";

interface ScanResult {
  offset: number;
  type: string;
  value: string;
  context: string;
}

interface MemoryScanResult {
  success: boolean;
  filename?: string;
  fileSize?: number;
  totalFindings?: number;
  findings?: ScanResult[];
  error?: string;
}

const TYPE_COLORS: Record<string, string> = {
  "Bitcoin WIF Key": "var(--warning-400)",
  "BIP-32 xprv (Master Private)": "var(--danger-400)",
  "BIP-32 xpub (Master Public)": "var(--primary-400)",
  "Ethereum Private Key": "var(--danger-400)",
  "BIP39 Seed Phrase": "var(--accent-500)",
};

export default function MemoryScanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MemoryScanResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setResult(null); }
  };

  const handleScan = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/memory-scan", { method: "POST", body: formData });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Memory-Scan error:", error);
      setResult({ success: false, error: "Verbindungsfehler zum Server" });
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getTypeColor = (type: string) => TYPE_COLORS[type] || "var(--primary-400)";

  return (
    <div className="page-container">
      <Header
        title="Memory Scanner"
        subtitle="RAM-Dumps und Binärdateien nach Krypto-Artefakten durchsuchen"
      />

      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* Upload Zone */}
          <div className="card"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "var(--space-2xl)", textAlign: "center", cursor: "pointer",
              border: dragOver ? "2px dashed var(--primary-400)" : "2px dashed var(--border-subtle)",
              background: dragOver ? "rgba(var(--primary-rgb), 0.03)" : "var(--bg-surface)",
              transition: "all 0.2s ease",
            }}>
            <input type="file" ref={fileInputRef} style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); } }} />
            <div style={{ width: "64px", height: "64px", borderRadius: "var(--radius-xl)", background: "rgba(var(--primary-rgb), 0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto var(--space-md)", color: "var(--primary-400)" }}>
              <Cpu size={28} />
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-xs)" }}>RAM-Dump oder Binärdatei hochladen</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Scannt nach WIF-Keys, xprv/xpub, Ethereum-Keys, BIP39 Seed-Phrasen</p>
          </div>

          {/* File Selected */}
          {file && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card"
              style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius-lg)", background: "rgba(var(--primary-rgb), 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-400)" }}>
                  <Cpu size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{file.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{formatSize(file.size)}</div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleScan} disabled={loading}
                style={{ padding: "10px 28px", borderRadius: "var(--radius-lg)", fontWeight: 600 }}>
                {loading ? <><Loader2 className="spin" size={18} /> Scanne...</> : <><ScanSearch size={18} /> Memory Scan</>}
              </button>
            </motion.div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {result?.success && (
              <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

                {/* Summary */}
                <div className="card" style={{ padding: "var(--space-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "12px",
                    background: (result.totalFindings || 0) > 0 ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {(result.totalFindings || 0) > 0
                      ? <ShieldAlert size={24} style={{ color: "var(--warning-400)" }} />
                      : <CheckCircle2 size={24} style={{ color: "var(--success-400)" }} />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>
                      {(result.totalFindings || 0) > 0
                        ? `${result.totalFindings} Krypto-Artefakte gefunden`
                        : "Keine Krypto-Artefakte gefunden"}
                    </h3>
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {result.filename} ({formatSize(result.fileSize || 0)})
                    </p>
                  </div>
                </div>

                {/* Findings */}
                {result.findings && result.findings.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                    {result.findings.map((finding, i) => {
                      const color = getTypeColor(finding.type);
                      return (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                          className="card" style={{ padding: "var(--space-md) var(--space-lg)", borderLeft: `3px solid ${color}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)" }}>
                                <Key size={14} style={{ color }} />
                                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{finding.type}</span>
                                <span style={{
                                  padding: "1px 8px", borderRadius: "var(--radius-full)",
                                  background: `${color}12`, color, fontSize: "0.5625rem", fontWeight: 700,
                                  fontFamily: "var(--font-mono)",
                                }}>
                                  Offset 0x{finding.offset.toString(16).toUpperCase()}
                                </span>
                              </div>
                              <div style={{
                                padding: "var(--space-sm)", background: "var(--bg-base)",
                                borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)",
                                fontSize: "0.6875rem", color: "var(--primary-300)", wordBreak: "break-all",
                                lineHeight: 1.6,
                              }}>
                                {finding.value}
                              </div>
                              {finding.context && (
                                <div style={{ marginTop: "4px", fontSize: "0.6875rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                                  Kontext: {finding.context}
                                </div>
                              )}
                            </div>
                            <button onClick={() => copyToClipboard(finding.value, `finding-${i}`)}
                              style={{ background: "none", border: "none", padding: "4px 8px", cursor: "pointer", color: "var(--text-tertiary)", flexShrink: 0, marginLeft: "var(--space-sm)" }}>
                              {copiedField === `finding-${i}` ? <Check size={14} style={{ color: "var(--success-400)" }} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {result && !result.success && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card"
                style={{ padding: "var(--space-2xl)", textAlign: "center" }}>
                <AlertTriangle size={40} style={{ color: "var(--danger-400)", margin: "0 auto var(--space-md)" }} />
                <p style={{ color: "var(--danger-400)", fontWeight: 600 }}>{result.error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.main>
    </div>
  );
}
