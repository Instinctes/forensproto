"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  AlertTriangle,
  FileImage,
  FileText,
  FileArchive,
  Database,
  Binary,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import Header from "@/components/Header";

interface CarvedFile {
  type: string;
  extension: string;
  offset: number;
  offsetHex: string;
  size: number | null;
  headerHex: string;
}

interface CarveResult {
  success: boolean;
  filename?: string;
  fileSize?: number;
  carved?: CarvedFile[];
  totalFound?: number;
  error?: string;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  jpg: <FileImage size={18} />,
  png: <FileImage size={18} />,
  gif: <FileImage size={18} />,
  bmp: <FileImage size={18} />,
  pdf: <FileText size={18} />,
  zip: <FileArchive size={18} />,
  rar: <FileArchive size={18} />,
  "7z": <FileArchive size={18} />,
  gz: <FileArchive size={18} />,
  sqlite: <Database size={18} />,
  elf: <Binary size={18} />,
  exe: <Binary size={18} />,
};

export default function FileCarverPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CarveResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setResult(null); }
  };

  const handleCarve = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/file-carver", { method: "POST", body: formData });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("File-Carver error:", error);
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

  const getSeverityColor = (ext: string) => {
    const critical = ["exe", "elf"];
    const suspicious = ["sqlite", "zip", "rar", "7z", "gz"];
    if (critical.includes(ext)) return "var(--danger-400)";
    if (suspicious.includes(ext)) return "var(--warning-400)";
    return "var(--primary-400)";
  };

  return (
    <div className="page-container">
      <Header
        title="File Carver"
        subtitle="Magic-Byte Scanning — Eingebettete Dateien in Binärdaten erkennen"
      />

      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* Upload Zone */}
          <div
            className="card"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "var(--space-2xl)", textAlign: "center", cursor: "pointer",
              border: dragOver ? "2px dashed var(--primary-400)" : "2px dashed var(--border-subtle)",
              background: dragOver ? "rgba(var(--primary-rgb), 0.03)" : "var(--bg-surface)",
              transition: "all 0.2s ease",
            }}
          >
            <input type="file" ref={fileInputRef} style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); } }} />
            <div style={{
              width: "64px", height: "64px", borderRadius: "var(--radius-xl)",
              background: "rgba(var(--primary-rgb), 0.08)", display: "flex",
              alignItems: "center", justifyContent: "center", margin: "0 auto var(--space-md)",
              color: "var(--primary-400)",
            }}>
              <HardDrive size={28} />
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-xs)" }}>
              Binärdatei zum Carven hochladen
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
              Disk-Images, RAM-Dumps, Wallet-Dateien oder beliebige Binaries
            </p>
          </div>

          {/* File Selected + Action */}
          {file && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card"
              style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius-lg)", background: "rgba(var(--primary-rgb), 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-400)" }}>
                  <HardDrive size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{file.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{formatSize(file.size)}</div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleCarve} disabled={loading}
                style={{ padding: "10px 28px", borderRadius: "var(--radius-lg)", fontWeight: 600 }}>
                {loading ? <><Loader2 className="spin" size={18} /> Scanne...</> : <><Search size={18} /> Carve starten</>}
              </button>
            </motion.div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {result?.success && result.carved && (
              <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

                {/* Summary */}
                <div className="card" style={{ padding: "var(--space-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: result.totalFound! > 0 ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 size={24} style={{ color: result.totalFound! > 0 ? "var(--success-400)" : "var(--text-tertiary)" }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>
                      {result.totalFound! > 0 ? `${result.totalFound} eingebettete Dateien erkannt` : "Keine eingebetteten Dateien gefunden"}
                    </h3>
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {result.filename} ({formatSize(result.fileSize || 0)}) vollständig gescannt
                    </p>
                  </div>
                </div>

                {/* Carved Files Table */}
                {result.carved.length > 0 && (
                  <div className="card" style={{ padding: "var(--space-lg)", overflow: "auto" }}>
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Search size={16} /> Erkannte Dateisignaturen
                    </h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700 }}>Typ</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700 }}>Extension</th>
                          <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700 }}>Offset</th>
                          <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700 }}>Größe</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700 }}>Header</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.carved.map((item, i) => (
                          <motion.tr key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                            style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ color: getSeverityColor(item.extension) }}>
                                {FILE_ICONS[item.extension] || <Binary size={18} />}
                              </span>
                              <span style={{ fontWeight: 500 }}>{item.type}</span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                padding: "2px 8px", borderRadius: "var(--radius-full)",
                                background: `${getSeverityColor(item.extension)}12`,
                                color: getSeverityColor(item.extension),
                                fontSize: "0.6875rem", fontWeight: 700,
                              }}>
                                .{item.extension}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              0x{item.offsetHex}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              {item.size ? formatSize(item.size) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-tertiary)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.headerHex}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
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
