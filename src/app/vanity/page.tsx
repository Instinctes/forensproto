"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wand2, Loader2, ShieldAlert, KeyRound, Wallet, Copy, Check } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/context/I18nContext";

type AddrType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh";

const FIXED: Record<AddrType, string> = {
  p2pkh: "1",
  "p2sh-p2wpkh": "3",
  p2wpkh: "bc1q",
};

interface VanityResult {
  type: AddrType;
  address: string;
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  attempts: number;
}

interface VanityState {
  phase: "idle" | "searching" | "found" | "stopped" | "error";
  type: AddrType;
  prefix: string;
  attempts: number;
  expectedAttempts: number;
  startedAt: number;
  finishedAt?: number;
  result?: VanityResult;
  error?: string;
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: "4px 8px", minWidth: 0 }}
      title="Kopieren"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* ignore */
        }
      }}
    >
      {ok ? <Check size={14} style={{ color: "var(--success-500)" }} /> : <Copy size={14} />}
    </button>
  );
}

function Row({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ width: 130, flexShrink: 0, fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>
        {label}
      </span>
      <code className="mono" style={{ flex: 1, fontSize: "0.75rem", wordBreak: "break-all", color: danger ? "var(--danger-500)" : "var(--text-primary)" }}>
        {value}
      </code>
      <CopyBtn text={value} />
    </div>
  );
}

export default function VanityPage() {
  const { t } = useI18n();
  const [type, setType] = useState<AddrType>("p2pkh");
  const [prefix, setPrefix] = useState("1");
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [state, setState] = useState<VanityState | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; error?: string; expectedAttempts: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Sicherheits-Gegenprobe: eine fabrikneue Adresse MUSS unbenutzt sein.
  // Hat sie Guthaben/Historie, kennt jemand anders denselben Schlüssel
  // (Kollision) → Adresse darf nicht verwendet werden.
  const [onchain, setOnchain] = useState<{ checking: boolean; balance?: string; txCount?: number; active?: boolean; error?: string } | null>(null);

  const api = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    return fetch("/api/vanity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, type, prefix, caseSensitive, ...extra }),
    }).then((x) => x.json());
  }, [type, prefix, caseSensitive]);

  const refresh = useCallback(async () => {
    const r = await api("status");
    if (r.success) setState(r.state as VanityState | null);
  }, [api]);

  // Präfix live validieren (rein lokal serverseitig, kein Netzwerk nach außen)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void api("validate").then((r) => {
        if (!cancelled && r.success) setValidation({ ok: r.ok, error: r.error, expectedAttempts: r.expectedAttempts });
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const searching = state?.phase === "searching";
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => void refresh(), 700);
    return () => clearInterval(id);
  }, [searching, refresh]);

  // Nach einem Fund automatisch online gegenprüfen (einmalig je Adresse).
  const foundAddress = state?.phase === "found" ? state.result?.address : undefined;
  useEffect(() => {
    if (!foundAddress) return;
    let cancelled = false;
    setOnchain({ checking: true });
    void fetch("/api/onchain/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: [foundAddress] }),
    })
      .then((x) => x.json())
      .then((r) => {
        if (cancelled) return;
        const hit = r?.results?.[0];
        if (hit) setOnchain({ checking: false, balance: hit.balance, txCount: hit.txCount, active: hit.active, error: hit.error });
        else setOnchain({ checking: false, error: r?.error || "Keine Antwort" });
      })
      .catch(() => {
        if (!cancelled) setOnchain({ checking: false, error: "Netzwerkfehler" });
      });
    return () => {
      cancelled = true;
    };
  }, [foundAddress]);

  const start = async () => {
    setErr(null);
    setOnchain(null);
    const r = await api("start");
    if (r.success) setState(r.state as VanityState);
    else setErr(r.error || "Start fehlgeschlagen");
  };
  const stop = async () => {
    const r = await api("stop");
    if (r.success) setState(r.state as VanityState | null);
  };

  const onTypeChange = (nt: AddrType) => {
    setType(nt);
    setPrefix(FIXED[nt]);
  };

  const attemptsPerSec =
    state && state.attempts > 0
      ? Math.round(state.attempts / Math.max(1, ((state.finishedAt || Date.now()) - state.startedAt) / 1000))
      : 0;

  const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} Mrd.` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mio.` : n.toLocaleString("de-DE"));

  return (
    <div className="page-container">
      <Header title={t("vanity.title")} subtitle={t("vanity.subtitle")} />

      <motion.main
        className="content-area"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}
      >
        <div className="card" style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)" }}>
          <ShieldAlert size={18} style={{ color: "var(--warning-500)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--warning-600)" }}>{t("vanity.noticeBadge")}</strong>
            {" — "}
            {t("vanity.notice")}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 460px) minmax(0, 1fr)", gap: "var(--space-lg)", alignItems: "start" }} className="vanity-layout">
          {/* Steuerung */}
          <section className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-md)", fontSize: "0.95rem" }}>
              <Wand2 size={18} style={{ color: "var(--primary-400)" }} />
              {t("vanity.config")}
            </h3>

            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 6 }}>{t("vanity.addrType")}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {(["p2pkh", "p2sh-p2wpkh", "p2wpkh"] as AddrType[]).map((tt) => (
                <button
                  key={tt}
                  type="button"
                  className={`btn ${type === tt ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => onTypeChange(tt)}
                  disabled={searching}
                  style={{ padding: "6px 12px", fontSize: "0.8125rem" }}
                >
                  {tt === "p2pkh" ? "Legacy (1…)" : tt === "p2sh-p2wpkh" ? "P2SH (3…)" : "Bech32 (bc1q…)"}
                </button>
              ))}
            </div>

            <label className="form-label">{t("vanity.prefix")}</label>
            <input
              className="af-input form-input"
              value={prefix}
              onChange={(e) => setPrefix(type === "p2wpkh" ? e.target.value.toLowerCase() : e.target.value)}
              disabled={searching}
              spellCheck={false}
              autoComplete="off"
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.875rem", borderColor: validation && !validation.ok ? "var(--danger-500)" : undefined }}
            />
            <div style={{ marginTop: 6, fontSize: "0.6875rem", color: validation && !validation.ok ? "var(--danger-500)" : "var(--text-tertiary)" }}>
              {validation && !validation.ok
                ? validation.error
                : validation
                  ? `${t("vanity.expected")}: ~${fmt(validation.expectedAttempts)} ${t("vanity.attempts")}`
                  : ""}
            </div>

            {type !== "p2wpkh" && (
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={!caseSensitive} onChange={(e) => setCaseSensitive(!e.target.checked)} disabled={searching} style={{ width: 15, height: 15, accentColor: "var(--primary-500)" }} />
                {t("vanity.ignoreCase")}
              </label>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {!searching ? (
                <button type="button" className="btn btn-primary" onClick={start} disabled={!validation?.ok} style={{ padding: "7px 14px", fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Wand2 size={14} /> {t("vanity.start")}
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={stop} style={{ padding: "7px 14px", fontSize: "0.8125rem" }}>
                  {t("vanity.stop")}
                </button>
              )}
              {err && <span style={{ fontSize: "0.75rem", color: "var(--danger-500)" }}>{err}</span>}
            </div>

            {state && state.phase !== "idle" && (
              <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {searching && <Loader2 size={14} className="animate-spin" style={{ color: "var(--primary-400)" }} />}
                  <span>{t(`vanity.phase.${state.phase}`)}</span>
                  <span className="mono" style={{ marginLeft: "auto" }}>
                    {fmt(state.attempts)} {t("vanity.attempts")}
                    {attemptsPerSec > 0 && ` · ${fmt(attemptsPerSec)}/s`}
                  </span>
                </div>
                {state.error && <div style={{ marginTop: 6, color: "var(--danger-500)" }}>{state.error}</div>}
              </div>
            )}
          </section>

          {/* Ergebnis */}
          <section className="card" style={{ padding: "var(--space-lg)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-md)", fontSize: "0.95rem" }}>
              <Wallet size={18} style={{ color: "var(--success-500)" }} />
              {t("vanity.result")}
            </h3>

            {state?.result ? (
              <>
                <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "rgba(34,197,94,0.08)", border: "1px solid var(--success-500)", marginBottom: 12 }}>
                  <div style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 4 }}>
                    {t("vanity.foundAddress")} · {fmt(state.result.attempts)} {t("vanity.attempts")}
                  </div>
                  <code className="mono" style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--success-600)", wordBreak: "break-all" }}>
                    {state.result.address}
                  </code>
                </div>

                {/* Online-Gegenprobe: unbenutzt = sicher, benutzt = Kollision */}
                {onchain && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      marginBottom: 12,
                      fontSize: "0.8125rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: onchain.active ? "rgba(239,68,68,0.1)" : "var(--bg-secondary)",
                      border: `1px solid ${onchain.active ? "var(--danger-500)" : "var(--border-subtle)"}`,
                      color: onchain.active ? "var(--danger-600)" : "var(--text-secondary)",
                    }}
                  >
                    {onchain.checking ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> {t("vanity.onchainChecking")}
                      </>
                    ) : onchain.error ? (
                      <>⚠ {t("vanity.onchainError")}: {onchain.error}</>
                    ) : onchain.active ? (
                      <>
                        <ShieldAlert size={15} />
                        <strong>{t("vanity.onchainUsed")}</strong>
                        <span className="mono" style={{ marginLeft: "auto" }}>
                          {onchain.balance} BTC · {onchain.txCount} Tx
                        </span>
                      </>
                    ) : (
                      <>
                        <Check size={15} style={{ color: "var(--success-500)" }} />
                        {t("vanity.onchainClean")}
                      </>
                    )}
                  </div>
                )}

                <div style={{ padding: "4px 14px 10px", borderRadius: "var(--radius-md)", background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0 6px", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--danger-500)" }}>
                    <KeyRound size={12} /> {t("vanity.secret")}
                  </div>
                  <Row label="Private Key" value={state.result.privateKeyHex} danger />
                  <Row label="WIF (compr.)" value={state.result.wifCompressed} danger />
                  <Row label="WIF (uncompr.)" value={state.result.wifUncompressed} danger />
                  <Row label="Pubkey" value={state.result.publicKeyCompressed} />
                </div>

                <p style={{ marginTop: 12, fontSize: "0.75rem", color: "var(--warning-600)", lineHeight: 1.5 }}>
                  {t("vanity.backupWarning")}
                </p>
              </>
            ) : (
              <div style={{ padding: "var(--space-2xl)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
                {searching ? t("vanity.searching") : t("vanity.empty")}
              </div>
            )}
          </section>
        </div>
      </motion.main>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .vanity-layout {
            grid-template-columns: 1fr !important;
          }
        }
        .animate-spin {
          animation: vanity-spin 0.8s linear infinite;
        }
        @keyframes vanity-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
