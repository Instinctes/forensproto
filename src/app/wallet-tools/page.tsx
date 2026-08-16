"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Boxes, FileCode2, Combine, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/context/I18nContext";

export default function WalletToolsPage() {
  const { t } = useI18n();
  return (
    <div className="page-container">
      <Header title={t("wt.title")} subtitle={t("wt.subtitle")} />
      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        <MultisigTool />
        <DescriptorTool />
        <ShamirTool />
      </motion.main>
    </div>
  );
}

/* ───────────────────────── Multisig ───────────────────────── */
function MultisigTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"script" | "keys">("keys");
  const [script, setScript] = useState("");
  const [m, setM] = useState("2");
  const [pubkeys, setPubkeys] = useState("");
  const [available, setAvailable] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null); setRes(null);
    const body: Record<string, unknown> = {};
    if (mode === "script") body.script = script.trim();
    else { body.m = parseInt(m, 10); body.pubkeys = pubkeys.split(/[\s,]+/).filter(Boolean); }
    if (available.trim()) body.available = parseInt(available, 10);
    const r = await fetch("/api/wallet/multisig", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    if (r.success) setRes(r); else setErr(r.error || "Fehler");
  };

  return (
    <section className="card" style={{ padding: "var(--space-lg)" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}><Boxes size={18} style={{ color: "var(--primary-400)" }} /> {t("wt.ms.title")}</h3>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <button className={`btn ${mode === "keys" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("keys")}>{t("wt.ms.fromKeys")}</button>
        <button className={`btn ${mode === "script" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("script")}>{t("wt.ms.fromScript")}</button>
      </div>
      {mode === "keys" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <input className="af-input" placeholder={t("wt.ms.quorum")} value={m} onChange={(e) => setM(e.target.value)} style={{ width: "120px" }} />
            <input className="af-input" placeholder={t("wt.ms.availableKeys")} value={available} onChange={(e) => setAvailable(e.target.value)} style={{ flex: 1 }} />
          </div>
          <textarea className="af-input" rows={3} placeholder={t("wt.ms.pubkeys")} value={pubkeys} onChange={(e) => setPubkeys(e.target.value)} />
        </div>
      ) : (
        <textarea className="af-input" rows={3} placeholder={t("wt.ms.script")} value={script} onChange={(e) => setScript(e.target.value)} />
      )}
      <button className="btn btn-primary" onClick={run} style={{ marginTop: "8px" }}>{t("common.analyze")}</button>
      {err && <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem", marginTop: "8px" }}>{err}</div>}
      {res && (
        <div style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div><strong>{res.parsed.m}-of-{res.parsed.n}</strong> Multisig · {res.parsed.pubkeys.length} Pubkeys</div>
          <AddrRow label="P2SH" v={res.addresses.p2sh} />
          <AddrRow label="P2WSH" v={res.addresses.p2wsh} />
          <AddrRow label="P2SH-P2WSH" v={res.addresses.p2shP2wsh} />
          {res.recovery && (
            <div style={{ color: res.recovery.recoverable ? "var(--success-400)" : "var(--danger-400)" }}>{res.recovery.note}</div>
          )}
          {/* hinweis: serverseitige note */}
        </div>
      )}
    </section>
  );
}

function AddrRow({ label, v }: { label: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <span style={{ width: "100px", color: "var(--text-tertiary)", fontSize: "0.6875rem", textTransform: "uppercase" }}>{label}</span>
      <code className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{v}</code>
    </div>
  );
}

/* ───────────────────────── Descriptor ───────────────────────── */
function DescriptorTool() {
  const { t } = useI18n();
  const [desc, setDesc] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null); setRes(null);
    const r = await fetch("/api/wallet/descriptor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descriptor: desc.trim() }) }).then((x) => x.json());
    if (r.ok) setRes(r); else setErr(r.error || "Parse-Fehler");
  };

  return (
    <section className="card" style={{ padding: "var(--space-lg)" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}><FileCode2 size={18} style={{ color: "var(--primary-400)" }} /> {t("wt.desc.title")}</h3>
      <textarea className="af-input" rows={2} placeholder="z. B. sh(wsh(sortedmulti(2,[fp/48'/0'/0'/2']xpub.../0/*,xpub.../0/*,xpub.../0/*)))" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <button className="btn btn-primary" onClick={run} style={{ marginTop: "8px" }}>{t("common.parse")}</button>
      {err && <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem", marginTop: "8px" }}>{err}</div>}
      {res && (
        <div style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div><strong>{res.scriptType}</strong></div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", color: "var(--text-secondary)" }}>
            <span>{t("wt.desc.multisig")}: {res.isMultisig ? `${t("common.yes")} (${res.threshold}-of-${res.totalKeys})` : t("common.no")}</span>
            <span>{t("wt.desc.segwit")}: {res.isSegwit ? t("common.yes") : t("common.no")}</span>
            <span>{t("wt.desc.taproot")}: {res.isTaproot ? t("common.yes") : t("common.no")}</span>
            <span>{t("wt.desc.keys")}: {res.totalKeys}</span>
            <span style={{ color: res.hardwareLikely ? "var(--success-400)" : "var(--text-tertiary)" }}>{t("wt.desc.hwOrigin")}: {res.hardwareLikely ? t("wt.desc.detected") : "—"}</span>
          </div>
          {res.keys?.map((k: { key: string; origin?: { fingerprint: string; path: string }; path?: string }, i: number) => (
            <div key={i} className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", wordBreak: "break-all" }}>
              {k.origin ? `[${k.origin.fingerprint}/${k.origin.path}] ` : ""}{k.key}{k.path ? `/${k.path}` : ""}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Shamir ───────────────────────── */
function ShamirTool() {
  const { t } = useI18n();
  const [shares, setShares] = useState("");
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null); setRes(null); setLoading(true);
    try {
      const list = shares.split(/[\s,]+/).filter(Boolean);
      const r = await fetch("/api/wallet/shamir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "combine", shares: list }) }).then((x) => x.json());
      if (r.success) setRes(r); else setErr(r.error || "Fehler");
    } finally { setLoading(false); }
  };

  return (
    <section className="card" style={{ padding: "var(--space-lg)" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}><Combine size={18} style={{ color: "var(--primary-400)" }} /> {t("wt.shamir.title")}</h3>
      <textarea className="af-input" rows={3} placeholder={t("wt.shamir.shares")} value={shares} onChange={(e) => setShares(e.target.value)} />
      <button className="btn btn-primary" onClick={run} disabled={loading} style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />} {t("wt.shamir.combine")}
      </button>
      {err && <div style={{ color: "var(--danger-400)", fontSize: "0.8125rem", marginTop: "8px" }}>{err}</div>}
      {res && (
        <div style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ color: "var(--success-400)" }}>✓ {t("wt.shamir.reconstructed")}</div>
          <AddrRow label="hex" v={res.secretHex} />
          {res.secretUtf8 && <AddrRow label="utf-8" v={res.secretUtf8} />}
        </div>
      )}
    </section>
  );
}
