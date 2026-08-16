"use client";

import { useState, useCallback } from "react";
import Header from "@/components/Header";
import { Sparkles, KeyRound, Zap, Loader2, Copy, Check, ShieldCheck, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AIRulesPage() {
  const [passwords, setPasswords] = useState("");
  const [keywords, setKeywords] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRules, setGeneratedRules] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveToEngine = useCallback(async () => {
    if (generatedRules.length === 0) return;
    const name = window.prompt("Dateiname für das Regelset:", `ai-${Date.now().toString(36)}.rule`);
    if (!name) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rules: generatedRules }),
      });
      const data = await res.json();
      setSaveMsg(data.success ? `✓ ${data.ruleCount} Regeln als ${data.name} gespeichert` : `✗ ${data.error}`);
    } catch {
      setSaveMsg("✗ Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [generatedRules]);

  const handleGenerate = useCallback(async () => {
    if (!passwords.trim() && !keywords.trim()) return;
    
    setIsGenerating(true);
    setGeneratedRules([]);
    
    try {
      const response = await fetch("/api/ai-rules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwords: passwords.split("\n").filter(Boolean),
          keywords: keywords.split("\n").filter(Boolean)
        })
      });
      
      const data = await response.json();
      // Robust: API kann String oder Array liefern
      const rawRules = data.rules || [];
      const normalized = typeof rawRules === "string"
        ? rawRules.split("\n").map((l: string) => l.trim()).filter(Boolean)
        : Array.isArray(rawRules) ? rawRules : [];
      setGeneratedRules(normalized);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  }, [passwords, keywords]);

  return (
    <div className="page-content">
      <Header 
        title="AI Rule Engine" 
        subtitle="Generierung GPU-optimierter Transformationsregeln" 
      />

      <div style={{ marginTop: "var(--space-2xl)", display: "grid", gridTemplateColumns: "1fr 400px", gap: "var(--space-xl)" }}>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
           <div className="card" style={{ padding: "var(--space-xl)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
                 <KeyRound size={20} style={{ color: "var(--primary-500)" }} />
                 <h3 style={{ fontSize: "1.125rem", fontWeight: "700" }}>Input & Heuristiken</h3>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
                 <div>
                    <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>Bekannte Passwörter</label>
                    <textarea 
                      className="af-input" 
                      placeholder="Passwort 1..." 
                      value={passwords}
                      onChange={(e) => setPasswords(e.target.value)}
                      style={{ minHeight: "120px", fontSize: "0.875rem" }}
                    />
                 </div>
                 <div>
                    <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>Schlüsselwörter (Kontext)</label>
                    <textarea 
                      className="af-input" 
                      placeholder="Firma, Haustier, etc..." 
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      style={{ minHeight: "120px", fontSize: "0.875rem" }}
                    />
                 </div>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ width: "100%", justifyContent: "center" }}
                onClick={handleGenerate}
                disabled={isGenerating || (!passwords && !keywords)}
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <><Zap size={18} /> Rules Generieren</>}
              </button>
           </div>

           <AnimatePresence>
             {generatedRules.length > 0 && (
               <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: "var(--space-xl)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-lg)" }}>
                     <h3 style={{ fontSize: "1.125rem", fontWeight: "700" }}>Generierte Rules</h3>
                     <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {saveMsg && <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{saveMsg}</span>}
                        <button className="btn btn-ghost btn-sm" style={{ gap: "6px" }} onClick={saveToEngine} disabled={saving}>
                           {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} In Engine speichern
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ gap: "6px" }} onClick={() => {
                          navigator.clipboard.writeText(generatedRules.join("\n"));
                          setCopiedIndex(-1);
                          setTimeout(() => setCopiedIndex(null), 2000);
                        }}>
                           {copiedIndex === -1 ? <Check size={14} /> : <Copy size={14} />} Alle Kopieren
                        </button>
                     </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "var(--space-sm)", maxHeight: "300px", overflowY: "auto", padding: "4px" }}>
                     {generatedRules.map((rule, idx) => (
                       <div key={idx} style={{ padding: "8px", background: "var(--bg-base)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <code className="mono" style={{ fontSize: "0.75rem", color: "var(--primary-500)" }}>{rule}</code>
                          <button style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }} onClick={() => {
                            navigator.clipboard.writeText(rule);
                            setCopiedIndex(idx);
                            setTimeout(() => setCopiedIndex(null), 2000);
                          }}>
                             {copiedIndex === idx ? <Check size={12} color="var(--success-500)" /> : <Copy size={12} />}
                          </button>
                       </div>
                     ))}
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
           <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
                 <ShieldCheck size={18} style={{ color: "var(--accent-500)" }} />
                 <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Heuristik-Status</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Heuristik-Tabelle</span>
                    <span style={{ fontWeight: "700", color: "var(--success-500)" }}>Optimiert</span>
                 </div>
                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Musterbibliothek</span>
                    <span style={{ fontWeight: "700" }}>1,2 Mio. Einträge</span>
                 </div>
              </div>
           </div>

           <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: "700", marginBottom: "12px" }}>Engine-Optionen</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                 <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.8125rem", cursor: "pointer" }}>
                    <input type="checkbox" defaultChecked /> Erweiterte Permutationen
                 </label>
                 <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.8125rem", cursor: "pointer" }}>
                    <input type="checkbox" defaultChecked /> Tastatur-Walk-Muster
                 </label>
                 <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.8125rem", cursor: "pointer" }}>
                    <input type="checkbox" /> Leetspeak-Umwandlung
                 </label>
              </div>
           </div>

           <div className="card" style={{ padding: "var(--space-lg)", background: "rgba(59, 130, 246, 0.04)", border: "1px solid rgba(59, 130, 246, 0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)", color: "var(--primary-500)" }}>
                 <Sparkles size={18} />
                 <h3 style={{ fontSize: "1rem", fontWeight: "700" }}>Wusstest du?</h3>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                Gute Rules können die Time-to-Crack um bis zu 95% reduzieren, indem sie intelligente Transformationen statt purer Brute-Force anwenden.
              </p>
           </div>
        </div>

      </div>
    </div>
  );
}
