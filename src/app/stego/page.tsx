"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  ShieldAlert,
  Info,
  XCircle,
} from "lucide-react";
import Header from "@/components/Header";

interface StegoFinding {
  type: string;
  severity: "info" | "suspicious" | "critical";
  description: string;
  data?: string;
}

interface StegoResult {
  success: boolean;
  filename?: string;
  fileSize?: number;
  fileType?: string;
  findings?: StegoFinding[];
  entropy?: number;
  suspiciousScore?: number;
  error?: string;
}

const SEVERITY_CONFIG = {
  info: { color: "var(--primary-400)", bg: "rgba(var(--primary-rgb), 0.08)", icon: <Info size={16} />, label: "Info" },
  suspicious: { color: "var(--warning-400)", bg: "rgba(245,158,11,0.08)", icon: <ShieldAlert size={16} />, label: "Verdächtig" },
  critical: { color: "var(--danger-400)", bg: "rgba(239,68,68,0.08)", icon: <XCircle size={16} />, label: "Kritisch" },
};

export default function StegoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StegoResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (f: File) => {
    setFile(f);
    setResult(null);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/stego/analyze", { method: "POST", body: formData });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Stego error:", error);
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

  return (
    <div className="page-container">
      <Header
        title="Steganografie-Analyse"
        subtitle="Versteckte Daten in Bildern erkennen — EXIF, LSB, Metadaten, PEM-Keys"
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
            <input type="file" ref={fileInputRef} style={{ display: "none" }} accept="image/*,.bin,.dat"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            <div style={{ width: "64px", height: "64px", borderRadius: "var(--radius-xl)", background: "rgba(var(--primary-rgb), 0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto var(--space-md)", color: "var(--primary-400)" }}>
              <ImageIcon size={28} />
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-xs)" }}>Bild oder Datei zur Stego-Analyse hochladen</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>JPEG, PNG, BMP, GIF oder beliebige Binärdateien — Drag & Drop oder klicken</p>
          </div>

          {/* File + Preview */}
          {file && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ display: "grid", gridTemplateColumns: preview ? "200px 1fr" : "1fr", gap: "var(--space-lg)" }}>

              {preview && (
                <div className="card" style={{ padding: "var(--space-md)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Vorschau" style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "var(--radius-md)", objectFit: "contain" }} />
                </div>
              )}

              <div className="card" style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{file.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{formatSize(file.size)} — {file.type || "binary"}</div>
                </div>
                <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading}
                  style={{ padding: "10px 28px", borderRadius: "var(--radius-lg)", fontWeight: 600 }}>
                  {loading ? <><Loader2 className="spin" size={18} /> Analysiere...</> : <><Eye size={18} /> Stego-Scan</>}
                </button>
              </div>
            </motion.div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {result?.success && (
              <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

                {/* Summary Header */}
                <div className="card" style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                    <div style={{
                      width: "48px", height: "48px", borderRadius: "12px",
                      background: (result.findings?.length || 0) > 0
                        ? result.findings!.some(f => f.severity === "critical") ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)"
                        : "rgba(34,197,94,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {(result.findings?.length || 0) > 0
                        ? <ShieldAlert size={24} style={{ color: result.findings!.some(f => f.severity === "critical") ? "var(--danger-400)" : "var(--warning-400)" }} />
                        : <CheckCircle2 size={24} style={{ color: "var(--success-400)" }} />}
                    </div>
                    <div>
                      <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>
                        {(result.findings?.length || 0) > 0
                          ? `${result.findings!.length} Auffälligkeiten erkannt`
                          : "Keine versteckten Daten gefunden"}
                      </h3>
                      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        {result.filename} — {result.fileType}
                      </p>
                    </div>
                  </div>

                  {result.entropy !== undefined && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>Entropie</div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: result.entropy > 7.5 ? "var(--warning-400)" : "var(--text-primary)" }}>
                        {result.entropy.toFixed(3)}
                      </div>
                      <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>bit/byte (max 8.0)</div>
                    </div>
                  )}
                </div>

                {/* Findings List */}
                {result.findings && result.findings.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                    {result.findings.map((finding, i) => {
                      const cfg = SEVERITY_CONFIG[finding.severity];
                      return (
                        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                          className="card" style={{ padding: "var(--space-md) var(--space-lg)", borderLeft: `3px solid ${cfg.color}` }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-md)" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color, flexShrink: 0, marginTop: "2px" }}>
                              {cfg.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "2px" }}>
                                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{finding.type}</span>
                                <span style={{ padding: "1px 8px", borderRadius: "var(--radius-full)", background: cfg.bg, color: cfg.color, fontSize: "0.5625rem", fontWeight: 700, textTransform: "uppercase" }}>{cfg.label}</span>
                              </div>
                              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{finding.description}</p>
                              {finding.data && (
                                <div style={{ marginTop: "var(--space-xs)", padding: "var(--space-sm)", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-tertiary)", wordBreak: "break-all" }}>
                                  {finding.data}
                                </div>
                              )}
                            </div>
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
