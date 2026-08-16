"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Globe,
  MapPin,
  Mail,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  History,
  Trash2,
  Loader2,
  Server,
  Activity,
  Lock,
  Unlock,
  Network,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Wifi,
  Fingerprint,
  AtSign,
  Info,
} from "lucide-react";
import Header from "@/components/Header";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

interface OSINTResult {
  success: boolean;
  type: "ip" | "domain" | "email";
  query: string;
  results: {
    riskScore: number;
    [key: string]: unknown;
  };
  error?: string;
}

interface HistoryItem {
  id: string;
  query: string;
  type: string;
  timestamp: number;
}

/* ─────────────────────────────────────────────────────────────
   Page Component
   ───────────────────────────────────────────────────────────── */

export default function OSINTPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OSINTResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("af_osint_history");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveToHistory = (q: string, type: string) => {
    const newItem: HistoryItem = { id: Math.random().toString(36).substr(2, 9), query: q, type, timestamp: Date.now() };
    const updated = [newItem, ...history].slice(0, 20);
    setHistory(updated);
    localStorage.setItem("af_osint_history", JSON.stringify(updated));
  };

  const clearHistory = () => { setHistory([]); localStorage.removeItem("af_osint_history"); };

  const handleAnalyze = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/osint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await response.json();
      setResults(data);
      if (data.success) saveToHistory(searchQuery, data.type);
    } catch (error) {
      console.error("OSINT error:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getRiskColor = (score: number) => {
    if (score < 30) return "var(--success-400)";
    if (score < 70) return "var(--warning-400)";
    return "var(--danger-400)";
  };

  const getRiskLabel = (score: number) => {
    if (score < 20) return "SICHER";
    if (score < 40) return "GERING";
    if (score < 60) return "MITTEL";
    if (score < 80) return "HOCH";
    return "KRITISCH";
  };

  return (
    <div className="page-container">
      <Header
        title="OSINT Analyzer"
        subtitle="Open Source Intelligence — Vollständige Analyse von IPs, Domains & E-Mails"
      />

      <motion.main className="content-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-xl)", alignItems: "start" }}>

          {/* Main Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

            {/* Search Bar */}
            <div className="card" style={{ padding: "var(--space-xl)", background: "linear-gradient(135deg, var(--bg-surface), var(--bg-hover))" }}>
              <div style={{ position: "relative", display: "flex", gap: "var(--space-md)" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={20} style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                  <input
                    type="text"
                    className="af-input"
                    placeholder="IP, Domain oder E-Mail-Adresse eingeben..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    style={{ padding: "16px 16px 16px 48px", fontSize: "1rem", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleAnalyze()}
                  disabled={loading || !query.trim()}
                  style={{ padding: "0 32px", borderRadius: "16px", fontWeight: 600, fontSize: "0.9375rem" }}
                >
                  {loading ? <Loader2 className="spin" size={20} /> : "Deep Scan"}
                </button>
              </div>
            </div>

            {/* Results */}
            <AnimatePresence mode="wait">
              {results?.success ? (
                <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

                  {/* Result Header */}
                  <div className="card" style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                      <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(var(--primary-rgb), 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-400)" }}>
                        {results.type === "ip" && <Server size={24} />}
                        {results.type === "domain" && <Globe size={24} />}
                        {results.type === "email" && <Mail size={24} />}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>{results.query}</h2>
                          <button onClick={() => copyToClipboard(results.query, "query")} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px" }}>
                            {copiedField === "query" ? <Check size={14} style={{ color: "var(--success-400)" }} /> : <Copy size={14} />}
                          </button>
                        </div>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                          {results.type === "ip" ? "IP-Adresse" : results.type === "domain" ? "Domain" : "E-Mail"} — Deep Scan
                        </p>
                      </div>
                    </div>
                    {/* Risk Circle */}
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                      <div style={{ width: "64px", height: "64px", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${getRiskColor(results.results.riskScore)}12`, border: `3px solid ${getRiskColor(results.results.riskScore)}` }}>
                        <span style={{ fontSize: "1.25rem", fontWeight: 800, color: getRiskColor(results.results.riskScore), lineHeight: 1 }}>{results.results.riskScore}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>RISIKO</div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: getRiskColor(results.results.riskScore) }}>{getRiskLabel(results.results.riskScore)}</div>
                      </div>
                    </div>
                  </div>

                  {/* ══════════════════════ IP RESULTS ══════════════════════ */}
                  {results.type === "ip" && <IPResults data={results.results} riskColor={getRiskColor} />}

                  {/* ══════════════════════ DOMAIN RESULTS ══════════════════════ */}
                  {results.type === "domain" && <DomainResults data={results.results} copy={copyToClipboard} copied={copiedField} riskColor={getRiskColor} />}

                  {/* ══════════════════════ EMAIL RESULTS ══════════════════════ */}
                  {results.type === "email" && <EmailResults data={results.results} copy={copyToClipboard} copied={copiedField} riskColor={getRiskColor} />}

                </motion.div>
              ) : results?.error ? (
                <div className="card" style={{ padding: "var(--space-2xl)", textAlign: "center" }}>
                  <AlertTriangle size={40} style={{ color: "var(--danger-400)", margin: "0 auto var(--space-md)" }} />
                  <p style={{ color: "var(--danger-400)" }}>{results.error}</p>
                </div>
              ) : (
                <div className="card" style={{ height: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-md)", color: "var(--text-tertiary)", opacity: 0.6 }}>
                  <Globe size={64} strokeWidth={1} style={{ opacity: 0.2 }} />
                  <p style={{ fontSize: "0.9375rem" }}>IP, Domain oder E-Mail eingeben für Deep-Analyse...</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}><History size={16} /> Verlauf</h3>
                {history.length > 0 && (
                  <button onClick={clearHistory} style={{ background: "none", border: "none", color: "var(--danger-400)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Trash2 size={12} /> Löschen
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {history.length > 0 ? history.map((item) => (
                  <button key={item.id} onClick={() => { setQuery(item.query); handleAnalyze(item.query); }} className="nav-item" style={{ textAlign: "left", padding: "8px 12px", fontSize: "0.8125rem", background: "none", border: "none", width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.query}</span>
                      <span style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", opacity: 0.8, marginLeft: "8px" }}>{item.type.toUpperCase()}</span>
                    </div>
                  </button>
                )) : (
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0" }}>Noch keine Abfragen.</p>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: "var(--space-lg)", background: "rgba(var(--primary-rgb), 0.05)", border: "1px solid rgba(var(--primary-rgb), 0.1)" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-sm)", color: "var(--primary-400)" }}>Analyse-Umfang</h3>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
                <li><strong>IP:</strong> Geo, Reverse-DNS, Blacklists (4 DNSBL), Proxy/VPN/Cloud Detection</li>
                <li><strong>Domain:</strong> A/AAAA/MX/NS/TXT/SOA/CNAME, SPF/DKIM/DMARC, TLS-Zertifikat, Security-Headers, Subdomain-Scan, Tech-Stack</li>
                <li><strong>Email:</strong> Syntax, Provider, MX-Check, Gravatar, Disposable-Check, Domain-DNS & Security</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IP Results Component
   ═══════════════════════════════════════════════════════════════ */

function IPResults({ data, riskColor }: { data: AnyData; riskColor: (s: number) => string }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        {/* Geolocation */}
        <Section title="Geolocation" icon={<MapPin size={16} />}>
          <DetailRow label="Land" value={`${data.country} (${data.countryCode})`} />
          <DetailRow label="Region" value={data.region} />
          <DetailRow label="Stadt" value={data.city} />
          <DetailRow label="PLZ" value={data.zip} />
          <DetailRow label="Koordinaten" value={`${data.lat}, ${data.lon}`} mono />
          <DetailRow label="Zeitzone" value={data.timezone} />
        </Section>

        {/* Network */}
        <Section title="Netzwerk" icon={<Network size={16} />}>
          <DetailRow label="ISP" value={data.isp} />
          <DetailRow label="Organisation" value={data.org} />
          <DetailRow label="AS-Nummer" value={data.as} mono />
          <DetailRow label="AS-Name" value={data.asName} />
          <DetailRow label="Reverse DNS" value={data.reverseDns} mono />
          <DetailRow label="Nutzungstyp" value={data.usageType} color="var(--primary-300)" />
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        {/* Flags */}
        <Section title="Erkennung" icon={<Fingerprint size={16} />}>
          <FlagRow label="Mobilfunk" value={data.isMobile} />
          <FlagRow label="Proxy / VPN" value={data.isProxy} danger />
          <FlagRow label="Hosting / DCN" value={data.isHosting} />
        </Section>

        {/* Blacklists */}
        <Section title="Blacklist-Prüfung" icon={<ShieldAlert size={16} />}>
          <div style={{ marginBottom: "var(--space-sm)" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: data.blacklists?.some((b: AnyData) => b.listed) ? "var(--danger-400)" : "var(--success-400)" }}>
              {data.blacklistCount} gelistet
            </span>
          </div>
          {data.blacklists?.map((bl: AnyData, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: "0.75rem" }}>
              <span className="mono" style={{ color: "var(--text-secondary)" }}>{bl.list}</span>
              {bl.listed ? <XCircle size={14} style={{ color: "var(--danger-400)" }} /> : <CheckCircle2 size={14} style={{ color: "var(--success-400)" }} />}
            </div>
          ))}
        </Section>
      </div>

      {/* Risk Bar */}
      <RiskBar score={data.riskScore} color={riskColor(data.riskScore)} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Domain Results Component
   ═══════════════════════════════════════════════════════════════ */

function DomainResults({ data, copy, copied, riskColor }: { data: AnyData; copy: (t: string, id: string) => void; copied: string | null; riskColor: (s: number) => string }) {
  return (
    <>
      {/* DNS Records */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        <Section title="DNS Records" icon={<Server size={16} />}>
          <RecordBox label="A (IPv4)" values={data.aRecords} copy={copy} copied={copied} />
          <RecordBox label="AAAA (IPv6)" values={data.aaaaRecords} copy={copy} copied={copied} />
          <RecordBox label="MX (Mail)" values={data.mxRecords} copy={copy} copied={copied} />
          <RecordBox label="NS (Nameserver)" values={data.nsRecords} copy={copy} copied={copied} />
          {data.cnameRecord?.length > 0 && <RecordBox label="CNAME" values={data.cnameRecord} copy={copy} copied={copied} />}
        </Section>

        {/* TXT Records */}
        <Section title="TXT Records" icon={<Activity size={16} />}>
          {data.txtRecords?.length > 0 ? data.txtRecords.map((t: string, i: number) => (
            <div key={i} style={{ padding: "8px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", marginBottom: "6px", fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.5 }}>
              {t}
            </div>
          )) : (
            <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Keine TXT-Records</div>
          )}
          {data.soaRecord && (
            <div style={{ marginTop: "var(--space-sm)" }}>
              <div style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>SOA</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {data.soaRecord.nsname} • Serial: {data.soaRecord.serial}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Email Security */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        <Section title="E-Mail-Sicherheit" icon={<Mail size={16} />}>
          <StatusRow label="SPF" value={data.spf} ok={data.spf !== "Nicht gefunden"} />
          <StatusRow label="DMARC" value={data.dmarc} ok={data.dmarc !== "Nicht gefunden"} />
          <div style={{ marginTop: "var(--space-sm)" }}>
            <div style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>DKIM ({data.dkimRecords?.length || 0} Selektoren)</div>
            {data.dkimRecords?.length > 0 ? data.dkimRecords.map((d: AnyData, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <CheckCircle2 size={12} style={{ color: "var(--success-400)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{d.selector}</span>
              </div>
            )) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <XCircle size={12} style={{ color: "var(--danger-400)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Nicht gefunden</span>
              </div>
            )}
          </div>
        </Section>

        {/* TLS Certificate */}
        <Section title="TLS / SSL Zertifikat" icon={data.tls?.isValid ? <Lock size={16} /> : <Unlock size={16} />}>
          {data.tls?.isValid ? (
            <>
              <DetailRow label="Protokoll" value={data.tls.protocol || "—"} mono />
              <DetailRow label="Cipher" value={data.tls.cipher || "—"} mono />
              <DetailRow label="Aussteller" value={data.tls.issuer || "—"} />
              <DetailRow label="Gültig bis" value={data.tls.validTo || "—"} color={data.tls.daysRemaining < 30 ? "var(--danger-400)" : undefined} />
              <DetailRow label="Verbleibend" value={`${data.tls.daysRemaining} Tage`} color={data.tls.daysRemaining < 30 ? "var(--danger-400)" : "var(--success-400)"} />
              {data.tls.fingerprint && <DetailRow label="Fingerprint" value={data.tls.fingerprint} mono small />}
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--danger-400)", fontSize: "0.875rem" }}>
              <Unlock size={16} /> Kein gültiges TLS-Zertifikat
            </div>
          )}
        </Section>
      </div>

      {/* Security Headers + Technologies */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        <Section title={`Security Headers (${data.securityHeaders?.score || 0}/100)`} icon={<ShieldCheck size={16} />}>
          {/* Score Bar */}
          <div style={{ marginBottom: "var(--space-md)" }}>
            <div style={{ height: "6px", background: "var(--bg-base)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${data.securityHeaders?.score || 0}%`, background: `linear-gradient(90deg, var(--danger-400), var(--warning-400), var(--success-400))`, borderRadius: "3px", transition: "width 0.5s" }} />
            </div>
          </div>
          {data.securityHeaders?.findings?.map((f: AnyData, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: "0.75rem", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{f.header}</span>
              {f.status === "present" ? <CheckCircle2 size={13} style={{ color: "var(--success-400)" }} />
                : f.status === "weak" ? <AlertTriangle size={13} style={{ color: "var(--warning-400)" }} />
                : <XCircle size={13} style={{ color: "var(--danger-400)" }} />}
            </div>
          ))}
        </Section>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          {/* HTTP */}
          <Section title="HTTP Probe" icon={<ExternalLink size={16} />}>
            <DetailRow label="HTTP Status" value={data.httpStatus || "Nicht erreichbar"} />
            <DetailRow label="HTTPS Status" value={data.httpsStatus || "Nicht erreichbar"} />
            <DetailRow label="Antwortzeit" value={data.responseTimeMs ? `${data.responseTimeMs}ms` : "—"} />
            {data.redirectChain?.length > 0 && (
              <div style={{ marginTop: "var(--space-xs)" }}>
                <div style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>Redirect-Chain ({data.redirectChain.length})</div>
                {data.redirectChain.map((url: string, i: number) => (
                  <div key={i} className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "2px" }}>→ {url}</div>
                ))}
                <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--primary-400)" }}>→ {data.finalUrl}</div>
              </div>
            )}
          </Section>

          {/* Technologies */}
          {data.technologies?.length > 0 && (
            <Section title="Erkannte Technologien" icon={<Wifi size={16} />}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {data.technologies.map((tech: string, i: number) => (
                  <span key={i} style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", background: "rgba(var(--primary-rgb), 0.08)", color: "var(--primary-400)", fontSize: "0.6875rem", fontWeight: 600 }}>{tech}</span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Subdomains */}
      {data.subdomains?.length > 0 && (
        <Section title={`Erkannte Subdomains (${data.subdomains.length})`} icon={<Globe size={16} />}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
            {data.subdomains.map((sub: AnyData, i: number) => (
              <div key={i} style={{ padding: "6px 10px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem" }}>
                <div className="mono" style={{ color: "var(--primary-300)", fontWeight: 600 }}>{sub.subdomain}</div>
                <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{sub.ips.join(", ")}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <RiskBar score={data.riskScore} color={riskColor(data.riskScore)} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Email Results Component
   ═══════════════════════════════════════════════════════════════ */

function EmailResults({ data, copy, copied, riskColor }: { data: AnyData; copy: (t: string, id: string) => void; copied: string | null; riskColor: (s: number) => string }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        {/* Email Info */}
        <Section title="E-Mail Identität" icon={<AtSign size={16} />}>
          <DetailRow label="Local-Part" value={data.localPart} mono />
          <DetailRow label="Domain" value={data.domain} mono />
          <DetailRow label="Provider" value={data.provider} color="var(--primary-300)" />
          <DetailRow label="Reputation" value={data.reputation} color={data.disposable ? "var(--danger-400)" : "var(--success-400)"} />
          {data.encrypted && <DetailRow label="Verschlüsselung" value="Ende-zu-Ende (ProtonMail)" color="var(--success-400)" />}
        </Section>

        {/* Syntax */}
        <Section title="Syntax-Analyse" icon={<Info size={16} />}>
          <DetailRow label="Format" value={data.syntaxAnalysis?.format} />
          <DetailRow label="Länge (Local)" value={`${data.syntaxAnalysis?.localPartLength} Zeichen`} />
          <FlagRow label="Zahlen enthalten" value={data.syntaxAnalysis?.hasNumbers} />
          <FlagRow label="Sonderzeichen" value={data.syntaxAnalysis?.hasSpecialChars} />
          {data.syntaxAnalysis?.hasPlusTag && <DetailRow label="Plus-Tag" value={`+${data.syntaxAnalysis.plusTag}`} color="var(--warning-400)" />}
          {data.syntaxAnalysis?.isDotTrick && (
            <div style={{ marginTop: "4px", padding: "6px 10px", background: "rgba(245, 158, 11, 0.06)", borderRadius: "var(--radius-sm)", fontSize: "0.6875rem", color: "var(--warning-500)" }}>
              ⚠ Gmail Dot-Trick: Punkte in Gmail-Adressen werden ignoriert
            </div>
          )}
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        {/* Online Presence */}
        <Section title="Online-Präsenz" icon={<Fingerprint size={16} />}>
          <FlagRow label="Gravatar Profil" value={data.hasGravatar} />
          {data.gravatarUrl && (
            <div style={{ marginTop: "var(--space-sm)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.gravatarUrl + "?s=48"} alt="Gravatar" style={{ width: "48px", height: "48px", borderRadius: "50%" }} />
              <div>
                <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>MD5: {data.emailHash}</div>
              </div>
            </div>
          )}
          <div style={{ marginTop: "var(--space-sm)" }}>
            <FlagRow label="Einweg-Email" value={data.disposable} danger />
            <FlagRow label="MX-Records vorhanden" value={data.hasMx} />
          </div>
        </Section>

        {/* Domain DNS */}
        <Section title="Domain-Infrastruktur" icon={<Server size={16} />}>
          <RecordBox label="IP-Adressen" values={data.domainIPs} copy={copy} copied={copied} />
          <RecordBox label="Mail-Server (MX)" values={data.mxRecords} copy={copy} copied={copied} />
          <StatusRow label="SPF" value={data.spf} ok={data.spf !== "Nicht gefunden"} />
          <StatusRow label="DMARC" value={data.dmarc} ok={data.dmarc !== "Nicht gefunden"} />
          {data.dkimRecords?.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <CheckCircle2 size={12} style={{ color: "var(--success-400)" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>DKIM: {data.dkimRecords.map((d: AnyData) => d.selector).join(", ")}</span>
            </div>
          )}
        </Section>
      </div>

      <RiskBar score={data.riskScore} color={riskColor(data.riskScore)} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════════ */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "var(--space-lg)" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
        {icon} {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, color, mono, small }: { label: string; value: string | number; color?: string; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: small ? "0.6875rem" : "0.8125rem", color: color || "var(--text-primary)", fontWeight: 500, marginTop: "1px", wordBreak: "break-all", fontFamily: mono ? "var(--font-mono)" : undefined }}>{value || "—"}</p>
    </div>
  );
}

function FlagRow({ label, value, danger }: { label: string; value: boolean; danger?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "0.8125rem" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {value ? (
        <span style={{ display: "flex", alignItems: "center", gap: "4px", color: danger ? "var(--danger-400)" : "var(--success-400)", fontSize: "0.75rem", fontWeight: 600 }}>
          {danger ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />} Ja
        </span>
      ) : (
        <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>Nein</span>
      )}
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ marginBottom: "var(--space-xs)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
        {ok ? <CheckCircle2 size={12} style={{ color: "var(--success-400)" }} /> : <XCircle size={12} style={{ color: "var(--danger-400)" }} />}
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: ok ? "var(--success-400)" : "var(--danger-400)" }}>{label}</span>
      </div>
      <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", paddingLeft: "18px", wordBreak: "break-all", lineHeight: 1.4 }}>
        {value?.length > 120 ? value.slice(0, 120) + "…" : value}
      </div>
    </div>
  );
}

function RecordBox({ label, values, copy, copied }: { label: string; values: string[]; copy: (t: string, id: string) => void; copied: string | null }) {
  if (!values || values.length === 0) return null;
  return (
    <div style={{ padding: "8px", background: "rgba(var(--primary-rgb), 0.04)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(var(--primary-rgb), 0.08)" }}>
      <div style={{ fontSize: "0.5625rem", color: "var(--primary-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.1em" }}>{label}</div>
      {values.map((v, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
          <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
          <button onClick={() => copy(v, `${label}-${i}`)} style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", color: "var(--text-tertiary)", flexShrink: 0 }}>
            {copied === `${label}-${i}` ? <Check size={11} style={{ color: "var(--success-400)" }} /> : <Copy size={11} />}
          </button>
        </div>
      ))}
    </div>
  );
}

function RiskBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="card" style={{ padding: "var(--space-lg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "var(--space-sm)" }}>
        <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}><Shield size={14} /> Forensischer Bedrohungs-Index</span>
        <span style={{ fontWeight: 700, color }}>{score}/100</span>
      </div>
      <div style={{ height: "8px", background: "var(--bg-base)", borderRadius: "4px", overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8 }} style={{ height: "100%", background: color, borderRadius: "4px" }} />
      </div>
    </div>
  );
}
