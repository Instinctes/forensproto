"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  Loader2,
  ExternalLink,
  Globe,
  Search,
  MapPin,
  Server,
  Mail,
  Shield,
  CheckCircle2,
} from "lucide-react";
import Header from "@/components/Header";
import AttributionPanel from "@/components/AttributionPanel";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

interface GraphNode {
  id: string;
  label: string;
  type: "own" | "exchange" | "mixer" | "unknown";
  balance?: string;
  txCount?: number;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  value: number;
  txHash?: string;
}

interface TraceData {
  address: string;
  chain: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}



type TabType = "blockchain" | "osint";

/* ─────────────────────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────────────────────── */

const NODE_COLORS: Record<string, string> = {
  own: "#06b6d4",
  exchange: "#10b981",
  mixer: "#ef4444",
  unknown: "#64748b",
};

const TAB_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

/* ─────────────────────────────────────────────────────────────
   Blockchain Tracer Component
   ───────────────────────────────────────────────────────────── */

function BlockchainTracer() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("bitcoin");
  const [depth, setDepth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [traceData, setTraceData] = useState<TraceData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  const handleTrace = async () => {
    if (!address.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/blockchain/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chain, depth }),
      });
      const data = await response.json();
      setTraceData(data);
      if (data.nodes.length > 0) {
        setSelectedNode(data.nodes[0]);
      }
    } catch (error) {
      console.error("Trace error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getExplorerUrl = (nodeId: string) => {
    if (chain === "bitcoin") {
      return `https://mempool.space/tx/${nodeId}`;
    } else {
      return `https://etherscan.io/address/${nodeId}`;
    }
  };

  return (
    <motion.div variants={TAB_VARIANTS} initial="hidden" animate="visible" exit="exit">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--space-lg)" }}>
        {/* Left Panel: Controls */}
        <div>
          <div
            className="card"
            style={{
              padding: "var(--space-lg)",
              marginBottom: "var(--space-lg)",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
              Trace-Parameter
            </h3>

            {/* Address Input */}
            <div style={{ marginBottom: "var(--space-md)" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>
                Wallet-Adresse
              </label>
              <input
                type="text"
                className="af-input"
                placeholder="Bitcoin oder Ethereum Adresse eingeben..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrace()}
              />
            </div>

            {/* Chain Select */}
            <div style={{ marginBottom: "var(--space-md)" }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--space-xs)" }}>
                Blockchain
              </label>
              <select
                className="form-select"
                value={chain}
                onChange={(e) => setChain(e.target.value)}
              >
                <option value="bitcoin">Bitcoin</option>
                <option value="ethereum">Ethereum</option>
              </select>
            </div>

            {/* Depth Slider */}
            <div style={{ marginBottom: "var(--space-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-xs)" }}>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Trace-Tiefe
                </label>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--primary-400)" }}>
                  {depth}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={depth}
                onChange={(e) => setDepth(parseInt(e.target.value))}
                style={{
                  width: "100%",
                  accentColor: "var(--primary-400)",
                  cursor: "pointer",
                }}
              />
            </div>

            {/* Trace Button */}
            <button
              className="btn btn-primary"
              onClick={handleTrace}
              disabled={loading || !address.trim()}
              style={{
                width: "100%",
                opacity: loading || !address.trim() ? 0.6 : 1,
                cursor: loading || !address.trim() ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Tracing...
                </>
              ) : (
                <>
                  <GitBranch size={16} />
                  Trace starten
                </>
              )}
            </button>
          </div>

          {/* Node Details */}
          {selectedNode && (
            <motion.div
              className="card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ padding: "var(--space-lg)" }}
            >
              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
                Knoten-Details
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    ID
                  </p>
                  <p className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", wordBreak: "break-all", marginTop: "var(--space-xs)" }}>
                    {selectedNode.id}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Typ
                  </p>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", marginTop: "var(--space-xs)" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor:
                          selectedNode.type === "own"
                            ? "rgba(6, 182, 212, 0.15)"
                            : selectedNode.type === "exchange"
                            ? "rgba(16, 185, 129, 0.15)"
                            : selectedNode.type === "mixer"
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(100, 116, 139, 0.15)",
                        color:
                          selectedNode.type === "own"
                            ? "#06b6d4"
                            : selectedNode.type === "exchange"
                            ? "#10b981"
                            : selectedNode.type === "mixer"
                            ? "#ef4444"
                            : "#64748b",
                      }}
                    >
                      {selectedNode.type.toUpperCase()}
                    </span>
                  </p>
                </div>
                {selectedNode.balance && (
                  <div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Balance
                    </p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", marginTop: "var(--space-xs)" }}>
                      {selectedNode.balance}
                    </p>
                  </div>
                )}
                {selectedNode.txCount && (
                  <div>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      TX Count
                    </p>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", marginTop: "var(--space-xs)" }}>
                      {selectedNode.txCount}
                    </p>
                  </div>
                )}
                <a
                  href={getExplorerUrl(selectedNode.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ width: "100%", marginTop: "var(--space-sm)", justifyContent: "center" }}
                >
                  <ExternalLink size={14} />
                  Explorer
                </a>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Panel: Graph */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            minHeight: "600px",
          }}
        >
          {traceData && traceData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={{
                nodes: traceData.nodes.map((n) => ({
                  ...n,
                  color: NODE_COLORS[n.type] || NODE_COLORS.unknown,
                })),
                links: traceData.edges.map((e) => ({
                  source: e.source,
                  target: e.target,
                  value: e.value,
                })),
              }}
              nodeColor={(node) => (node as GraphNode & { color: string }).color}
              nodeLabel={(node) => (node as GraphNode).label}
              nodeVal={(node) => Math.sqrt((node as GraphNode).txCount || 1) * 3}
              onNodeClick={(node) =>
                setSelectedNode(traceData.nodes.find((n) => n.id === (node as GraphNode).id) || null)
              }
              width={800}
              height={600}
              nodeCanvasObject={(node, ctx: CanvasRenderingContext2D) => {
                const n = node as GraphNode & { color: string; x: number; y: number };
                const label = n.label || n.id.substring(0, 6);
                ctx.fillStyle = n.color;
                ctx.beginPath();
                ctx.arc(n.x, n.y, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = "var(--text-primary)";
                ctx.font = "10px Inter";
                ctx.textAlign = "center";
                ctx.fillText(label, n.x, n.y + 15);
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "600px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "var(--space-md)",
                color: "var(--text-tertiary)",
              }}
            >
              <Globe size={48} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: "0.875rem" }}>
                {loading ? "Trace wird generiert..." : "Adresse eingeben und Trace starten"}
              </p>
            </div>
          )}
        </div>
      </div>
      <AttributionPanel />
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   OSINT Analyzer Component
   ───────────────────────────────────────────────────────────── */

function OSINTAnalyzer() {
  const [query, setQuery] = useState("");
  const [detectedType, setDetectedType] = useState<string>("ip");
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any>(null);


  const detectType = (input: string) => {
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input)) return "ip";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return "email";
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/.test(input)) return "domain";
    return "unknown";
  };

  const handleAnalyze = async () => {
    if (!query.trim()) return;
    const type = detectType(query);
    setDetectedType(type);
    setLoading(true);
    try {
      const response = await fetch("/api/osint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, type }),
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("OSINT error:", error);
    } finally {
      setLoading(false);
    }
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

  const r = results?.results;

  return (
    <motion.div variants={TAB_VARIANTS} initial="hidden" animate="visible" exit="exit">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        {/* Input */}
        <div className="card" style={{ padding: "var(--space-lg)", background: "linear-gradient(135deg, var(--bg-surface), var(--bg-hover))" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Deep OSINT-Scan</h3>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={18} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
              <input
                type="text"
                className="af-input"
                placeholder="IP, Domain oder E-Mail..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                style={{ paddingLeft: "42px" }}
              />
            </div>
            <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading || !query.trim()} style={{ padding: "0 24px" }}>
              {loading ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
              {loading ? "Scanne..." : "Deep Scan"}
            </button>
          </div>
          {detectedType && detectedType !== "unknown" && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "var(--space-sm)" }}>
              Typ: <span style={{ fontWeight: 600, color: "var(--primary-400)" }}>{detectedType.toUpperCase()}</span>
            </p>
          )}
        </div>

        {/* Results */}
        {r && (
          <AnimatePresence mode="wait">
            <motion.div key={results.query} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

              {/* Header */}
              <div className="card" style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(var(--primary-rgb), 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-400)" }}>
                    {detectedType === "ip" && <Server size={22} />}
                    {detectedType === "domain" && <Globe size={22} />}
                    {detectedType === "email" && <Mail size={22} />}
                  </div>
                  <div>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>{results.query}</h2>
                    <p style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{detectedType} — Deep Scan</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${getRiskColor(r.riskScore)}12`, border: `3px solid ${getRiskColor(r.riskScore)}` }}>
                    <span style={{ fontSize: "1.125rem", fontWeight: 800, color: getRiskColor(r.riskScore), lineHeight: 1 }}>{r.riskScore}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>RISIKO</div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: getRiskColor(r.riskScore) }}>{getRiskLabel(r.riskScore)}</div>
                  </div>
                </div>
              </div>

              {/* ═══════ IP ═══════ */}
              {detectedType === "ip" && (
                <>
                  <div className="responsive-grid-2">
                    <SectionCard title="Geolocation" icon={<MapPin size={16} />}>
                      <DetailRow label="Land" value={`${r.country} (${r.countryCode})`} />
                      <DetailRow label="Region" value={r.region} />
                      <DetailRow label="Stadt" value={r.city} />
                      <DetailRow label="PLZ" value={r.zip} />
                      <DetailRow label="Koordinaten" value={`${r.lat}, ${r.lon}`} mono />
                      <DetailRow label="Zeitzone" value={r.timezone} />
                    </SectionCard>
                    <SectionCard title="Netzwerk" icon={<Server size={16} />}>
                      <DetailRow label="ISP" value={r.isp} />
                      <DetailRow label="Organisation" value={r.org} />
                      <DetailRow label="AS" value={r.as} mono />
                      <DetailRow label="Reverse DNS" value={r.reverseDns} mono />
                      <DetailRow label="Nutzungstyp" value={r.usageType} color="var(--primary-300)" />
                    </SectionCard>
                  </div>
                  <div className="responsive-grid-2">
                    <SectionCard title="Erkennung" icon={<Shield size={16} />}>
                      <FlagRow label="Mobilfunk" value={r.isMobile} />
                      <FlagRow label="Proxy / VPN" value={r.isProxy} danger />
                      <FlagRow label="Hosting / DCN" value={r.isHosting} />
                    </SectionCard>
                    <SectionCard title="Blacklist-Checks" icon={<Shield size={16} />}>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: r.blacklists?.some((b: {listed: boolean}) => b.listed) ? "var(--danger-400)" : "var(--success-400)" }}>
                        {r.blacklistCount} gelistet
                      </span>
                      {r.blacklists?.map((bl: {list: string; listed: boolean}, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "3px 0" }}>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{bl.list}</span>
                          {bl.listed ? <span style={{ color: "var(--danger-400)", fontWeight: 600 }}>✗</span> : <CheckCircle2 size={13} style={{ color: "var(--success-400)" }} />}
                        </div>
                      ))}
                    </SectionCard>
                  </div>
                </>
              )}

              {/* ═══════ DOMAIN ═══════ */}
              {detectedType === "domain" && (
                <>
                  <div className="responsive-grid-2">
                    <SectionCard title="DNS Records" icon={<Server size={16} />}>
                      <RecordBox label="A (IPv4)" values={r.aRecords} />
                      <RecordBox label="AAAA (IPv6)" values={r.aaaaRecords} />
                      <RecordBox label="MX (Mail)" values={r.mxRecords} />
                      <RecordBox label="NS (Nameserver)" values={r.nsRecords} />
                      {r.cnameRecord?.length > 0 && <RecordBox label="CNAME" values={r.cnameRecord} />}
                    </SectionCard>
                    <SectionCard title="E-Mail-Sicherheit" icon={<Mail size={16} />}>
                      <StatusRow label="SPF" value={r.spf} ok={r.spf !== "Nicht gefunden"} />
                      <StatusRow label="DMARC" value={r.dmarc} ok={r.dmarc !== "Nicht gefunden"} />
                      <div style={{ marginTop: "4px" }}>
                        <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>DKIM ({r.dkimRecords?.length || 0})</span>
                        {r.dkimRecords?.length > 0 ? r.dkimRecords.map((d: {selector: string}, i: number) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                            <CheckCircle2 size={12} style={{ color: "var(--success-400)" }} />
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{d.selector}</span>
                          </div>
                        )) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--danger-400)" }}>✗ Nicht gefunden</span>
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  </div>

                  <div className="responsive-grid-2">
                    {/* TLS */}
                    <SectionCard title="TLS / SSL Zertifikat" icon={r.tls?.isValid ? <Shield size={16} /> : <Shield size={16} />}>
                      {r.tls?.isValid ? (
                        <>
                          <DetailRow label="Protokoll" value={r.tls.protocol || "—"} mono />
                          <DetailRow label="Cipher" value={r.tls.cipher || "—"} mono />
                          <DetailRow label="Aussteller" value={r.tls.issuer || "—"} />
                          <DetailRow label="Gültig bis" value={r.tls.validTo || "—"} color={r.tls.daysRemaining < 30 ? "var(--danger-400)" : undefined} />
                          <DetailRow label="Verbleibend" value={`${r.tls.daysRemaining} Tage`} color={r.tls.daysRemaining < 30 ? "var(--danger-400)" : "var(--success-400)"} />
                        </>
                      ) : (
                        <p style={{ color: "var(--danger-400)", fontSize: "0.875rem" }}>⚠ Kein gültiges TLS-Zertifikat</p>
                      )}
                    </SectionCard>

                    {/* Security Headers */}
                    <SectionCard title={`Security Headers (${r.securityHeaders?.score || 0}/100)`} icon={<Shield size={16} />}>
                      <div style={{ height: "6px", background: "var(--bg-base)", borderRadius: "3px", overflow: "hidden", marginBottom: "var(--space-sm)" }}>
                        <div style={{ height: "100%", width: `${r.securityHeaders?.score || 0}%`, background: "linear-gradient(90deg, var(--danger-400), var(--warning-400), var(--success-400))", borderRadius: "3px" }} />
                      </div>
                      {r.securityHeaders?.findings?.map((f: {header: string; status: string}, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "3px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>{f.header}</span>
                          <span style={{ color: f.status === "present" ? "var(--success-400)" : f.status === "weak" ? "var(--warning-400)" : "var(--danger-400)", fontWeight: 600 }}>
                            {f.status === "present" ? "✓" : f.status === "weak" ? "⚠" : "✗"}
                          </span>
                        </div>
                      ))}
                    </SectionCard>
                  </div>

                  {/* HTTP + Tech */}
                  <div className="responsive-grid-2">
                    <SectionCard title="HTTP Probe" icon={<Globe size={16} />}>
                      <DetailRow label="HTTP" value={r.httpStatus || "Nicht erreichbar"} />
                      <DetailRow label="HTTPS" value={r.httpsStatus || "Nicht erreichbar"} />
                      <DetailRow label="Antwortzeit" value={r.responseTimeMs ? `${r.responseTimeMs}ms` : "—"} />
                      {r.redirectChain?.length > 0 && (
                        <div style={{ marginTop: "4px" }}>
                          <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Redirects ({r.redirectChain.length})</span>
                          {r.redirectChain.map((url: string, i: number) => (
                            <div key={i} style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginTop: "2px" }}>→ {url}</div>
                          ))}
                        </div>
                      )}
                    </SectionCard>

                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
                      {r.technologies?.length > 0 && (
                        <SectionCard title="Technologien" icon={<Server size={16} />}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {r.technologies.map((tech: string, i: number) => (
                              <span key={i} style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", background: "rgba(var(--primary-rgb), 0.08)", color: "var(--primary-400)", fontSize: "0.6875rem", fontWeight: 600 }}>{tech}</span>
                            ))}
                          </div>
                        </SectionCard>
                      )}
                      {r.subdomains?.length > 0 && (
                        <SectionCard title={`Subdomains (${r.subdomains.length})`} icon={<Globe size={16} />}>
                          {r.subdomains.slice(0, 10).map((sub: {subdomain: string; ips: string[]}, i: number) => (
                            <div key={i} style={{ fontSize: "0.75rem", padding: "2px 0" }}>
                              <span style={{ fontFamily: "var(--font-mono)", color: "var(--primary-300)", fontWeight: 600 }}>{sub.subdomain}</span>
                              <span style={{ color: "var(--text-tertiary)", marginLeft: "8px", fontSize: "0.6875rem", fontFamily: "var(--font-mono)" }}>{sub.ips.join(", ")}</span>
                            </div>
                          ))}
                        </SectionCard>
                      )}
                    </div>
                  </div>

                  {/* TXT Records */}
                  {r.txtRecords?.length > 0 && (
                    <SectionCard title="TXT Records" icon={<Server size={16} />}>
                      {r.txtRecords.map((t: string, i: number) => (
                        <div key={i} style={{ padding: "6px 8px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", marginBottom: "4px", fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.4 }}>
                          {t}
                        </div>
                      ))}
                    </SectionCard>
                  )}
                </>
              )}

              {/* ═══════ EMAIL ═══════ */}
              {detectedType === "email" && (
                <>
                  <div className="responsive-grid-2">
                    <SectionCard title="E-Mail Identität" icon={<Mail size={16} />}>
                      <DetailRow label="Local-Part" value={r.localPart} mono />
                      <DetailRow label="Domain" value={r.domain} mono />
                      <DetailRow label="Provider" value={r.provider} color="var(--primary-300)" />
                      <DetailRow label="Reputation" value={r.reputation} color={r.disposable ? "var(--danger-400)" : "var(--success-400)"} />
                      {r.encrypted && <DetailRow label="Verschlüsselung" value="Ende-zu-Ende (ProtonMail)" color="var(--success-400)" />}
                    </SectionCard>
                    <SectionCard title="Syntax-Analyse" icon={<Shield size={16} />}>
                      <DetailRow label="Format" value={r.syntaxAnalysis?.format} />
                      <DetailRow label="Länge" value={`${r.syntaxAnalysis?.localPartLength} Zeichen`} />
                      <FlagRow label="Zahlen" value={r.syntaxAnalysis?.hasNumbers} />
                      <FlagRow label="Sonderzeichen" value={r.syntaxAnalysis?.hasSpecialChars} />
                      {r.syntaxAnalysis?.hasPlusTag && (
                        <DetailRow label="Plus-Tag" value={`+${r.syntaxAnalysis.plusTag}`} color="var(--warning-400)" />
                      )}
                      {r.syntaxAnalysis?.isDotTrick && (
                        <p style={{ fontSize: "0.6875rem", color: "var(--warning-500)", padding: "4px 8px", background: "rgba(245, 158, 11, 0.06)", borderRadius: "var(--radius-sm)", marginTop: "4px" }}>
                          ⚠ Gmail Dot-Trick aktiv
                        </p>
                      )}
                    </SectionCard>
                  </div>
                  <div className="responsive-grid-2">
                    <SectionCard title="Online-Präsenz" icon={<Globe size={16} />}>
                      <FlagRow label="Gravatar" value={r.hasGravatar} />
                      <FlagRow label="Einweg-Email" value={r.disposable} danger />
                      <FlagRow label="MX-Records" value={r.hasMx} />
                      {r.gravatarUrl && (
                        <div style={{ marginTop: "var(--space-sm)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.gravatarUrl + "?s=40"} alt="" style={{ width: "40px", height: "40px", borderRadius: "50%" }} />
                          <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>MD5: {r.emailHash}</span>
                        </div>
                      )}
                    </SectionCard>
                    <SectionCard title="Domain-Infrastruktur" icon={<Server size={16} />}>
                      <RecordBox label="IP-Adressen" values={r.domainIPs} />
                      <RecordBox label="MX-Server" values={r.mxRecords} />
                      <StatusRow label="SPF" value={r.spf} ok={r.spf !== "Nicht gefunden"} />
                      <StatusRow label="DMARC" value={r.dmarc} ok={r.dmarc !== "Nicht gefunden"} />
                    </SectionCard>
                  </div>
                </>
              )}

              {/* Risk Bar */}
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "var(--space-sm)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Forensischer Bedrohungs-Index</span>
                  <span style={{ fontWeight: 700, color: getRiskColor(r.riskScore) }}>{r.riskScore}/100</span>
                </div>
                <div style={{ height: "8px", background: "var(--bg-base)", borderRadius: "4px", overflow: "hidden" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${r.riskScore}%` }} transition={{ duration: 0.8 }} style={{ height: "100%", background: getRiskColor(r.riskScore), borderRadius: "4px" }} />
                </div>
              </div>

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Helper Components
   ───────────────────────────────────────────────────────────── */

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "var(--space-lg)" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>{icon} {title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value, color, mono, icon }: { label: string; value: string | number; color?: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "4px" }}>{icon} {label}</p>
      <p style={{ fontSize: "0.8125rem", color: color || "var(--text-primary)", fontWeight: 500, marginTop: "1px", wordBreak: "break-all", fontFamily: mono ? "var(--font-mono)" : undefined }}>{value || "—"}</p>
    </div>
  );
}

function FlagRow({ label, value, danger }: { label: string; value: boolean; danger?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: "0.8125rem" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {value ? (
        <span style={{ color: danger ? "var(--danger-400)" : "var(--success-400)", fontSize: "0.75rem", fontWeight: 600 }}>
          {danger ? "⚠ Ja" : "✓ Ja"}
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
        {ok ? <CheckCircle2 size={12} style={{ color: "var(--success-400)" }} /> : <span style={{ color: "var(--danger-400)", fontSize: "0.75rem", fontWeight: 700 }}>✗</span>}
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: ok ? "var(--success-400)" : "var(--danger-400)" }}>{label}</span>
      </div>
      <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", paddingLeft: "18px", wordBreak: "break-all", lineHeight: 1.4 }}>
        {value?.length > 100 ? value.slice(0, 100) + "…" : value}
      </div>
    </div>
  );
}

function RecordBox({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div style={{ padding: "8px", background: "rgba(var(--primary-rgb), 0.04)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(var(--primary-rgb), 0.08)" }}>
      <div style={{ fontSize: "0.5625rem", color: "var(--primary-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.1em" }}>{label}</div>
      {values.map((v, i) => (
        <div key={i} style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "2px" }}>{v}</div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Page Component
   ───────────────────────────────────────────────────────────── */

export default function InvestigationPage() {
  const [activeTab, setActiveTab] = useState<TabType>("blockchain");

  return (
    <>
      <Header
        title="Ermittlung"
        subtitle="Blockchain-Tracing & OSINT-Analyse"
      />
      <main className="page-content">
        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-xl)",
            background: "var(--bg-elevated)",
            padding: "var(--space-xs)",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-subtle)",
            width: "fit-content",
          }}
        >
          {["blockchain", "osint"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as TabType)}
              className={activeTab === tab ? "btn btn-primary" : "btn btn-ghost"}
              style={{
                borderRadius: "var(--radius-full)",
                fontSize: "0.875rem",
                fontWeight: 600,
                padding: "10px 24px",
                transition: "all var(--transition-fast)",
              }}
            >
              {tab === "blockchain" ? "Blockchain Tracer" : "OSINT Analyzer"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "blockchain" && (
            <BlockchainTracer key="blockchain" />
          )}
          {activeTab === "osint" && (
            <OSINTAnalyzer key="osint" />
          )}
        </AnimatePresence>
      </main>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );
}
