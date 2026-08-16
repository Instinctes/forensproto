"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { useI18n } from "@/context/I18nContext";
import type { Locale } from "@/lib/i18n";
import {
  LayoutDashboard,
  KeyRound,
  Globe,
  FlaskConical,
  Bot,
  Settings,
  Grid3X3,
  FileText,
  HardDrive,
  Image as ImageIcon,
  ScanSearch,
  Shield,
  Network,
  FolderKanban,
  Settings as SettingsIcon,
  Brain,
  ScanLine,
  ShieldCheck,
  Boxes,
  ChevronDown,
  Palette,
  Wand2,
  type LucideIcon,
} from "lucide-react";

interface NavLink {
  href: string;
  icon: LucideIcon;
  key: string; // i18n-Schlüssel
}
interface NavGroupDef {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  items: NavLink[];
}

const TOP_LINKS: NavLink[] = [
  { href: "/", icon: LayoutDashboard, key: "nav.dashboard" },
  { href: "/investigation", icon: Globe, key: "nav.investigation" },
];

const GROUPS: NavGroupDef[] = [
  {
    id: "recovery",
    labelKey: "nav.group.recovery",
    icon: KeyRound,
    items: [
      { href: "/recovery", icon: KeyRound, key: "nav.recoveryJobs" },
      { href: "/hint-recovery", icon: Brain, key: "nav.hintRecovery" },
      { href: "/distributed", icon: Network, key: "nav.distributed" },
    ],
  },
  {
    id: "forensics",
    labelKey: "nav.group.forensics",
    icon: FlaskConical,
    items: [
      { href: "/wallet-forensics", icon: Network, key: "nav.walletForensics" },
      { href: "/wallet-tools", icon: Boxes, key: "nav.walletTools" },
      { href: "/advanced-analysis", icon: FlaskConical, key: "nav.cryptoForensics" },
      { href: "/nonce-scan", icon: ScanLine, key: "nav.nonceScanner" },
      { href: "/visual-key", icon: Palette, key: "nav.visualKey" },
      { href: "/vanity", icon: Wand2, key: "nav.vanity" },
    ],
  },
  {
    id: "cases",
    labelKey: "nav.group.cases",
    icon: FolderKanban,
    items: [
      { href: "/cases", icon: FolderKanban, key: "nav.caseManagement" },
      { href: "/compliance", icon: ShieldCheck, key: "nav.compliance" },
      { href: "/audit-log", icon: Shield, key: "nav.auditLog" },
    ],
  },
  {
    id: "tools",
    labelKey: "nav.group.tools",
    icon: Grid3X3,
    items: [
      { href: "/doc-breaker", icon: FileText, key: "nav.docBreaker" },
      { href: "/file-carver", icon: HardDrive, key: "nav.fileCarver" },
      { href: "/stego", icon: ImageIcon, key: "nav.stego" },
      { href: "/memory-scan", icon: ScanSearch, key: "nav.memoryScan" },
      { href: "/extensions", icon: Grid3X3, key: "nav.extensions" },
    ],
  },
];

const BOTTOM_LINKS: NavLink[] = [
  { href: "/ai", icon: Bot, key: "nav.aiAssistant" },
  { href: "/admin", icon: SettingsIcon, key: "nav.administration" },
];

function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function NavItemLink({ item, pathname, label, indented }: { item: NavLink; pathname: string; label: string; indented?: boolean }) {
  const Icon = item.icon;
  const active = isActiveHref(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={`nav-item ${active ? "active" : ""}`}
      style={{ marginBottom: "2px", padding: indented ? "6px 16px 6px 30px" : "8px 16px" }}
    >
      <Icon className="nav-item-icon" size={indented ? 15 : 18} />
      <span className="nav-item-label" style={{ fontSize: indented ? "0.8125rem" : "0.875rem" }}>{label}</span>
    </Link>
  );
}

function NavGroup({
  group,
  pathname,
  open,
  onToggle,
  t,
}: {
  group: NavGroupDef;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  t: (k: string) => string;
}) {
  const Icon = group.icon;
  const hasActive = group.items.some((i) => isActiveHref(pathname, i.href));
  return (
    <div style={{ marginBottom: "2px" }}>
      <button
        onClick={onToggle}
        className="nav-item"
        style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "8px 16px", color: hasActive ? "var(--primary-300)" : "var(--text-secondary)" }}
      >
        <Icon className="nav-item-icon" size={18} />
        <span className="nav-item-label" style={{ fontSize: "0.875rem", fontWeight: 600 }}>{t(group.labelKey)}</span>
        <ChevronDown size={15} style={{ marginLeft: "auto", transition: "transform 0.2s", transform: open ? "rotate(0deg)" : "rotate(-90deg)", opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{ marginTop: "1px" }}>
          {group.items.map((item) => (
            <NavItemLink key={item.href} item={item} pathname={pathname} label={t(item.key)} indented />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { isSidebarOpen } = useSidebar();
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of GROUPS) init[g.id] = g.items.some((i) => isActiveHref(pathname, i.href));
    return init;
  });

  const [userProfile, setUserProfile] = useState({
    firstName: "Local",
    lastName: "User",
    role: "Investigator",
    avatarData: "",
    theme: "light",
  });

  const loadProfile = () => {
    const saved = localStorage.getItem("af_user_settings");
    if (saved) setUserProfile(JSON.parse(saved));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
    window.addEventListener("af_settings_changed", loadProfile);
    return () => window.removeEventListener("af_settings_changed", loadProfile);
  }, [pathname]);

  useEffect(() => {
    const activeGroup = GROUPS.find((g) => g.items.some((i) => isActiveHref(pathname, i.href)));
    if (activeGroup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenGroups((prev) => (prev[activeGroup.id] ? prev : { ...prev, [activeGroup.id]: true }));
    }
  }, [pathname]);

  const langBtn = (l: Locale, code: string) => (
    <button
      onClick={() => setLocale(l)}
      style={{
        flex: 1,
        padding: "5px 0",
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        cursor: "pointer",
        border: "1px solid var(--border-subtle)",
        background: locale === l ? "var(--primary-500)" : "transparent",
        color: locale === l ? "#fff" : "var(--text-tertiary)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {code}
    </button>
  );

  return (
    <aside className={`sidebar ${isSidebarOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand" style={{ padding: "16px 20px" }}>
        <Image
          src={userProfile.theme === "dark" ? "/dark_logo.png" : "/ForensProto_logo.png"}
          alt="ForensProto Logo"
          width={36}
          height={36}
          style={{ width: "36px", height: "auto", objectFit: "contain" }}
        />
        <div className="brand-text">
          <span className="brand-name">ForensProto</span>
          <span className="brand-tagline">{t("brand.tagline")}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {TOP_LINKS.map((item) => (
          <NavItemLink key={item.href} item={item} pathname={pathname} label={t(item.key)} />
        ))}

        <div style={{ height: "1px", background: "var(--border-subtle)", margin: "8px 16px" }} />

        {GROUPS.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            pathname={pathname}
            t={t}
            open={!!openGroups[group.id]}
            onToggle={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
          />
        ))}

        <div style={{ height: "1px", background: "var(--border-subtle)", margin: "8px 16px" }} />

        {BOTTOM_LINKS.map((item) => (
          <NavItemLink key={item.href} item={item} pathname={pathname} label={t(item.key)} />
        ))}

        {/* Sprachumschalter */}
        <div style={{ display: "flex", gap: "6px", padding: "8px 16px 4px" }}>
          {langBtn("de", "DE")}
          {langBtn("en", "EN")}
        </div>
      </nav>

      <div className="sidebar-footer">
        <Link href="/settings" className="sidebar-user" style={{ textDecoration: "none" }}>
          <div
            className="user-avatar"
            style={{
              background: userProfile.avatarData ? `url(${userProfile.avatarData}) center/cover` : "linear-gradient(135deg, var(--primary-100), var(--primary-300))",
              color: userProfile.avatarData ? "transparent" : "var(--primary-600)",
            }}
          >
            {!userProfile.avatarData && (userProfile.firstName[0] || "") + (userProfile.lastName[0] || "")}
          </div>
          <div className="user-info">
            <div className="user-name">{userProfile.firstName} {userProfile.lastName}</div>
            <div className="user-role">{userProfile.role}</div>
          </div>
          <Settings size={16} style={{ marginLeft: "auto", color: "var(--text-tertiary)" }} />
        </Link>
      </div>
    </aside>
  );
}
