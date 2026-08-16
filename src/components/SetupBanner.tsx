"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

const DISMISS_KEY = "fp_setup_dismissed";

type Checks = {
  hashcat: boolean;
  hashcatLabel: string;
  wordlist: boolean;
  wordlistCount: number;
};

export default function SetupBanner() {
  const { t } = useI18n();
  const [checks, setChecks] = useState<Checks | null>(null);
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "1";
  });

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    (async () => {
      let hashcat = false;
      let hashcatLabel = "";
      let wordlist = false;
      let wordlistCount = 0;
      try {
        const sys = await fetch("/api/system").then((r) => r.json());
        const v = String(sys?.hardware?.software?.hashcat || "");
        hashcat = Boolean(v) && v !== "Not installed";
        hashcatLabel = hashcat ? v.split("\n")[0] : "";
      } catch {
        /* keep false */
      }
      try {
        const wl = await fetch("/api/wordlists").then((r) => r.json());
        const list = Array.isArray(wl?.wordlists) ? wl.wordlists : [];
        wordlistCount = list.length;
        wordlist = list.length > 0;
      } catch {
        /* keep false */
      }
      if (!cancelled) setChecks({ hashcat, hashcatLabel, wordlist, wordlistCount });
    })();
    return () => {
      cancelled = true;
    };
  }, [hidden]);

  if (hidden) return null;

  const ready = checks?.hashcat && checks?.wordlist;
  return (
    <div
      className="card"
      style={{
        marginBottom: "var(--space-xl)",
        padding: "16px 20px",
        border: ready
          ? "1px solid rgba(16, 185, 129, 0.25)"
          : "1px solid rgba(245, 158, 11, 0.35)",
        background: ready ? "rgba(16, 185, 129, 0.04)" : "rgba(245, 158, 11, 0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {ready ? (
          <CheckCircle2 size={18} style={{ color: "var(--success-500)", marginTop: 2, flexShrink: 0 }} />
        ) : (
          <AlertTriangle size={18} style={{ color: "var(--warning-500)", marginTop: 2, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: "0.9rem", marginBottom: 6 }}>
            {t("setup.title")}
          </div>
          <p style={{ margin: "0 0 10px", fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
            {t("setup.legal")}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <li>
              {checks == null
                ? t("setup.checking")
                : checks.hashcat
                  ? t("setup.hashcatOk", { v: checks.hashcatLabel })
                  : t("setup.hashcatMissing")}
            </li>
            <li>
              {checks == null
                ? t("setup.checking")
                : checks.wordlist
                  ? t("setup.wordlistOk", { n: checks.wordlistCount })
                  : t("setup.wordlistMissing")}
            </li>
          </ul>
          <div style={{ marginTop: 10, fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
            {t("setup.docs")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setHidden(true);
          }}
          aria-label={t("setup.dismiss")}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
