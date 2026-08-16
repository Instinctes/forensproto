"use client";

import { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import {
  User,
  Bell,
  Palette,
  Key,
  Shield,
  Save,
  CheckCircle2,
  Upload,
  FolderOpen,
  FolderCog,
} from "lucide-react";

function NotificationToggle({ label, description, storageKey, defaultValue }: {
  label: string;
  description: string;
  storageKey: string;
  defaultValue: boolean;
}) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return defaultValue;
    const saved = localStorage.getItem(storageKey);
    return saved !== null ? saved === "true" : defaultValue;
  });

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(storageKey, String(next));
  };

  return (
    <div style={{ 
      background: "var(--bg-elevated)", padding: "16px", borderRadius: "12px", 
      border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" 
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>{label}</div>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{description}</div>
      </div>
      <button 
        onClick={toggle}
        style={{
          width: "44px", height: "24px", borderRadius: "12px", border: "none", cursor: "pointer",
          background: enabled ? "var(--primary-500)" : "rgba(100,116,139,0.2)",
          position: "relative", transition: "background 0.2s ease", flexShrink: 0, marginLeft: "16px"
        }}
      >
        <div style={{
          width: "18px", height: "18px", borderRadius: "50%", background: "#fff",
          position: "absolute", top: "3px", left: enabled ? "23px" : "3px",
          transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
        }} />
      </button>
    </div>
  );
}

interface DataDirInfo {
  dataDir: string;
  overridden: boolean;
  paths: { state: string; wordlists: string; rules: string; uploads: string };
  launchMode: "bundled" | "dev" | null;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dataDirInfo, setDataDirInfo] = useState<DataDirInfo | null>(null);
  const [revealStatus, setRevealStatus] = useState<"idle" | "opening" | "error">("idle");

  useEffect(() => {
    if (activeTab !== "storage" || dataDirInfo) return;
    fetch("/api/system/data-dir")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDataDirInfo(d);
      })
      .catch(() => {});
  }, [activeTab, dataDirInfo]);

  const revealInFinder = async (target?: "wordlists") => {
    setRevealStatus("opening");
    try {
      const res = await fetch("/api/system/data-dir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const d = await res.json();
      setRevealStatus(d.success ? "idle" : "error");
    } catch {
      setRevealStatus("error");
    }
  };

  const [userSettings, setUserSettings] = useState({
    firstName: "Local",
    lastName: "User",
    email: "",
    role: "Investigator",
    avatarData: "",
    theme: "light",
    apiMempool: "",
    apiEtherscan: "",
  });
  const [keyStatus, setKeyStatus] = useState<{
    mempoolConfigured: boolean;
    etherscanConfigured: boolean;
    mempoolMasked: string;
    etherscanMasked: string;
  } | null>(null);
  const [egressProbe, setEgressProbe] = useState<"unknown" | "online" | "offline">("unknown");

  useEffect(() => {
    const saved = localStorage.getItem("af_user_settings");
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserSettings(JSON.parse(saved));
    }
    // Server-seitige On-Chain-Keys laden (maskiert)
    fetch("/api/settings/onchain-keys")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setKeyStatus({
            mempoolConfigured: d.mempoolConfigured,
            etherscanConfigured: d.etherscanConfigured,
            mempoolMasked: d.mempoolMasked || "",
            etherscanMasked: d.etherscanMasked || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  // Echte Erreichbarkeit öffentlicher APIs (Air-Gap ehrlich anzeigen)
  useEffect(() => {
    if (activeTab !== "security") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        // health is local; probe egress via a short balance check to mempool
        const probe = await fetch("/api/onchain/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"] }),
          signal: AbortSignal.timeout(6000),
        });
        if (cancelled) return;
        if (probe.ok) setEgressProbe("online");
        else setEgressProbe(r.ok ? "online" : "unknown");
      } catch {
        if (!cancelled) setEgressProbe("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      localStorage.setItem("af_user_settings", JSON.stringify(userSettings));
      window.dispatchEvent(new Event("af_settings_changed"));
      // On-Chain-Keys serverseitig speichern — nur wenn neu eingegeben
      const keyPayload: Record<string, string> = {};
      if (userSettings.apiMempool.trim()) keyPayload.mempool = userSettings.apiMempool.trim();
      if (userSettings.apiEtherscan.trim()) keyPayload.etherscan = userSettings.apiEtherscan.trim();
      if (Object.keys(keyPayload).length > 0) {
        const keyRes = await fetch("/api/settings/onchain-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(keyPayload),
        }).then((r) => r.json());
        if (keyRes.success) {
          setKeyStatus({
            mempoolConfigured: keyRes.mempoolConfigured,
            etherscanConfigured: keyRes.etherscanConfigured,
            mempoolMasked: keyRes.mempoolMasked || "",
            etherscanMasked: keyRes.etherscanMasked || "",
          });
          setUserSettings((s) => ({ ...s, apiMempool: "", apiEtherscan: "" }));
        }
      }
    } catch (e) {
      console.error("Local storage / API-Keys speichern fehlgeschlagen:", e);
      alert("Speichern fehlgeschlagen. Bitte Speicherlimit/Netzwerk prüfen.");
    }
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) return;
        
        // Compress image using canvas before storing in localStorage
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 150;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7); // 70% quality JPEG
          setUserSettings(prev => ({...prev, avatarData: dataUrl}));
        };
        img.src = event.target.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <Header
        title="Einstellungen & Profil"
        subtitle="Verwalte dein ForensProto-Konto und die System-Präferenzen"
      />
      <main className="page-content" style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        
        {/* Settings Navigation */}
        <div className="card" style={{ width: "260px", padding: "16px", flexShrink: 0 }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "12px", padding: "0 12px" }}>
            Konto
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "24px" }}>
            <button 
              className={`btn ${activeTab === "profile" ? "btn-secondary" : ""}`} 
              onClick={() => setActiveTab("profile")}
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", border: "none", background: activeTab === "profile" ? "rgba(100,116,139,0.08)" : "transparent", boxShadow: "none", color: activeTab === "profile" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <User size={16} /> Profil
            </button>
            <button 
              className={`btn ${activeTab === "security" ? "btn-secondary" : ""}`} 
              onClick={() => setActiveTab("security")}
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", border: "none", background: activeTab === "security" ? "rgba(100,116,139,0.08)" : "transparent", boxShadow: "none", color: activeTab === "security" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <Shield size={16} /> Sicherheit
            </button>
            <button 
              className={`btn ${activeTab === "notifications" ? "btn-secondary" : ""}`} 
              onClick={() => setActiveTab("notifications")}
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", border: "none", background: activeTab === "notifications" ? "rgba(100,116,139,0.08)" : "transparent", boxShadow: "none", color: activeTab === "notifications" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <Bell size={16} /> Benachrichtigungen
            </button>
          </div>

          <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "12px", padding: "0 12px" }}>
            System
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <button 
              className={`btn ${activeTab === "appearance" ? "btn-secondary" : ""}`} 
              onClick={() => setActiveTab("appearance")}
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", border: "none", background: activeTab === "appearance" ? "rgba(100,116,139,0.08)" : "transparent", boxShadow: "none", color: activeTab === "appearance" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <Palette size={16} /> Erscheinungsbild
            </button>
            <button
              className={`btn ${activeTab === "api" ? "btn-secondary" : ""}`}
              onClick={() => setActiveTab("api")}
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", border: "none", background: activeTab === "api" ? "rgba(100,116,139,0.08)" : "transparent", boxShadow: "none", color: activeTab === "api" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <Key size={16} /> API-Schlüssel
            </button>
            <button
              className={`btn ${activeTab === "storage" ? "btn-secondary" : ""}`}
              onClick={() => setActiveTab("storage")}
              style={{ width: "100%", justifyContent: "flex-start", padding: "10px 12px", border: "none", background: activeTab === "storage" ? "rgba(100,116,139,0.08)" : "transparent", boxShadow: "none", color: activeTab === "storage" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <FolderCog size={16} /> Speicherort
            </button>
          </div>
        </div>

        {/* Settings Content */}
        <div className="card" style={{ flex: 1, padding: "32px", minHeight: "500px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                {activeTab === "profile" && "Profil-Einstellungen"}
                {activeTab === "security" && "Sicherheit & Zugang"}
                {activeTab === "notifications" && "Benachrichtigungen"}
                {activeTab === "appearance" && "Erscheinungsbild"}
                {activeTab === "api" && "API-Schlüssel"}
                {activeTab === "storage" && "Speicherort"}
              </h2>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                {activeTab === "profile" && "Verwalte deine persönlichen Informationen und Rolle."}
                {activeTab === "security" && "Passwort ändern und Zwei-Faktor-Authentifizierung (2FA)."}
                {activeTab === "notifications" && "Konfiguriere, worüber du benachrichtigt werden möchtest."}
                {activeTab === "appearance" && "Passe die Benutzeroberfläche an deine Bedürfnisse an."}
                {activeTab === "api" && "Verwalte externe API-Keys um Rate-Limits zu erhöhen."}
                {activeTab === "storage" && "Wo Wortlisten, Regeln und Fall-/Asservatdaten liegen."}
              </p>
            </div>
            
            <button 
              className="btn btn-primary" 
              onClick={handleSave}
              disabled={isSaving}
              style={{ minWidth: "140px", justifyContent: "center" }}
            >
              {isSaving ? (
                <>Speichern...</>
              ) : saved ? (
                <><CheckCircle2 size={16} /> Gespeichert</>
              ) : (
                <><Save size={16} /> Änderungen speichern</>
              )}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {activeTab === "profile" && (
              <>
                <div style={{ display: "flex", gap: "20px", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ 
                    width: "80px", height: "80px", borderRadius: "50%", 
                    background: userSettings.avatarData ? `url(${userSettings.avatarData}) center/cover` : "linear-gradient(135deg, var(--primary-100), var(--primary-300))", 
                    color: "var(--primary-600)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 700 
                  }}>
                    {!userSettings.avatarData && (userSettings.firstName[0] || "") + (userSettings.lastName[0] || "")}
                  </div>
                  <div>
                    <input 
                      type="file" 
                      accept="image/png, image/jpeg, image/gif"
                      style={{ display: "none" }} 
                      ref={fileInputRef}
                      onChange={handleAvatarChange}
                    />
                    <button className="btn btn-secondary" style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }} onClick={() => fileInputRef.current?.click()}>
                      <Upload size={14} /> Avatar ändern
                    </button>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Erlaubte Formate: JPG, PNG oder GIF (max. 5MB)</div>
                  </div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label className="form-label" style={{ display: "block", marginBottom: "8px" }}>Vorname</label>
                    <input type="text" className="form-input" value={userSettings.firstName} onChange={e => setUserSettings({...userSettings, firstName: e.target.value})} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label className="form-label" style={{ display: "block", marginBottom: "8px" }}>Nachname</label>
                    <input type="text" className="form-input" value={userSettings.lastName} onChange={e => setUserSettings({...userSettings, lastName: e.target.value})} style={{ width: "100%" }} />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label className="form-label" style={{ display: "block", marginBottom: "8px" }}>E-Mail Adresse</label>
                    <input type="email" className="form-input" value={userSettings.email} onChange={e => setUserSettings({...userSettings, email: e.target.value})} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label className="form-label" style={{ display: "block", marginBottom: "8px" }}>System Rolle</label>
                    <input type="text" className="form-input" value={userSettings.role} disabled style={{ width: "100%", opacity: 0.6, cursor: "not-allowed" }} />
                  </div>
                </div>
              </>
            )}

            {activeTab === "api" && (
              <>
                <div style={{ background: "var(--bg-elevated)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", backdropFilter: "blur(8px)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>Mempool.space API</div>
                    <span className={keyStatus?.mempoolConfigured ? "badge badge-success" : "badge badge-warning"}>
                      {keyStatus?.mempoolConfigured ? `Gespeichert ${keyStatus.mempoolMasked}` : "Optional / Free-Tier"}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Optional. BTC-Trace/Balance laufen auch ohne Key über die öffentliche API. Key wird serverseitig in{" "}
                    <code className="mono">.forensproto/</code> gespeichert und bei Requests mitgeschickt.
                  </p>
                  <input type="password" className="form-input" placeholder={keyStatus?.mempoolConfigured ? "Neuen Key eingeben (leer = behalten, leeren+speichern = löschen)" : "API Key (optional)"} value={userSettings.apiMempool} onChange={(e) => setUserSettings({...userSettings, apiMempool: e.target.value})} style={{ width: "100%", fontFamily: "monospace" }} />
                </div>
                
                <div style={{ background: "var(--bg-elevated)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", backdropFilter: "blur(8px)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>Etherscan API</div>
                    <span className={keyStatus?.etherscanConfigured ? "badge badge-success" : "badge badge-warning"}>
                      {keyStatus?.etherscanConfigured ? `Gespeichert ${keyStatus.etherscanMasked}` : "Nicht konfiguriert"}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Wird von Blockchain-Tracer, Balance-Check und Attribution für ETH wirklich verwendet (höhere Rate-Limits).
                  </p>
                  <input type="password" className="form-input" placeholder={keyStatus?.etherscanConfigured ? "Neuen Key eingeben…" : "Etherscan API Key"} value={userSettings.apiEtherscan} onChange={(e) => setUserSettings({...userSettings, apiEtherscan: e.target.value})} style={{ width: "100%", fontFamily: "monospace" }} />
                </div>
              </>
            )}

            {activeTab === "appearance" && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "12px", color: "var(--text-secondary)" }}>Theme</label>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <button onClick={() => setUserSettings({...userSettings, theme: "light"})} className="card" style={{ flex: 1, padding: "16px", border: userSettings.theme === "light" ? "2px solid var(--primary-400)" : "1px solid rgba(100,116,139,0.2)", background: "transparent", cursor: "pointer", textAlign: "center", opacity: userSettings.theme === "light" ? 1 : 0.6 }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #fff7f3, #faf7fc)", margin: "0 auto 12px", border: "1px solid rgba(0,0,0,0.1)" }}></div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>Light Pastel</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "4px" }}>{userSettings.theme === "light" ? "Aktiv" : "Auswählen"}</div>
                    </button>
                    <button onClick={() => setUserSettings({...userSettings, theme: "dark"})} className="card" style={{ flex: 1, padding: "16px", border: userSettings.theme === "dark" ? "2px solid var(--primary-400)" : "1px solid rgba(100,116,139,0.2)", background: "transparent", cursor: "pointer", textAlign: "center", opacity: userSettings.theme === "dark" ? 1 : 0.6 }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#0f172a", margin: "0 auto 12px", border: "1px solid rgba(255,255,255,0.1)" }}></div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>Dark Cyberpunk</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "4px" }}>{userSettings.theme === "dark" ? "Aktiv" : "Auswählen"}</div>
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "security" && (
              <>
                <div style={{ background: "var(--bg-elevated)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>Netzwerk / Air-Gap</div>
                    <span className={
                      egressProbe === "offline" ? "badge badge-success" :
                      egressProbe === "online" ? "badge badge-warning" : "badge"
                    }>
                      {egressProbe === "offline" && "Kein Internet-Egress (air-gapped)"}
                      {egressProbe === "online" && "Internet erreichbar"}
                      {egressProbe === "unknown" && "Prüfe…"}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    Status basiert auf einem echten Probe gegen öffentliche Blockchain-APIs.
                    On-Chain-Funktionen (Trace, Balance, Nonce-Scan) benötigen Internetzugang.
                    Recovery/Hashcat/Parser laufen vollständig offline.
                  </p>
                </div>

                <div style={{ background: "var(--bg-elevated)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: "12px" }}>Session-Information</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--text-tertiary)" }}>Aktuelle Session</span>
                      <span style={{ fontWeight: 600 }}>Aktiv</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--text-tertiary)" }}>Browser</span>
                      <span style={{ fontWeight: 600 }}>{typeof navigator !== "undefined" ? navigator.userAgent.split(" ").slice(-2).join(" ") : "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--text-tertiary)" }}>Plattform</span>
                      <span style={{ fontWeight: 600 }}>{typeof navigator !== "undefined" ? navigator.platform : "—"}</span>
                    </div>
                  </div>
                </div>

                <div style={{ background: "rgba(245, 158, 11, 0.04)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(245, 158, 11, 0.1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--warning-500)" }}>
                    <Shield size={16} />
                    <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Hinweis</span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    Authentifizierung und Passwortschutz sind für lokale Forensik-Instanzen deaktiviert. 
                    In Produktionsumgebungen sollte ein Reverse-Proxy mit mTLS eingesetzt werden.
                  </p>
                </div>
              </>
            )}

            {activeTab === "notifications" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <NotificationToggle 
                    label="Job abgeschlossen" 
                    description="Benachrichtigung wenn ein Recovery-Job erfolgreich beendet wurde."
                    storageKey="af_notify_job_done"
                    defaultValue={true}
                  />
                  <NotificationToggle 
                    label="Job-Fehler" 
                    description="Benachrichtigung bei Fehlern während der Hash-Extraktion oder des Cracking-Prozesses."
                    storageKey="af_notify_job_error"
                    defaultValue={true}
                  />
                  <NotificationToggle 
                    label="OSINT-Ergebnisse" 
                    description="Benachrichtigung wenn ein OSINT-Scan kritische Risiken identifiziert."
                    storageKey="af_notify_osint_critical"
                    defaultValue={false}
                  />
                  <NotificationToggle
                    label="System-Sounds"
                    description="Akustische Benachrichtigungen bei wichtigen Events abspielen."
                    storageKey="af_notify_sounds"
                    defaultValue={false}
                  />
                </div>
              </>
            )}

            {activeTab === "storage" && (
              <>
                <div style={{ background: "var(--bg-elevated)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>Aktueller Datenordner</div>
                    {dataDirInfo ? (
                      <span className={`badge ${dataDirInfo.overridden ? "badge-success" : "badge-warning"}`}>
                        {dataDirInfo.overridden ? "Eigener Ordner (Override aktiv)" : "Standard (Projektordner)"}
                      </span>
                    ) : (
                      <span className="badge">Lade…</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Server-Modus</div>
                    {dataDirInfo?.launchMode === "bundled" && (
                      <span className="badge badge-success">Nativ (gebündelter Server)</span>
                    )}
                    {dataDirInfo?.launchMode === "dev" && (
                      <span className="badge badge-warning">Entwicklungsmodus (Source-Ordner) — evtl. veralteter Prozess</span>
                    )}
                    {dataDirInfo && !dataDirInfo.launchMode && (
                      <span className="badge">Unbekannt (kein natives Launch-Signal, z. B. `npm run dev`)</span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "12px", lineHeight: 1.6 }}>
                    Hier liegen Wortlisten, eigene Hashcat-Regeln, die Fall-Datenbank, das Audit-Log und
                    Evidence-Blobs. Ohne Override liegt das im selben Ordner wie die App selbst
                    (der Ordner, aus dem sie gestartet wurde). Steht „Server-Modus“ auf
                    „Entwicklungsmodus“, obwohl du die native App erwartest: sehr wahrscheinlich hängt
                    noch ein alter Prozess auf Port 38217 — im Terminal <code>lsof -ti:38217</code>
                    prüfen und mit <code>kill -9</code> beenden, dann die App neu starten.
                  </p>
                  <div style={{ fontFamily: "monospace", fontSize: "0.8125rem", background: "rgba(100,116,139,0.08)", padding: "10px 12px", borderRadius: "8px", wordBreak: "break-all", marginBottom: "12px" }}>
                    {dataDirInfo?.dataDir || "…"}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn btn-secondary" onClick={() => revealInFinder()} disabled={revealStatus === "opening"} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <FolderOpen size={14} /> Im Finder öffnen
                    </button>
                    <button className="btn btn-secondary" onClick={() => revealInFinder("wordlists")} disabled={revealStatus === "opening"} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <FolderOpen size={14} /> Wortlisten-Ordner öffnen
                    </button>
                  </div>
                  {revealStatus === "error" && (
                    <p style={{ fontSize: "0.75rem", color: "var(--danger-500, #ef4444)", marginTop: "8px" }}>
                      Konnte den Ordner nicht öffnen (nur auf macOS verfügbar).
                    </p>
                  )}
                </div>

                <div style={{ background: "rgba(245, 158, 11, 0.04)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(245, 158, 11, 0.1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--warning-500)" }}>
                    <FolderCog size={16} />
                    <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Ordner ändern</span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "8px" }}>
                    Der Speicherort lässt sich nicht live in dieser Seite ändern (Node liest die
                    Umgebungsvariable nur beim Start). Stattdessen in <code>.env.local</code> setzen und
                    die App danach neu starten:
                  </p>
                  <div style={{ fontFamily: "monospace", fontSize: "0.8125rem", background: "rgba(100,116,139,0.08)", padding: "10px 12px", borderRadius: "8px" }}>
                    FORENSPROTO_DATA_DIR=/Users/dein-name/Library/Application Support/ForensProto
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "8px" }}>
                    Ohne diese Variable bleibt alles wie bisher im App-/Projektordner — reine
                    Opt-in-Änderung, kein automatisches Verschieben bestehender Daten.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
