"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  FolderKanban,
  Plus,
  ShieldCheck,
  ShieldAlert,
  FileDigit,
  FileText,
  FileCheck2,
  CalendarClock,
  Upload,
  ChevronRight,
  X,
  Clock,
  Scale,
} from "lucide-react";
import Header from "@/components/Header";

interface ChecklistItem { id: string; label: string; done: boolean; at?: number; by?: string }
interface CaseRecord {
  id: string;
  caseNumber: string;
  name: string;
  description: string;
  investigator: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  kind?: "standard" | "inheritance";
  beneficiary?: { name: string; relationship: string; legalBasis: string };
  inheritanceChecklist?: ChecklistItem[];
}
interface EvidenceRecord {
  id: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  md5: string;
  source: string;
  importedAt: number;
}
interface CustodyEvent {
  seq: number;
  timestamp: string;
  actor: string;
  action: string;
  note: string;
  hash: string;
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", investigator: "", description: "", kind: "standard", bName: "", bRel: "", bLegal: "" });
  const [custody, setCustody] = useState<{ id: string; events: CustodyEvent[]; valid: boolean } | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const verifyRef = useRef<HTMLInputElement>(null);
  const verifyTarget = useRef<string | null>(null);

  const loadCases = useCallback(async () => {
    const r = await fetch("/api/cases").then((x) => x.json());
    if (r.success) setCases(r.cases);
  }, []);

  const openCase = useCallback(async (c: CaseRecord) => {
    setSelected(c);
    setCustody(null);
    const r = await fetch(`/api/cases/${c.id}`).then((x) => x.json());
    if (r.success) setEvidence(r.evidence);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCases();
  }, [loadCases]);

  const createCase = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      investigator: form.investigator,
      description: form.description,
      kind: form.kind,
      beneficiary: form.kind === "inheritance" ? { name: form.bName, relationship: form.bRel, legalBasis: form.bLegal } : undefined,
    };
    const r = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((x) => x.json());
    if (r.success) {
      setShowNew(false);
      setForm({ name: "", investigator: "", description: "", kind: "standard", bName: "", bRel: "", bLegal: "" });
      await loadCases();
      openCase(r.case);
    }
  };

  const importEvidence = async (file: File) => {
    if (!selected) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("caseId", selected.id);
    fd.append("actor", selected.investigator || "system");
    const r = await fetch("/api/evidence", { method: "POST", body: fd }).then((x) => x.json());
    if (r.success) openCase(selected);
  };

  const viewCustody = async (ev: EvidenceRecord) => {
    const r = await fetch(`/api/evidence/${ev.id}/custody`).then((x) => x.json());
    if (r.success) setCustody({ id: ev.id, events: r.custody, valid: r.verification.valid });
  };

  const reVerifyEvidence = async (file: File) => {
    const id = verifyTarget.current;
    if (!id || !selected) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("actor", selected.investigator || "system");
    const r = await fetch(`/api/evidence/${id}/verify`, { method: "POST", body: fd }).then((x) => x.json());
    setVerifyMsg(r.success ? (r.match ? "✓ Integrität bestätigt (Hash stimmt überein)" : "✗ HASH-ABWEICHUNG – Asservat verändert!") : `✗ ${r.error}`);
    openCase(selected);
  };

  const downloadReport = (format: "pdf" | "json") => {
    if (!selected) return;
    window.open(`/api/cases/${selected.id}/report?format=${format}`, "_blank");
  };
  const downloadTimeline = () => {
    if (!selected) return;
    window.open(`/api/cases/${selected.id}/timeline?format=csv`, "_blank");
  };
  const downloadDossier = () => {
    if (!selected) return;
    // Signiertes, unabhängig prüfbares Fall-Dossier (Textbericht).
    window.open(`/api/cases/${selected.id}/dossier?format=text`, "_blank");
  };

  const toggleChecklist = async (itemId: string) => {
    if (!selected?.inheritanceChecklist) return;
    const updated = selected.inheritanceChecklist.map((it) =>
      it.id === itemId ? { ...it, done: !it.done, at: !it.done ? Date.now() : undefined, by: selected.investigator } : it
    );
    const r = await fetch(`/api/cases/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inheritanceChecklist: updated }),
    }).then((x) => x.json());
    if (r.success) setSelected(r.case);
  };

  const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`);
  const fmtDate = (ts: number | string) => new Date(ts).toLocaleString("de-DE");

  return (
    <div className="page-container">
      <Header title="Fallverwaltung" subtitle="Cases · Evidence Locker · Chain of Custody" />
      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "var(--space-lg)" }}>
          {/* Fallliste */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "10px" }}>
              <Plus size={16} /> Neuer Fall
            </button>
            {cases.length === 0 && (
              <div className="card" style={{ padding: "var(--space-lg)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>
                Noch keine Fälle angelegt.
              </div>
            )}
            {cases.map((c) => (
              <button key={c.id} onClick={() => openCase(c)} className="card"
                style={{
                  padding: "var(--space-md)", textAlign: "left", cursor: "pointer", border: "1px solid",
                  borderColor: selected?.id === c.id ? "var(--primary-400)" : "var(--border-subtle)",
                  display: "flex", alignItems: "center", gap: "10px",
                }}>
                <FolderKanban size={18} style={{ color: "var(--primary-400)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{c.caseNumber}</div>
                </div>
                <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
              </button>
            ))}
          </div>

          {/* Detailbereich */}
          <div>
            {!selected ? (
              <div className="card" style={{ padding: "var(--space-2xl)", textAlign: "center" }}>
                <FolderKanban size={48} style={{ color: "var(--text-muted)", margin: "0 auto var(--space-md)", opacity: 0.3 }} />
                <p style={{ color: "var(--text-tertiary)" }}>Wählen Sie einen Fall oder legen Sie einen neuen an.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
                <div className="card" style={{ padding: "var(--space-lg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "1.125rem" }}>{selected.name}</h2>
                      <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                        {selected.caseNumber} · Ermittler: {selected.investigator} · Status: {selected.status}
                      </p>
                      {selected.description && (
                        <p style={{ margin: "8px 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{selected.description}</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-md)", flexWrap: "wrap" }}>
                    <button className="btn btn-primary" onClick={() => downloadReport("pdf")}
                      style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <FileText size={14} /> Signierter PDF-Bericht
                    </button>
                    <button className="btn btn-secondary" onClick={() => downloadReport("json")}
                      style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <FileCheck2 size={14} /> Manifest (JSON)
                    </button>
                    <button className="btn btn-secondary" onClick={downloadTimeline}
                      style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <CalendarClock size={14} /> Timeline (CSV)
                    </button>
                    <button className="btn btn-primary" onClick={downloadDossier}
                      style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <FileCheck2 size={14} /> Signiertes Fall-Dossier
                    </button>
                  </div>
                </div>

                {/* Nachlass-/Erben-Modus */}
                {selected.kind === "inheritance" && (
                  <div className="card" style={{ padding: "var(--space-lg)", borderLeft: "3px solid var(--primary-400)" }}>
                    <h3 style={{ margin: "0 0 var(--space-sm)", fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Scale size={16} /> Nachlass-Recovery — Berechtigungsnachweis
                    </h3>
                    {selected.beneficiary && (selected.beneficiary.name || selected.beneficiary.relationship) && (
                      <p style={{ margin: "0 0 var(--space-md)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        Erbe/Berechtigt: <b>{selected.beneficiary.name || "—"}</b>
                        {selected.beneficiary.relationship && <> · {selected.beneficiary.relationship}</>}
                        {selected.beneficiary.legalBasis && <> · Grundlage: {selected.beneficiary.legalBasis}</>}
                      </p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(selected.inheritanceChecklist || []).map((it) => (
                        <label key={it.id} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.8125rem", cursor: "pointer", padding: "6px 10px", borderRadius: "var(--radius-sm)", background: it.done ? "rgba(16,185,129,0.08)" : "var(--bg-secondary)" }}>
                          <input type="checkbox" checked={it.done} onChange={() => toggleChecklist(it.id)} style={{ width: 16, height: 16 }} />
                          <span style={{ flex: 1, color: it.done ? "var(--success-400)" : "var(--text-primary)" }}>{it.label}</span>
                          {it.done && it.at && <span style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>{new Date(it.at).toLocaleDateString("de-DE")}</span>}
                        </label>
                      ))}
                    </div>
                    <p style={{ margin: "var(--space-md) 0 0", fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                      Jeder bestätigte Schritt wird im manipulationssicheren Audit-Trail protokolliert.
                    </p>
                  </div>
                )}

                {/* Evidence Locker */}
                <div className="card" style={{ padding: "var(--space-lg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                    <h3 style={{ margin: 0, fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px" }}>
                      <FileDigit size={16} /> Asservate ({evidence.length})
                    </h3>
                    <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}
                      style={{ padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Upload size={14} /> Asservat importieren
                    </button>
                    <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importEvidence(f); e.target.value = ""; }} />
                  </div>
                  {evidence.length === 0 ? (
                    <p style={{ color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>Noch keine Asservate gesichert.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {evidence.map((ev) => (
                        <div key={ev.id} className="card" style={{ padding: "var(--space-sm) var(--space-md)", background: "var(--bg-secondary)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{ev.fileName}</div>
                              <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                                SHA-256: {ev.sha256.slice(0, 32)}… · {fmtBytes(ev.fileSize)} · {ev.source}
                              </div>
                            </div>
                            <button className="btn btn-secondary" onClick={() => viewCustody(ev)}
                              style={{ padding: "4px 10px", fontSize: "0.6875rem" }}>
                              Chain of Custody
                            </button>
                            <button className="btn btn-secondary" title="Datei erneut hochladen und Hash prüfen"
                              onClick={() => { verifyTarget.current = ev.id; setVerifyMsg(null); verifyRef.current?.click(); }}
                              style={{ padding: "4px 10px", fontSize: "0.6875rem", display: "flex", alignItems: "center", gap: "5px" }}>
                              <FileCheck2 size={12} /> Integrität prüfen
                            </button>
                          </div>
                        </div>
                      ))}
                      <input ref={verifyRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) reVerifyEvidence(f); e.target.value = ""; }} />
                      {verifyMsg && (
                        <div style={{ marginTop: "6px", fontSize: "0.75rem", fontWeight: 600, color: verifyMsg.startsWith("✓") ? "var(--success-400)" : "var(--danger-400)" }}>
                          {verifyMsg}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Chain of Custody Detail */}
                {custody && (
                  <div className="card" style={{ padding: "var(--space-lg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                      <h3 style={{ margin: 0, fontSize: "0.9375rem" }}>Chain of Custody</h3>
                      <span style={{
                        display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "var(--radius-full)",
                        fontSize: "0.6875rem", fontWeight: 700,
                        background: custody.valid ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                        color: custody.valid ? "var(--success-400)" : "var(--danger-400)",
                      }}>
                        {custody.valid ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                        {custody.valid ? "Kette intakt" : "Manipulation erkannt"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {custody.events.map((e) => (
                        <div key={e.seq} style={{ display: "flex", gap: "var(--space-md)", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "4px", minWidth: "140px" }}>
                            <Clock size={10} /> {fmtDate(e.timestamp)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{e.action}</span>
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}> · {e.actor}</span>
                            {e.note && <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{e.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.main>

      {/* Neuer-Fall-Dialog */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowNew(false)}>
          <div className="card" style={{ padding: "var(--space-xl)", width: "440px", maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-lg)" }}>
              <h3 style={{ margin: 0 }}>Neuer Fall</h3>
              <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <input className="af-input" placeholder="Fallname *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="af-input" placeholder="Ermittler" value={form.investigator} onChange={(e) => setForm({ ...form, investigator: e.target.value })} />
              <textarea className="af-input" placeholder="Beschreibung" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div>
                <label className="form-label">Fall-Typ</label>
                <select className="af-input form-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={{ width: "100%" }}>
                  <option value="standard">Standard-Fall</option>
                  <option value="inheritance">Nachlass-/Erben-Fall</option>
                </select>
              </div>
              {form.kind === "inheritance" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", padding: "var(--space-md)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "6px" }}><Scale size={13} /> Berechtigte/r Erbe/in</div>
                  <input className="af-input" placeholder="Name des/der Berechtigten" value={form.bName} onChange={(e) => setForm({ ...form, bName: e.target.value })} />
                  <input className="af-input" placeholder="Beziehung (z.B. Sohn, Ehepartner)" value={form.bRel} onChange={(e) => setForm({ ...form, bRel: e.target.value })} />
                  <input className="af-input" placeholder="Rechtliche Grundlage (z.B. Erbschein Nr.)" value={form.bLegal} onChange={(e) => setForm({ ...form, bLegal: e.target.value })} />
                </div>
              )}
              <button className="btn btn-primary" onClick={createCase} disabled={!form.name.trim()} style={{ padding: "10px" }}>Fall anlegen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
