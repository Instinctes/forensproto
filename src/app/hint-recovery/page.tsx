"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Loader2, Eye, Save, ListChecks, Sparkles, Wand2, Keyboard, Network } from "lucide-react";
import Header from "@/components/Header";

interface HintResult {
  count: number;
  capped: boolean;
  sample: string[];
  saved?: boolean;
  name?: string;
}

const SEPARATORS = [
  { label: "(keiner)", value: "" },
  { label: "-", value: "-" },
  { label: "_", value: "_" },
  { label: ".", value: "." },
];

export default function HintRecoveryPage() {
  const [parts, setParts] = useState("");
  const [optionalParts, setOptionalParts] = useState("");
  const [seps, setSeps] = useState<string[]>([""]);
  const [caseVariants, setCaseVariants] = useState(true);
  const [leet, setLeet] = useState(false);
  const [permuteOrder, setPermuteOrder] = useState(true);
  const [typos, setTypos] = useState({ capslock: false, swap: true, insert: false, delete: true, replace: false });
  const [result, setResult] = useState<HintResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Geführtes Interview
  const [iv, setIv] = useState({ names: "", dates: "", places: "", pets: "", keywords: "", suffixes: "", notes: "" });
  const [ivLoading, setIvLoading] = useState(false);
  const [ivSummary, setIvSummary] = useState<string | null>(null);

  const runInterview = async () => {
    if (!Object.values(iv).some((v) => v.trim())) {
      setIvSummary("Bitte mindestens ein Feld ausfüllen.");
      return;
    }
    setIvLoading(true);
    setIvSummary(null);
    try {
      let model: string | undefined;
      try { model = localStorage.getItem("af_ai_model") || undefined; } catch { /* ignore */ }
      const r = await fetch("/api/recovery/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: iv, model }),
      }).then((x) => x.json());
      if (!r.success) {
        setIvSummary(`Fehler: ${r.error}`);
        return;
      }
      const s = r.strategy;
      // Strategie in das Formular übernehmen
      setParts((s.parts || []).join("\n"));
      setOptionalParts((s.optionalParts || []).join("\n"));
      setLeet(!!s.leet);
      setCaseVariants(s.caseVariants !== false);
      if (s.typos) setTypos((t) => ({ ...t, ...s.typos }));
      if (Array.isArray(s.separators) && s.separators.length) setSeps(s.separators);
      setIvSummary(`${r.llmUsed ? "🤖 KI-verfeinert" : "⚙️ heuristisch"} — ${s.summary} · ~${r.previewCount.toLocaleString("de-DE")}${r.previewCapped ? "+" : ""} Kandidaten. Felder unten wurden befüllt.`);
    } catch {
      setIvSummary("Interview-Auswertung fehlgeschlagen");
    } finally {
      setIvLoading(false);
    }
  };

  const ivField = (key: keyof typeof iv, label: string, placeholder: string) => (
    <div>
      <label className="form-label">{label}</label>
      <input className="af-input form-input" value={iv[key]} onChange={(e) => setIv((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} />
    </div>
  );

  const toggleSep = (v: string) =>
    setSeps((prev) => (prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]));

  const body = () => ({
    parts: parts.split("\n").map((s) => s.trim()).filter(Boolean),
    optionalParts: optionalParts.split("\n").map((s) => s.trim()).filter(Boolean),
    separators: seps.length ? seps : [""],
    caseVariants,
    leet,
    permuteOrder,
    typos,
  });

  const preview = async () => {
    setLoading(true);
    setMsg(null);
    setResult(null);
    try {
      const r = await fetch("/api/recovery/hint-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body(), save: false }),
      }).then((x) => x.json());
      if (r.success) setResult(r);
      else setMsg(`Fehler: ${r.error}`);
    } catch {
      setMsg("Vorschau fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    const name = window.prompt("Dateiname für die Wortliste:", `hints-${Date.now().toString(36)}.txt`);
    if (!name) return;
    setLoading(true);
    try {
      const r = await fetch("/api/recovery/hint-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body(), save: true, name }),
      }).then((x) => x.json());
      setMsg(r.success ? `✓ ${r.count.toLocaleString("de-DE")} Kandidaten als ${r.name} gespeichert — jetzt im Recovery als Wortliste wählbar` : `✗ ${r.error}`);
      if (r.success) setResult(r);
    } catch {
      setMsg("Speichern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const saveKeyboardWalks = async () => {
    const name = window.prompt("Dateiname für die QWERTZ-Walks:", "qwertz-walks.txt");
    if (!name) return;
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/wordlist-gen/keyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save: true, name }),
      }).then((x) => x.json());
      setMsg(r.success ? `✓ ${r.count} QWERTZ-Walks als ${r.name} gespeichert — im Recovery wählbar` : `✗ ${r.error}`);
    } catch {
      setMsg("Speichern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const saveMarkov = async () => {
    const corpus = [...parts.split("\n"), ...optionalParts.split("\n")].map((s) => s.trim()).filter(Boolean);
    const name = window.prompt("Dateiname für die Markov-Wortliste:", "markov.txt");
    if (!name) return;
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/recovery/markov", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpus, save: true, name, count: 2000 }),
      }).then((x) => x.json());
      setMsg(r.success ? `✓ ${r.count} Markov-Kandidaten (Korpus ${r.corpusSize}) als ${r.name} gespeichert` : `✗ ${r.error}`);
    } catch {
      setMsg("Markov-Generierung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const cb = (checked: boolean, on: () => void) => (
    <input type="checkbox" checked={checked} onChange={on} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
  );

  return (
    <div className="page-container">
      <Header title="Erinnerungs-Recovery" subtitle="Aus Teil-Erinnerungen einen durchsuchbaren Kandidatenraum bauen" />
      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {/* Geführtes Interview (KI) */}
        <div className="card" style={{ padding: "var(--space-lg)", marginBottom: "var(--space-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}>
            <Sparkles size={18} style={{ color: "var(--primary-500)" }} />
            <div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Geführtes Interview</h3>
              <p style={{ margin: "2px 0 0", fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
                Beantworte ein paar Fragen — die KI (lokal, Ollama) baut daraus automatisch eine Strategie und befüllt die Felder unten. Funktioniert auch ohne KI (Heuristik).
              </p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-md)" }}>
            {ivField("names", "Namen (Person, Partner, Kinder)", "z.B. Max, Anna, Leon")}
            {ivField("dates", "Wichtige Jahre / Daten", "z.B. 2015, 1990, 07.03.")}
            {ivField("places", "Orte", "z.B. Berlin, Mallorca")}
            {ivField("pets", "Haustiere", "z.B. Bello, Minka")}
            {ivField("keywords", "Hobbys / Vereine / Sonstiges", "z.B. Bayern, Gitarre")}
            {ivField("suffixes", "Typische Endungen", "z.B. !, 123, #")}
          </div>
          <div style={{ marginTop: "var(--space-md)" }}>
            <label className="form-label">Sonstige Notizen</label>
            <textarea className="af-input form-input" rows={2} value={iv.notes} onChange={(e) => setIv((p) => ({ ...p, notes: e.target.value }))} placeholder="Alles, woran du dich noch erinnerst…" style={{ width: "100%" }} />
          </div>
          <button className="btn btn-primary" onClick={runInterview} disabled={ivLoading} style={{ marginTop: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
            {ivLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Strategie erstellen
          </button>
          {ivSummary && <div style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", color: ivSummary.startsWith("Fehler") || ivSummary.startsWith("Interview") ? "var(--danger-400)" : "var(--text-secondary)", padding: "var(--space-md)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>{ivSummary}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "var(--space-lg)" }}>
          {/* Eingaben */}
          <div className="card" style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            <div>
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Brain size={15} /> Sichere Fragmente <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(eines pro Zeile, kommt vor)</span>
              </label>
              <textarea className="form-input" rows={4} placeholder={"Max\n2019\n!"} value={parts} onChange={(e) => setParts(e.target.value)} style={{ fontFamily: "var(--font-mono)" }} />
            </div>
            <div>
              <label className="form-label">Optionale Fragmente <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(vielleicht dabei, max. 6)</span></label>
              <textarea className="form-input" rows={3} placeholder={"berlin\nhund"} value={optionalParts} onChange={(e) => setOptionalParts(e.target.value)} style={{ fontFamily: "var(--font-mono)" }} />
            </div>

            <div>
              <label className="form-label">Trenner zwischen Fragmenten</label>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {SEPARATORS.map((s) => (
                  <label key={s.value} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8125rem", cursor: "pointer" }}>
                    {cb(seps.includes(s.value), () => toggleSep(s.value))} {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(caseVariants, () => setCaseVariants((v) => !v))} Groß-/Kleinschreibung</label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(leet, () => setLeet((v) => !v))} Leetspeak (a→@, e→3 …)</label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(permuteOrder, () => setPermuteOrder((v) => !v))} Reihenfolge variieren</label>
            </div>

            <div>
              <label className="form-label">Tippfehler-Modelle</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(typos.capslock, () => setTypos((t) => ({ ...t, capslock: !t.capslock })))} Caps-Lock</label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(typos.swap, () => setTypos((t) => ({ ...t, swap: !t.swap })))} Vertauschte Zeichen</label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(typos.delete, () => setTypos((t) => ({ ...t, delete: !t.delete })))} Zeichen vergessen</label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(typos.insert, () => setTypos((t) => ({ ...t, insert: !t.insert })))} Zeichen zu viel</label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer" }}>{cb(typos.replace, () => setTypos((t) => ({ ...t, replace: !t.replace })))} Falsches Zeichen</label>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-primary" onClick={preview} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Vorschau
              </button>
              <button className="btn btn-secondary" onClick={save} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Save size={16} /> Als Wortliste speichern
              </button>
              <button className="btn btn-secondary" onClick={saveKeyboardWalks} disabled={loading} title="Deutsche Tastatur-Walks (QWERTZ) als Wortliste speichern" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Keyboard size={16} /> QWERTZ-Walks
              </button>
              <button className="btn btn-secondary" onClick={saveMarkov} disabled={loading} title="Markov-Modell aus den Fragmenten + Funden → wahrscheinlichkeits-geordnete Wortliste" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Network size={16} /> Markov-Liste
              </button>
            </div>
            {msg && <div style={{ fontSize: "0.8125rem", color: msg.startsWith("✓") ? "var(--success-400)" : "var(--danger-400)" }}>{msg}</div>}
          </div>

          {/* Vorschau */}
          <div className="card" style={{ padding: "var(--space-lg)", height: "fit-content" }}>
            <h3 style={{ marginTop: 0, fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px" }}><ListChecks size={16} /> Kandidaten-Vorschau</h3>
            {!result ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>Noch keine Vorschau. Fragmente eingeben und auf Vorschau klicken.</p>
            ) : (
              <>
                <div style={{ fontSize: "1.75rem", fontWeight: 800 }}>
                  {result.capped ? "≥ " : ""}{result.count.toLocaleString("de-DE")}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "var(--space-md)" }}>Kandidaten{result.capped ? " (Limit erreicht — Suchraum einschränken)" : ""}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", maxHeight: "320px", overflowY: "auto" }}>
                  {result.sample.map((w, i) => (
                    <code key={i} style={{ fontSize: "0.75rem", padding: "3px 8px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", color: "var(--primary-400)" }}>{w}</code>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </motion.main>
    </div>
  );
}
