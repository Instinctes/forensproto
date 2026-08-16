"use client";

import { Wifi, WifiOff } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/context/I18nContext";

type HealthChip = "online" | "degraded" | "offline";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

// Zentrale Routen → i18n-Schlüssel. So werden ALLE Seiten-Header übersetzt,
// ohne jede Seite einzeln anzufassen. Ohne Mapping: übergebene Props (Fallback).
const PATH_I18N: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "page.dashboard.title", subtitle: "page.dashboard.subtitle" },
  "/recovery": { title: "page.recovery.title", subtitle: "page.recovery.subtitle" },
  "/cases": { title: "page.cases.title", subtitle: "page.cases.subtitle" },
  "/hint-recovery": { title: "page.hintRecovery.title", subtitle: "page.hintRecovery.subtitle" },
  "/investigation": { title: "page.investigation.title", subtitle: "page.investigation.subtitle" },
  "/advanced-analysis": { title: "page.cryptoForensics.title", subtitle: "page.cryptoForensics.subtitle" },
  "/wallet-forensics": { title: "page.walletForensics.title", subtitle: "page.walletForensics.subtitle" },
  "/wallet-tools": { title: "wt.title", subtitle: "wt.subtitle" },
  "/extensions": { title: "page.extensions.title", subtitle: "page.extensions.subtitle" },
  "/doc-breaker": { title: "page.docBreaker.title", subtitle: "page.docBreaker.subtitle" },
  "/file-carver": { title: "page.fileCarver.title", subtitle: "page.fileCarver.subtitle" },
  "/stego": { title: "page.stego.title", subtitle: "page.stego.subtitle" },
  "/memory-scan": { title: "page.memoryScan.title", subtitle: "page.memoryScan.subtitle" },
  "/nonce-scan": { title: "page.nonceScan.title", subtitle: "page.nonceScan.subtitle" },
  "/distributed": { title: "dist.title", subtitle: "dist.subtitle" },
  "/compliance": { title: "compliance.title", subtitle: "compliance.subtitle" },
  "/audit-log": { title: "page.auditLog.title" }, // Untertitel dynamisch → Prop
  "/ai": { title: "page.ai.title", subtitle: "page.ai.subtitle" },
  "/ai-rules": { title: "page.aiRules.title", subtitle: "page.aiRules.subtitle" },
  "/osint": { title: "page.osint.title", subtitle: "page.osint.subtitle" },
  "/seed-recovery": { title: "page.seedRecovery.title", subtitle: "page.seedRecovery.subtitle" },
  "/admin": { title: "page.admin.title", subtitle: "page.admin.subtitle" },
  "/settings": { title: "page.settings.title", subtitle: "page.settings.subtitle" },
  "/gpu-cluster": { title: "page.gpuCluster.title", subtitle: "page.gpuCluster.subtitle" },
};

function HeaderContent({ title, subtitle }: HeaderProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const map = PATH_I18N[pathname];
  const shownTitle = map ? t(map.title) : title;
  const shownSubtitle = map?.subtitle ? t(map.subtitle) : subtitle;
  const [health, setHealth] = useState<HealthChip>("online");

  useEffect(() => {
    let mounted = true;
    const poll = () => {
      fetch("/api/health", { cache: "no-store" })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!mounted) return;
          if (!r.ok || body.status === "degraded") setHealth(r.ok ? "degraded" : "offline");
          else setHealth("online");
        })
        .catch(() => {
          if (mounted) setHealth("offline");
        });
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const chip =
    health === "online"
      ? { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.15)", color: "var(--success-400)", label: t("header.systemOnline") }
      : health === "degraded"
        ? { bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.25)", color: "var(--warning-500)", label: t("header.systemDegraded") }
        : { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.2)", color: "var(--danger-500)", label: t("header.systemOffline") };

  return (
    <header className="app-header">
      <div className="header-left">
        <div>
          <h1 className="page-title">{shownTitle}</h1>
          {shownSubtitle && <p className="page-subtitle">{shownSubtitle}</p>}
        </div>
      </div>
      <div className="header-right">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-full)",
            background: chip.bg,
            border: `1px solid ${chip.border}`,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: chip.color,
          }}
        >
          {health === "offline" ? <WifiOff size={12} /> : <Wifi size={12} />}
          {chip.label}
        </div>
      </div>
    </header>
  );
}

export default function Header(props: HeaderProps) {
  return (
    <Suspense fallback={<header className="app-header">Laden…</header>}>
      <HeaderContent {...props} />
    </Suspense>
  );
}
