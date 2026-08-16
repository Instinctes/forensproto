"use client";

import { useState, useCallback } from "react";
import Header from "@/components/Header";
import MissingWordRecovery from "@/components/MissingWordRecovery";
import { Key, ShieldCheck, RefreshCw, ListFilter, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface InvalidWord {
  index: number;
  word: string;
  suggestions: string[];
}

interface SeedRecoveryResult {
  valid: boolean;
  detectedFormat: string;
  wordCount: number;
  checksum: string;
  checksumValid: boolean;
  derivationPaths: string[];
  invalidWords: InvalidWord[];
  entropy?: string;
  language: string;
}

export default function SeedRecoveryPage() {
  const [mnemonic, setMnemonic] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SeedRecoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = useCallback(async () => {
    setIsProcessing(true);
    setResult(null);
    setError(null);
    
    try {
      const response = await fetch("/api/seed-recovery/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mnemonic: mnemonic.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Analyse fehlgeschlagen");
        return;
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setIsProcessing(false);
    }
  }, [mnemonic]);

  return (
    <div className="page-content">
      <Header 
        title="Seed Recovery" 
        subtitle="Analytik mnemonischer Phrasen & Mnemonic-Wiederherstellung" 
      />

      <div style={{ marginTop: "var(--space-2xl)", display: "grid", gridTemplateColumns: "1fr 340px", gap: "var(--space-xl)" }}>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
           <div className="card" style={{ padding: "var(--space-xl)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
                 <Key size={20} style={{ color: "var(--primary-500)" }} />
                 <h3 style={{ fontSize: "1.125rem", fontWeight: "700" }}>Mnemonic-Eingabe / Fragment</h3>
              </div>

              <textarea 
                className="af-input"
                placeholder="Geben Sie hier bekannte Wörter oder Fragmente Ihrer Seed-Phrase ein (z.B. apple breeze ? ? ? mouse...)"
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                style={{ minHeight: "140px", fontSize: "1rem", lineHeight: "1.8", color: "var(--primary-600)", fontWeight: "500" }}
              />

              <div style={{ marginTop: "var(--space-lg)", display: "flex", gap: "var(--space-md)" }}>
                 <button 
                   className="btn btn-primary" 
                   onClick={handleProcess}
                   disabled={isProcessing || !mnemonic.trim()}
                   style={{ flex: 1, justifyContent: "center" }}
                 >
                   {isProcessing ? <RefreshCw size={18} className="animate-spin" /> : "Analyse Starten"}
                 </button>
                 <button className="btn btn-ghost">BIP39 Wörterbuch laden</button>
              </div>
           </div>

           <AnimatePresence>
             {error && (
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="card"
                 style={{ padding: "var(--space-xl)", border: "1px solid var(--danger-500)" }}
               >
                 <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "var(--danger-500)" }}>
                    <XCircle size={20} />
                    <span style={{ fontWeight: "600" }}>{error}</span>
                 </div>
               </motion.div>
             )}
             {result && (
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="card"
                 style={{ padding: "var(--space-xl)", border: `1px solid ${result.checksumValid ? "var(--success-500)" : "var(--warning-500)"}` }}
               >
                 <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: result.checksumValid ? "var(--success-500)" : "var(--warning-500)", marginBottom: "var(--space-lg)" }}>
                    {result.checksumValid ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                    <h3 style={{ fontSize: "1.25rem", fontWeight: "700" }}>
                      {result.checksumValid ? "Gültige BIP39-Phrase" : "Analyse Ergebnis"}
                    </h3>
                 </div>

                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-lg)" }}>
                    <div>
                       <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "var(--space-xs)" }}>Format</div>
                       <div style={{ fontSize: "1rem", fontWeight: "600" }}>{result.detectedFormat}</div>
                    </div>
                    <div>
                       <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "var(--space-xs)" }}>Checksumme</div>
                       <div className="mono" style={{ fontSize: "1rem", fontWeight: "600", color: result.checksumValid ? "var(--success-400)" : "var(--danger-400)" }}>{result.checksum}</div>
                    </div>
                    <div>
                       <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "var(--space-xs)" }}>Wörter</div>
                       <div style={{ fontSize: "1rem", fontWeight: "600" }}>{result.wordCount}</div>
                    </div>
                 </div>

                 {result.invalidWords.length > 0 && (
                   <div style={{ marginTop: "var(--space-lg)", padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.06)", borderRadius: "var(--radius-md)", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
                     <div style={{ fontSize: "0.8125rem", fontWeight: "700", color: "var(--danger-500)", marginBottom: "var(--space-sm)" }}>
                       {result.invalidWords.length} ungültige Wörter erkannt
                     </div>
                     {result.invalidWords.map((iw, i) => (
                       <div key={i} style={{ fontSize: "0.8125rem", marginBottom: "var(--space-xs)" }}>
                         <span style={{ color: "var(--danger-400)" }}>#{iw.index + 1} &quot;{iw.word}&quot;</span>
                         {iw.suggestions.length > 0 && (
                           <span style={{ color: "var(--text-tertiary)" }}> → Vorschläge: {iw.suggestions.join(", ")}</span>
                         )}
                       </div>
                     ))}
                   </div>
                 )}

                 {result.derivationPaths.length > 0 && (
                   <div style={{ marginTop: "var(--space-lg)" }}>
                     <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "var(--space-sm)" }}>Mögliche Derivations-Pfade</div>
                     <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                        {result.derivationPaths.map((path: string, i: number) => (
                          <span key={i} className="mono" style={{ padding: "4px 10px", background: "var(--bg-base)", borderRadius: "var(--radius-md)", fontSize: "0.75rem", border: "1px solid var(--border-subtle)" }}>{path}</span>
                        ))}
                     </div>
                   </div>
                 )}
               </motion.div>
             )}
           </AnimatePresence>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
           <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
                 <ShieldCheck size={18} style={{ color: "var(--accent-500)" }} />
                 <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Sicherheitsstatus</h3>
              </div>
              <div style={{ background: "rgba(16, 185, 129, 0.08)", padding: "12px", borderRadius: "var(--radius-md)", fontSize: "0.8125rem", color: "var(--success-600)", display: "flex", gap: "8px" }}>
                 <CheckCircle2 size={16} /> <b>Offline-Modus:</b> Berechnungen finden lokal statt.
              </div>
           </div>

           <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
                 <ListFilter size={18} style={{ color: "var(--primary-500)" }} />
                 <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Parameter</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                 <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.875rem", cursor: "pointer" }}>
                    <input type="checkbox" defaultChecked /> Unscharfe Erkennung
                 </label>
                 <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.875rem", cursor: "pointer" }}>
                    <input type="checkbox" defaultChecked /> Automatische Prüsumme
                 </label>
                 <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.875rem", cursor: "pointer" }}>
                    <input type="checkbox" /> BIP44 Deep Search
                 </label>
              </div>
           </div>

           <div className="card" style={{ padding: "var(--space-lg)", background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)", color: "var(--danger-500)" }}>
                 <AlertTriangle size={18} />
                 <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Wichtiger Hinweis</h3>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                Geben Sie niemals Seed-Phrasen auf online-verbundenen Systemen ein. Diese Instanz von ForensProto sollte in einer isolierten Air-Gap Umgebung ausgeführt werden.
              </p>
           </div>
        </div>

      </div>

      <MissingWordRecovery />
    </div>
  );
}
