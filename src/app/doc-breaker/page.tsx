"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Upload,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Shield,
  Hash,
  FileArchive,
  Lock,
  CheckCircle2,
  Info,
} from "lucide-react";
import Header from "@/components/Header";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

interface ExtractionResult {
  success: boolean;
  filename?: string;
  format?: string;
  hashMode?: string;
  hashModeLabel?: string;
  hashString?: string;
  metadata?: Record<string, string | number>;
  error?: string;
}

/* ─────────────────────────────────────────────────────────────
   Page Component
   ───────────────────────────────────────────────────────────── */

export default function DocBreakerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFileSelect = (f: File) => {
    setFile(f);
    setResult(null);
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
      const response = await fetch("/api/doc-breaker/extract", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Doc-Breaker error:", error);
      setResult({ success: false, error: "Verbindungsfehler zum Server" });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getFormatIcon = (format?: string) => {
    if (!format) return <FileText size={20} />;
    const f = format.toLowerCase();
    if (f.includes("pdf")) return <FileText size={20} />;
    if (f.includes("zip") || f.includes("rar") || f.includes("7z")) return <FileArchive size={20} />;
    return <Lock size={20} />;
  };

  return (
    <div className="page-container">
      <Header
        title="Document Breaker"
        subtitle="Hash-Extraktion aus verschlüsselten Dokumenten — PDF, Office, ZIP, RAR, 7-Zip"
      />

      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* Upload Zone */}
          <div
            className="card"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              padding: "var(--space-2xl)",
              border: dragOver ? "2px dashed var(--primary-400)" : "2px dashed var(--border-subtle)",
              background: dragOver ? "rgba(var(--primary-rgb), 0.03)" : "var(--bg-surface)",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".pdf,.docx,.xlsx,.pptx,.zip,.rar,.7z,.doc,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
            <div style={{
              width: "64px", height: "64px", borderRadius: "var(--radius-xl)",
              background: "rgba(var(--primary-rgb), 0.08)", display: "flex",
              alignItems: "center", justifyContent: "center", margin: "0 auto var(--space-md)",
              color: "var(--primary-400)",
            }}>
              <Upload size={28} />
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "var(--space-xs)" }}>
              Verschlüsseltes Dokument hochladen
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
              PDF, Office (DOCX/XLSX/PPTX), ZIP, RAR, 7-Zip — Drag & Drop oder klicken
            </p>
          </div>

          {/* Selected File Info */}
          {file && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
              style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "var(--radius-lg)",
                  background: "rgba(var(--primary-rgb), 0.08)", display: "flex",
                  alignItems: "center", justifyContent: "center", color: "var(--primary-400)",
                }}>
                  {getFormatIcon(file.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{file.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{formatFileSize(file.size)}</div>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={loading}
                style={{ padding: "10px 28px", borderRadius: "var(--radius-lg)", fontWeight: 600 }}
              >
                {loading ? <><Loader2 className="spin" size={18} /> Extrahiere...</> : <><Hash size={18} /> Hash extrahieren</>}
              </button>
            </motion.div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {result?.success && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}
              >
                {/* Success Header */}
                <div className="card" style={{ padding: "var(--space-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "12px",
                    background: "rgba(34, 197, 94, 0.1)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <CheckCircle2 size={24} style={{ color: "var(--success-400)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "2px" }}>Hash erfolgreich extrahiert</h3>
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {result.filename} — {result.format}
                    </p>
                  </div>
                  <div style={{
                    padding: "6px 14px", borderRadius: "var(--radius-full)",
                    background: "rgba(var(--primary-rgb), 0.08)", color: "var(--primary-400)",
                    fontSize: "0.75rem", fontWeight: 700,
                  }}>
                    Mode {result.hashMode}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
                  <div className="card" style={{ padding: "var(--space-lg)" }}>
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                      <Info size={16} /> Dokument-Info
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                      <DetailRow label="Format" value={result.format || "—"} />
                      <DetailRow label="Hashcat Mode" value={`-m ${result.hashMode}`} mono />
                      <DetailRow label="Mode-Label" value={result.hashModeLabel || "—"} />
                    </div>
                  </div>

                  <div className="card" style={{ padding: "var(--space-lg)" }}>
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                      <Shield size={16} /> Metadaten
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                      {result.metadata && Object.entries(result.metadata).map(([k, v]) => (
                        <DetailRow key={k} label={k} value={String(v)} mono />
                      ))}
                      {(!result.metadata || Object.keys(result.metadata).length === 0) && (
                        <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Keine zusätzlichen Metadaten</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hash Output */}
                {result.hashString && (
                  <div className="card" style={{ padding: "var(--space-lg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                      <h4 style={{ fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                        <Hash size={16} /> Extrahierter Hash
                      </h4>
                      <button
                        className="btn btn-secondary"
                        onClick={() => copyToClipboard(result.hashString!, "hash")}
                        style={{ padding: "6px 16px", fontSize: "0.75rem" }}
                      >
                        {copiedField === "hash" ? <><Check size={14} /> Kopiert</> : <><Copy size={14} /> Kopieren</>}
                      </button>
                    </div>
                    <div style={{
                      padding: "var(--space-md)", background: "var(--bg-base)",
                      borderRadius: "var(--radius-md)", fontFamily: "var(--font-mono)",
                      fontSize: "0.6875rem", color: "var(--primary-300)",
                      wordBreak: "break-all", lineHeight: 1.7,
                      maxHeight: "200px", overflow: "auto",
                    }}>
                      {result.hashString}
                    </div>
                    <p style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginTop: "var(--space-sm)" }}>
                      Hashcat-Befehl: <code style={{ color: "var(--primary-300)" }}>hashcat -m {result.hashMode} hash.txt wordlist.txt</code>
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {result && !result.success && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="card"
                style={{ padding: "var(--space-2xl)", textAlign: "center" }}
              >
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

/* ═══════════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════════ */

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 500, marginTop: "1px", wordBreak: "break-all", fontFamily: mono ? "var(--font-mono)" : undefined }}>{value || "—"}</p>
    </div>
  );
}
