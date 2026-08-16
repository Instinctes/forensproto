"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, FilePlus2, Ban, ScanSearch, BadgeCheck, Download, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/context/I18nContext";

interface Control { id: string; label: string; ok: boolean; note: string }
interface AuthSummary { total: number; active: number; revoked: number; expired: number; sanctionsHits: number; chainValid: boolean; sanctionsListPresent: boolean; sanctionsListEntries: number }
interface ComplianceStatus {
  config: { authorizationEnforced: boolean; authEnforced: boolean; jobRetentionDays: number };
  controls: Control[];
  authorizations: AuthSummary;
}
interface SanctionsResult { screened: boolean; listPresent: boolean; listEntries: number; clear: boolean; matches: Array<{ list: string; value: string; matchedOn: string }> }
interface Authorization {
  id: string; caseId?: string; legalBasis: string; reference: string; subject: string;
  authorizedByName: string; attestation: string; subjectConsent: boolean;
  status: string; createdAt: number; expiresAt: number | null; sanctions: SanctionsResult;
}
interface ValCase { id: string; category: string; standard: string; expected: string; actual: string; pass: boolean }
interface ValReport { version: string; nodeVersion: string; generatedAt: string; cases: ValCase[]; summary: { total: number; passed: number; failed: number; errorRate: number; valid: boolean } }

const EMPTY_FORM = { caseId: "", legalBasis: "owner-data", reference: "", subject: "", attestation: "", subjectConsent: false, expiresInDays: "" };

export default function CompliancePage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [screen, setScreen] = useState({ name: "", address: "" });
  const [screenResult, setScreenResult] = useState<SanctionsResult | null>(null);
  const [report, setReport] = useState<ValReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await fetch("/api/compliance").then((r) => r.json()).catch(() => null);
    if (s?.success) setStatus(s);
    const a = await fetch("/api/compliance/authorizations").then((r) => r.json()).catch(() => null);
    if (a?.success) { setAuths(a.authorizations); setLabels(a.legalBases); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const createAuth = async () => {
    setMsg(null);
    if (!form.subject.trim() || !form.attestation.trim()) {
      setMsg({ ok: false, text: t("compliance.subjectRequired") });
      return;
    }
    const body: Record<string, unknown> = {
      legalBasis: form.legalBasis,
      reference: form.reference,
      subject: form.subject,
      attestation: form.attestation,
      subjectConsent: form.subjectConsent,
    };
    if (form.caseId.trim()) body.caseId = form.caseId.trim();
    const days = parseInt(form.expiresInDays, 10);
    if (Number.isFinite(days) && days > 0) body.expiresAt = Date.now() + days * 86_400_000;

    const r = await fetch("/api/compliance/authorizations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((x) => x.json());
    if (r.success) {
      setMsg({ ok: r.sanctionsClear, text: r.sanctionsClear ? `✓ Autorisierung ${r.authorization.id} erteilt (Sanktions-Check sauber)` : `⚠ Autorisierung erstellt, aber SANKTIONSTREFFER — Recovery bleibt blockiert` });
      setForm({ ...EMPTY_FORM });
      load();
    } else {
      setMsg({ ok: false, text: `✗ ${r.error}` });
    }
  };

  const revoke = async (id: string) => {
    const reason = window.prompt(t("compliance.revokePrompt")) || "";
    const r = await fetch(`/api/compliance/authorizations/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    }).then((x) => x.json());
    if (r.success) load();
  };

  const runScreen = async () => {
    setScreenResult(null);
    const r = await fetch("/api/compliance/authorizations/screen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: screen.name, address: screen.address }),
    }).then((x) => x.json());
    if (r.success) setScreenResult(r);
  };

  const runValidation = async () => {
    setBusy(true);
    setReport(null);
    const r = await fetch("/api/validation").then((x) => x.json()).catch(() => null);
    if (r?.success) setReport(r.report);
    setBusy(false);
  };

  const badge = (ok: boolean) => (
    ok ? <CheckCircle2 size={15} style={{ color: "var(--success-400)" }} /> : <XCircle size={15} style={{ color: "var(--danger-400)" }} />
  );

  return (
    <div className="page-container">
      <Header title={t("compliance.title")} subtitle={t("compliance.subtitle")} />
      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

        {/* Status */}
        <section className="card" style={{ padding: "var(--space-lg)" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}>
            <ShieldCheck size={18} style={{ color: "var(--primary-400)" }} /> {t("compliance.statusTitle")}
          </h3>
          {!status ? (
            <div style={{ color: "var(--text-muted)" }}>{t("common.loading")}</div>
          ) : (
            <>
              {!status.config.authorizationEnforced && (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "var(--warning-400)", marginBottom: "var(--space-md)", fontSize: "0.8125rem" }}>
                  <ShieldAlert size={16} /> {t("compliance.enforcementOff")}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
                {status.controls.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    {badge(c.ok)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{t(`control.${c.id}`) !== `control.${c.id}` ? t(`control.${c.id}`) : c.label}</div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{c.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Validierung */}
        <section className="card" style={{ padding: "var(--space-lg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "var(--space-md)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <BadgeCheck size={18} style={{ color: "var(--success-400)" }} /> {t("compliance.validationTitle")}
            </h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-secondary" onClick={runValidation} disabled={busy}>{busy ? t("common.loading") : t("compliance.runValidation")}</button>
              <a className="btn btn-primary" href="/api/validation?format=pdf" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Download size={14} /> {t("compliance.pdfReport")}</a>
            </div>
          </div>
          {report && (
            <>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "var(--space-sm)", fontSize: "0.8125rem" }}>
                <span>{t("compliance.passed")}: <strong style={{ color: "var(--success-400)" }}>{report.summary.passed}/{report.summary.total}</strong></span>
                <span>{t("compliance.errorRate")}: <strong style={{ color: report.summary.errorRate === 0 ? "var(--success-400)" : "var(--danger-400)" }}>{(report.summary.errorRate * 100).toFixed(2)} %</strong></span>
                <span>{t("compliance.verdict")}: <strong style={{ color: report.summary.valid ? "var(--success-400)" : "var(--danger-400)" }}>{report.summary.valid ? t("compliance.validated") : t("compliance.notValidated")}</strong></span>
                <span style={{ color: "var(--text-tertiary)" }}>v{report.version} · Node {report.nodeVersion}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "8px" }}>
                {report.cases.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: "8px", alignItems: "center", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                    {badge(c.pass)}
                    <div style={{ fontSize: "0.75rem" }}>
                      <span style={{ fontWeight: 600 }}>{c.category}</span> · {c.standard}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "var(--space-lg)" }}>
          {/* Autorisierung erteilen */}
          <section className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}>
              <FilePlus2 size={18} style={{ color: "var(--primary-400)" }} /> {t("compliance.grantTitle")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label className="form-label">{t("compliance.legalBasis")}</label>
              <select className="input" value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })}>
                {Object.keys(labels).map((k) => <option key={k} value={k}>{t(`legalBasis.${k}`) !== `legalBasis.${k}` ? t(`legalBasis.${k}`) : labels[k]}</option>)}
              </select>
              <input className="input" placeholder={t("compliance.reference")} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              <input className="input" placeholder={t("compliance.subject")} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <textarea className="input" placeholder={t("compliance.attestation")} rows={2} value={form.attestation} onChange={(e) => setForm({ ...form, attestation: e.target.value })} />
              <div style={{ display: "flex", gap: "8px" }}>
                <input className="input" placeholder={t("compliance.caseId")} value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} style={{ flex: 1 }} />
                <input className="input" placeholder={t("compliance.validDays")} value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })} style={{ width: "110px" }} />
              </div>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={form.subjectConsent} onChange={(e) => setForm({ ...form, subjectConsent: e.target.checked })} />
                {t("compliance.consent")}
              </label>
              <button className="btn btn-primary" onClick={createAuth}>{t("compliance.grant")}</button>
              {msg && <div style={{ fontSize: "0.8125rem", color: msg.ok ? "var(--success-400)" : "var(--danger-400)" }}>{msg.text}</div>}
            </div>
          </section>

          {/* Sanktions-Screening */}
          <section className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}>
              <ScanSearch size={18} style={{ color: "var(--warning-400)" }} /> {t("compliance.screenTitle")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input className="input" placeholder={t("compliance.name")} value={screen.name} onChange={(e) => setScreen({ ...screen, name: e.target.value })} />
              <input className="input" placeholder={t("compliance.address")} value={screen.address} onChange={(e) => setScreen({ ...screen, address: e.target.value })} />
              <button className="btn btn-secondary" onClick={runScreen}>{t("compliance.screen")}</button>
              {screenResult && (
                <div style={{ fontSize: "0.8125rem", marginTop: "4px" }}>
                  {!screenResult.listPresent && <div style={{ color: "var(--warning-400)" }}>⚠ {t("compliance.noList")}</div>}
                  {screenResult.clear ? (
                    <div style={{ color: "var(--success-400)" }}>✓ {t("compliance.noHits", { n: screenResult.listEntries })}</div>
                  ) : (
                    <div style={{ color: "var(--danger-400)" }}>
                      ✗ {t("compliance.hits", { n: screenResult.matches.length })}
                      <ul style={{ margin: "4px 0 0 16px" }}>
                        {screenResult.matches.map((m, i) => <li key={i}>{m.value} <span style={{ color: "var(--text-tertiary)" }}>({m.matchedOn}, {m.list})</span></li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Autorisierungs-Liste */}
        <section className="card" style={{ padding: "var(--space-lg)" }}>
          <h3 style={{ marginBottom: "var(--space-md)" }}>{t("compliance.listTitle", { n: auths.length })}</h3>
          {auths.length === 0 ? (
            <div style={{ color: "var(--text-muted)" }}>{t("compliance.noAuths")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {auths.map((a) => {
                const expired = a.expiresAt && Date.now() > a.expiresAt;
                const effId = a.status === "revoked" ? "revoked" : expired ? "expired" : "active";
                const eff = t(`compliance.status${effId.charAt(0).toUpperCase() + effId.slice(1)}`);
                const color = effId === "active" && a.sanctions.clear ? "var(--success-400)" : effId === "active" ? "var(--danger-400)" : "var(--warning-400)";
                return (
                  <div key={a.id} style={{ borderLeft: `3px solid ${color}`, background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{t(`legalBasis.${a.legalBasis}`) !== `legalBasis.${a.legalBasis}` ? t(`legalBasis.${a.legalBasis}`) : (labels[a.legalBasis] || a.legalBasis)} · {a.subject}</div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        Ref: {a.reference || "—"} · von {a.authorizedByName} · {new Date(a.createdAt).toLocaleString("de-DE")}
                        {a.caseId ? ` · Fall ${a.caseId}` : ""} {a.expiresAt ? ` · gültig bis ${new Date(a.expiresAt).toLocaleDateString("de-DE")}` : ""}
                      </div>
                      <div style={{ fontSize: "0.6875rem", marginTop: "2px" }}>
                        <span style={{ color }}>{eff.toUpperCase()}</span>
                        {" · "}
                        <span style={{ color: a.sanctions.clear ? "var(--success-400)" : "var(--danger-400)" }}>
                          {a.sanctions.clear ? t("compliance.sanctionsClean") : t("compliance.sanctionsHit", { n: a.sanctions.matches.length })}
                        </span>
                      </div>
                    </div>
                    {a.status !== "revoked" && (
                      <button className="btn btn-ghost" onClick={() => revoke(a.id)} title="Widerrufen" style={{ color: "var(--danger-400)", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Ban size={14} /> {t("common.revoke")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </motion.main>
    </div>
  );
}
