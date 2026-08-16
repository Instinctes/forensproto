"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  KeyRound,
  BarChart3,
  ShieldAlert,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Info,
  Upload,
  HardDrive,
  Lock,
  Unlock,
  Shield,
  FileKey,
  Fingerprint,
  Globe,
  Terminal,
  ChevronRight,
  Zap,
  Download,
} from "lucide-react";
import Header from "@/components/Header";

type TabType = "wallet" | "signature" | "key" | "entropy" | "nonce" | "pubkey";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalysisData = any;

function WRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: color || "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

export default function AdvancedAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabType>("wallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisData>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Input states
  const [sigInput, setSigInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [entropyInput, setEntropyInput] = useState("");
  const [nonceInput, setNonceInput] = useState("");
  const [nonceZInput, setNonceZInput] = useState("");
  const [pubkeyInput, setPubkeyInput] = useState("");

  // Wallet upload state
  const [walletFile, setWalletFile] = useState<File | null>(null);
  const [walletResult, setWalletResult] = useState<AnalysisData>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [syncingBlockchain, setSyncingBlockchain] = useState(false);
  const [hasSyncedBlockchain, setHasSyncedBlockchain] = useState(false);
  const [liveBalances, setLiveBalances] = useState<Record<string, number>>({});

  // Godfather Recovery Terminal State
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<AnalysisData>(null);
  const [z1TerminalInput, setZ1TerminalInput] = useState("");
  const [z2TerminalInput, setZ2TerminalInput] = useState("");
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalResult, setTerminalResult] = useState<AnalysisData>(null);

  // Exhaustive Batch Recovery State
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchResults, setBatchResults] = useState<AnalysisData>(null);
  const [batchExpanded, setBatchExpanded] = useState(false);
  // Standardmäßig AUS: ohne echte Transaktionsdaten wird eine Gruppe
  // übersprungen statt mit erfundenen z-Werten "gelöst". Nur wer dies
  // bewusst aktiviert, erhält Proof-of-Concept-Ergebnisse aus Simulation.
  const [allowSimulated, setAllowSimulated] = useState(false);

  const tabs = [
    { id: "wallet" as TabType, label: "Wallet-Upload", icon: HardDrive },
    { id: "signature" as TabType, label: "Signatur-Analyse", icon: FlaskConical },
    { id: "key" as TabType, label: "Key-Analyse", icon: KeyRound },
    { id: "entropy" as TabType, label: "Entropy-Analyse", icon: BarChart3 },
    { id: "nonce" as TabType, label: "Nonce-Scanner", icon: ShieldAlert },
    { id: "pubkey" as TabType, label: "Public Key Extractor", icon: Fingerprint },
  ];

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let endpoint = "";
      let body = {};

      switch (activeTab) {
        case "signature":
          if (!sigInput.trim()) { setError("Bitte Signatur eingeben"); setLoading(false); return; }
          endpoint = "/api/crypto-forensics/analyze-signature";
          // Support single or multi (newline-separated)
          const sigs = sigInput.trim().split("\n").filter(Boolean);
          body = sigs.length === 1 ? { signature: sigs[0].trim() } : { signatures: sigs.map(s => s.trim()) };
          break;
        case "key":
          if (!keyInput.trim()) { setError("Bitte Key eingeben"); setLoading(false); return; }
          endpoint = "/api/crypto-forensics/analyze-key";
          body = { key: keyInput.trim() };
          break;
        case "entropy":
          if (!entropyInput.trim()) { setError("Bitte Hex-Daten eingeben"); setLoading(false); return; }
          endpoint = "/api/crypto-forensics/analyze-entropy";
          body = { hexData: entropyInput.trim() };
          break;
        case "nonce":
          if (!nonceInput.trim()) { setError("Bitte Signaturen eingeben"); setLoading(false); return; }
          endpoint = "/api/crypto-forensics/nonce-scan";
          const zValuesArr = nonceZInput.trim().split("\n").filter(Boolean).map(s => s.trim());
          body = { 
            signatures: nonceInput.trim().split("\n").filter(Boolean).map(s => s.trim()),
            zValues: zValuesArr.length > 0 ? zValuesArr : undefined
          };
          break;
        case "pubkey":
          if (!pubkeyInput.trim()) { setError("Bitte WIF Key, Hex Private Key oder Hex Public Key eingeben"); setLoading(false); return; }
          endpoint = "/api/crypto-forensics/extract-pubkey";
          body = { keyInput: pubkeyInput.trim() };
          break;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Analyse fehlgeschlagen");
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "CRITICAL": return "var(--danger-400)";
      case "HIGH": return "var(--danger-500)";
      case "MEDIUM": return "var(--warning-400)";
      default: return "var(--success-400)";
    }
  };

  // ============================================================================
  // Wallet Upload Handler
  // ============================================================================
  const handleWalletUpload = async (file: File) => {
    setWalletFile(file);
    setWalletLoading(true);
    setWalletError(null);
    setWalletResult(null);

    try {
      const formData = new FormData();
      formData.append("wallet", file);

      const response = await fetch("/api/crypto-forensics/wallet-scan", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!data.success) {
        setWalletError(data.error || "Analyse fehlgeschlagen");
        return;
      }
      setWalletResult(data);
      // Automatischer Blockchain-Abgleich direkt nach der Analyse (gewolltes
      // Feature): gleicht die extrahierten Adressen gegen blockchain.info ab.
      if (data?.keys?.analyses?.length > 0) {
        syncBlockchainBalances(data.keys.analyses);
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setWalletLoading(false);
    }
  };

  // Blockchain-Abgleich der extrahierten Adressen via blockchain.info.
  // Wird automatisch nach jeder Wallet-Analyse aufgerufen (siehe
  // handleWalletUpload); als Parameter werden die Analysen übergeben, damit
  // nicht auf den asynchron gesetzten State gewartet werden muss.
  const syncBlockchainBalances = async (analyses: { address: string }[]) => {
    if (!analyses || analyses.length === 0) return;
    setSyncingBlockchain(true);
    setHasSyncedBlockchain(false);
    try {
      const addresses = analyses
        .map((k: { address: string }) => k.address)
        .filter(Boolean);
      const uniqueAddresses = Array.from(new Set<string>(addresses));
      const newBalances: Record<string, number> = {};
      for (let i = 0; i < uniqueAddresses.length; i += 40) {
        const batch = uniqueAddresses.slice(i, i + 40);
        try {
          const res = await fetch(
            `https://blockchain.info/balance?cors=true&active=${batch.join(",")}`
          );
          const bData = await res.json();
          for (const [addr, info] of Object.entries(
            bData as Record<string, { final_balance: number }>
          )) {
            newBalances[addr] = info.final_balance / 100000000; // in BTC
          }
        } catch {
          /* einzelner Batch fehlgeschlagen — übrige weiter versuchen */
        }
      }
      setLiveBalances(newBalances);
      setHasSyncedBlockchain(true);
    } finally {
      setSyncingBlockchain(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleWalletUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleWalletUpload(file);
  };

  const getAuthColor = (status: string) => {
    switch (status) {
      case "valid": return "var(--success-400)";
      case "suspicious": return "var(--warning-400)";
      default: return "var(--danger-400)";
    }
  };

  // ============================================================================
  // Godfather Terminal Handler
  // ============================================================================
  const runGodfatherTerminal = async () => {
    if (!activeGroup || !z1TerminalInput || !z2TerminalInput) return;
    setTerminalLoading(true);
    setTerminalResult(null);

    try {
      const response = await fetch("/api/crypto-forensics/godfather-terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rHex: activeGroup.rValueFull,
          s1Hex: activeGroup.s1,
          s2Hex: activeGroup.s2,
          z1Hex: z1TerminalInput,
          z2Hex: z2TerminalInput
        }),
      });

      const data = await response.json();
      setTerminalResult(data);
    } catch {
      setTerminalResult({ success: false, error: "Verbindungsfehler zum Terminal" });
    } finally {
      setTerminalLoading(false);
    }
  };

  // ============================================================================
  // Exhaustive Batch Recovery Handler
  // ============================================================================
  const runExhaustiveBatchRecovery = async () => {
    if (!result?.data?.reusedNonces?.length) return;
    setBatchRunning(true);
    setBatchResults(null);
    setBatchExpanded(true);
    const groups = result.data.reusedNonces;
    setBatchTotal(groups.length);
    setBatchProgress(0);

    try {
      // Prepare all groups for batch API
      const payload = groups.map((g: AnalysisData) => ({
        rValueFull: g.rValueFull,
        s1: g.s1,
        s2: g.s2,
        txHash1: g.txHash1 || g.mockedTxHash1,
        txHash2: g.txHash2 || g.mockedTxHash2,
        mockedTxHash1: g.txHash1 || g.mockedTxHash1,
        mockedTxHash2: g.txHash2 || g.mockedTxHash2,
      }));

      // Simulate progress while API processes
      const progressInterval = setInterval(() => {
        setBatchProgress((prev) => Math.min(prev + 1, groups.length - 1));
      }, 800);

      const response = await fetch("/api/crypto-forensics/batch-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: payload, allowSimulated }),
      });

      clearInterval(progressInterval);
      setBatchProgress(groups.length);

      const data = await response.json();
      setBatchResults(data);
    } catch {
      setBatchResults({ success: false, error: "Batch-Recovery Verbindungsfehler" });
    } finally {
      setBatchRunning(false);
    }
  };

  // ============================================================================
  // Wallet Tab
  // ============================================================================
  const renderWalletTab = () => (
    <div>
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          padding: "var(--space-2xl)",
          border: `2px dashed ${dragOver ? "var(--primary-400)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-xl)",
          background: dragOver ? "rgba(var(--primary-rgb), 0.06)" : "var(--bg-surface)",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
          marginBottom: "var(--space-lg)",
        }}
        onClick={() => document.getElementById("wallet-file-input")?.click()}
      >
        <input
          id="wallet-file-input"
          type="file"
          accept=".dat,.sqlite,.db"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        {walletLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)" }}>
            <Loader2 size={48} style={{ color: "var(--primary-400)", animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--primary-400)" }}>Deep-Scan läuft...</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>Wallet wird analysiert: Struktur, Keys, Signaturen, Entropy, Nonce</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(var(--primary-rgb), 0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Upload size={32} style={{ color: "var(--primary-400)" }} />
            </div>
            <div>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                wallet.dat hier ablegen oder klicken
              </p>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginTop: "4px" }}>
                Berkeley DB / SQLite • Max. 100 MB • Alle Module-H-Analysen automatisch
              </p>
            </div>
            {walletFile && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "6px 16px", background: "rgba(var(--primary-rgb), 0.06)", borderRadius: "var(--radius-full)", fontSize: "0.8125rem", color: "var(--primary-400)", fontWeight: 600 }}>
                <HardDrive size={14} /> {walletFile.name} ({(walletFile.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {walletError && (
        <div style={{ padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "var(--radius-md)", display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
          <AlertTriangle size={16} style={{ color: "var(--danger-400)", flexShrink: 0, marginTop: "2px" }} />
          <span style={{ fontSize: "0.875rem", color: "var(--danger-400)" }}>{walletError}</span>
        </div>
      )}

      {/* RESULTS */}
      {walletResult && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>

          {/* Summary Header */}
          <div className="card" style={{ padding: "var(--space-lg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: `${getAuthColor(walletResult.wallet.authenticityStatus)}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {walletResult.wallet.authenticityStatus === "valid" ? <Shield size={24} style={{ color: "var(--success-400)" }} /> : <AlertTriangle size={24} style={{ color: getAuthColor(walletResult.wallet.authenticityStatus) }} />}
              </div>
              <div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 700 }}>{walletResult.wallet.fileName}</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                  {walletResult.wallet.fileSizeHuman} • ID: {walletResult.analysisId} • {walletResult.elapsed}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "60px", height: "60px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `${getAuthColor(walletResult.wallet.authenticityStatus)}12`, border: `3px solid ${getAuthColor(walletResult.wallet.authenticityStatus)}` }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: getAuthColor(walletResult.wallet.authenticityStatus) }}>{walletResult.wallet.authenticityScore}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>AUTHENTIZITÄT</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 700, color: getAuthColor(walletResult.wallet.authenticityStatus), textTransform: "uppercase" }}>{walletResult.wallet.authenticityStatus}</div>
              </div>
            </div>
          </div>

          {/* Findings */}
          {walletResult.findings?.length > 0 && (
            <div className="card" style={{ padding: "var(--space-lg)", border: `1px solid rgba(239, 68, 68, 0.15)`, background: "rgba(239, 68, 68, 0.02)" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--danger-400)", marginBottom: "var(--space-md)" }}>⚠ Forensische Befunde ({walletResult.findings.length})</h4>
              {walletResult.findings.map((f: string, i: number) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  <AlertTriangle size={14} style={{ color: "var(--warning-400)", flexShrink: 0, marginTop: "2px" }} />
                  {f}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            {/* Wallet Structure */}
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}><HardDrive size={16} /> Wallet-Struktur</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <WRow label="BDB Header" value={walletResult.wallet.hasValidBDB ? "✓ Gültig" : "✗ Ungültig"} color={walletResult.wallet.hasValidBDB ? "var(--success-400)" : "var(--danger-400)"} />
                <WRow label="Verschlüsselung" value={walletResult.wallet.isEncrypted ? "✓ Verschlüsselt" : "Nicht verschlüsselt"} color={walletResult.wallet.isEncrypted ? "var(--success-400)" : "var(--warning-400)"} />
                <WRow label="Extrahierte Keys" value={String(walletResult.keys.totalFound)} />
                <WRow label="Davon gültig" value={String(walletResult.keys.validAnalyzed)} color="var(--primary-400)" />
                <WRow label="Signaturen im Binary" value={String(walletResult.signatures.totalFound)} />
              </div>
            </div>

            {/* Master Key */}
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
                {walletResult.masterKey.found ? <Lock size={16} /> : <Unlock size={16} />} Master Key
              </h4>
              {walletResult.masterKey.found ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                  <WRow label="Iterationen" value={walletResult.masterKey.iterations?.toLocaleString()} />
                  <WRow label="Methode" value={`AES-${walletResult.masterKey.method === 0 ? 256 : walletResult.masterKey.method}-CBC`} />
                  <div><p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>SALT</p><p className="mono" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", wordBreak: "break-all", marginTop: "2px" }}>{walletResult.masterKey.saltHex}</p></div>
                  <div><p style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>IV</p><p className="mono" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", wordBreak: "break-all", marginTop: "2px" }}>{walletResult.masterKey.ivHex}</p></div>
                </div>
              ) : (
                <div style={{ padding: "var(--space-md)", background: "rgba(245, 158, 11, 0.06)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", color: "var(--warning-400)" }}>Kein Master Key gefunden — Watch-Only-Wallet oder Scam</div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              ECDSA NONCE REUSE → PRIVATE KEY RECOVERY (vollautomatisch)
              ═══════════════════════════════════════════════════════════════ */}
          {walletResult.keyRecovery && (
            <div className="card" style={{
              padding: "var(--space-xl)",
              border: walletResult.keyRecovery.success
                ? "1px solid rgba(34, 197, 94, 0.4)"
                : walletResult.nonceAnalysis?.reusedNonces?.length > 0
                  ? "1px solid rgba(239, 68, 68, 0.3)"
                  : "1px solid var(--border-subtle)",
              background: walletResult.keyRecovery.success
                ? "rgba(34, 197, 94, 0.03)"
                : "var(--bg-surface)",
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-lg)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {walletResult.keyRecovery.success
                    ? <Unlock size={22} style={{ color: "var(--success-400)" }} />
                    : <ShieldAlert size={22} style={{ color: walletResult.nonceAnalysis?.reusedNonces?.length > 0 ? "var(--danger-400)" : "var(--text-tertiary)" }} />
                  }
                  <div>
                    <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: walletResult.keyRecovery.success ? "var(--success-400)" : "var(--text-primary)" }}>
                      ECDSA Nonce-Reuse → Private Key Recovery
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "2px" }}>
                      Kryptographische Herleitung · secp256k1 · wallet.dat Forensik
                    </p>
                  </div>
                </div>
                <span style={{
                  padding: "4px 12px", borderRadius: "20px", fontSize: "0.7rem", fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  background: walletResult.keyRecovery.success
                    ? "rgba(34, 197, 94, 0.12)"
                    : walletResult.nonceAnalysis?.reusedNonces?.length > 0
                      ? "rgba(239, 68, 68, 0.12)"
                      : "rgba(100, 116, 139, 0.12)",
                  color: walletResult.keyRecovery.success
                    ? "var(--success-400)"
                    : walletResult.nonceAnalysis?.reusedNonces?.length > 0
                      ? "var(--danger-400)"
                      : "var(--text-tertiary)",
                  border: `1px solid ${walletResult.keyRecovery.success ? "rgba(34, 197, 94, 0.3)" : walletResult.nonceAnalysis?.reusedNonces?.length > 0 ? "rgba(239, 68, 68, 0.3)" : "var(--border-subtle)"}`,
                }}>
                  {walletResult.keyRecovery.success ? `${walletResult.keyRecovery.recoveredCount} KEY(S) RECOVERED` : walletResult.nonceAnalysis?.reusedNonces?.length > 0 ? "VULNERABILITY DETECTED" : "KEINE SCHWACHSTELLE"}
                </span>
              </div>

              {/* Pipeline Status */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
                {[
                  { label: "Wallet Parsed", value: `${walletResult.keys.totalFound} Keys`, ok: walletResult.keys.totalFound > 0 },
                  { label: "Blockchain Scan", value: `${walletResult.blockchainAnalysis?.addressesScanned ?? 0} Adressen`, ok: (walletResult.blockchainAnalysis?.addressesScanned ?? 0) > 0 },
                  { label: "Signaturen + z-Werte", value: `${walletResult.blockchainAnalysis?.signaturesExtracted ?? 0} gefunden`, ok: (walletResult.blockchainAnalysis?.signaturesExtracted ?? 0) > 0 },
                  { label: "Schlüssel-Wiederherstellung", value: walletResult.keyRecovery.success ? `${walletResult.keyRecovery.recoveredCount} ERFOLGREICH` : walletResult.keyRecovery.attempted ? "Kein Nonce-Reuse" : "N/A", ok: walletResult.keyRecovery.success },
                ].map((step, i) => (
                  <div key={i} style={{ padding: "10px 12px", background: step.ok ? "rgba(34, 197, 94, 0.06)" : "rgba(0,0,0,0.15)", borderRadius: "8px", border: `1px solid ${step.ok ? "rgba(34, 197, 94, 0.2)" : "var(--border-subtle)"}`, textAlign: "center" }}>
                    <div style={{ fontSize: "0.625rem", color: step.ok ? "var(--success-400)" : "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                      {step.ok ? "✓ " : "○ "}{step.label}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: 600 }}>{step.value}</div>
                  </div>
                ))}
              </div>

              {/* Mathematische Herleitung (Info) */}
              <div style={{ padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--border-subtle)", marginBottom: "var(--space-lg)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)", lineHeight: 1.8 }}>
                <span style={{ color: "var(--primary-400)", fontWeight: 700 }}>k</span> = (z₁ − z₂) · (s₁ − s₂)⁻¹ mod n
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <span style={{ color: "var(--primary-400)", fontWeight: 700 }}>d</span> = (s₁·k − z₁) · r⁻¹ mod n
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <span style={{ color: "var(--text-secondary)" }}>n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141</span>
              </div>

              {/* Blockchain-Fetch Log */}
              {walletResult.blockchainAnalysis?.fetchLog?.length > 0 && (
                <details style={{ marginBottom: "var(--space-lg)" }}>
                  <summary style={{ fontSize: "0.8125rem", color: "var(--primary-400)", cursor: "pointer", fontWeight: 600, marginBottom: "8px" }}>
                    Blockchain-Fetch-Log ({walletResult.blockchainAnalysis.fetchLog.length} Einträge)
                  </summary>
                  <div style={{ padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "6px", maxHeight: "150px", overflowY: "auto" }}>
                    {walletResult.blockchainAnalysis.fetchLog.map((log: string, i: number) => (
                      <div key={i} style={{ fontSize: "0.7rem", color: log.startsWith("✓") ? "var(--success-400)" : log.startsWith("✗") ? "var(--danger-400)" : "var(--text-tertiary)", marginBottom: "2px", fontFamily: "var(--font-mono)" }}>
                        {log}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Extrahierte Blockchain-Signaturen */}
              {walletResult.blockchainAnalysis?.signatures?.length > 0 && (
                <div style={{ marginBottom: "var(--space-lg)" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>
                    Extrahierte Signaturen mit z-Werten ({walletResult.blockchainAnalysis.signatures.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {walletResult.blockchainAnalysis.signatures.slice(0, 6).map((s: AnalysisData, i: number) => (
                      <div key={i} style={{ padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", border: "1px solid var(--border-subtle)", fontSize: "0.7rem", fontFamily: "var(--font-mono)" }}>
                        <div style={{ color: "var(--primary-400)", marginBottom: "2px" }}>{s.address} • TX: {s.txid?.slice(0, 16)}... Input #{s.inputIndex}</div>
                        <div style={{ color: "var(--text-tertiary)" }}>r: {s.rHex?.slice(0, 20)}...  s: {s.sHex?.slice(0, 20)}...</div>
                        <div style={{ color: "var(--success-400)" }}>z: {s.zHex?.slice(0, 20)}... ← SIGHASH_ALL (SHA256d)</div>
                      </div>
                    ))}
                    {walletResult.blockchainAnalysis.signatures.length > 6 && (
                      <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", textAlign: "center" }}>... und {walletResult.blockchainAnalysis.signatures.length - 6} weitere</div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ RECOVERED KEYS ══ */}
              {walletResult.keyRecovery.success && walletResult.keyRecovery.keys.map((key: AnalysisData, i: number) => (
                <div key={i} style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.35)", borderRadius: "12px", padding: "var(--space-lg)", marginBottom: "var(--space-md)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "var(--space-md)", color: "var(--success-400)" }}>
                    <Unlock size={20} />
                    <span style={{ fontWeight: 800, fontSize: "0.9375rem", textTransform: "uppercase" }}>Private Key #{i + 1} — Nonce-Reuse Extrahiert</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                    {/* Private Key Hex */}
                    <div>
                      <div style={{ fontSize: "0.625rem", color: "var(--primary-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>PRIVATE KEY (RAW HEX)</div>
                      <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                        <span className="mono" style={{ fontSize: "0.75rem", color: "#e2e8f0", wordBreak: "break-all", flex: 1 }}>{key.privateKeyHex}</span>
                        <button onClick={() => copyToClipboard(key.privateKeyHex, `rk-hex-${i}`)} style={{ flexShrink: 0, background: "var(--primary-500)", color: "black", border: "none", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: 800 }}>
                          {copiedField === `rk-hex-${i}` ? "✓" : "COPY"}
                        </button>
                      </div>
                    </div>
                    {/* WIF Compressed */}
                    {key.wifCompressed && (
                      <div>
                        <div style={{ fontSize: "0.625rem", color: "var(--primary-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>WIF (COMPRESSED)</div>
                        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-primary)", wordBreak: "break-all", flex: 1 }}>{key.wifCompressed}</span>
                          <button onClick={() => copyToClipboard(key.wifCompressed, `rk-wifc-${i}`)} style={{ flexShrink: 0, background: "var(--primary-500)", color: "black", border: "none", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: 800 }}>
                            {copiedField === `rk-wifc-${i}` ? "✓" : "COPY"}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* WIF Uncompressed */}
                    {key.wifUncompressed && (
                      <div>
                        <div style={{ fontSize: "0.625rem", color: "var(--primary-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>WIF (UNCOMPRESSED)</div>
                        <div style={{ background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-primary)", wordBreak: "break-all", flex: 1 }}>{key.wifUncompressed}</span>
                          <button onClick={() => copyToClipboard(key.wifUncompressed, `rk-wifu-${i}`)} style={{ flexShrink: 0, background: "rgba(255,255,255,0.6)", color: "black", border: "none", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: 800 }}>
                            {copiedField === `rk-wifu-${i}` ? "✓" : "COPY"}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Public Key + Bitcoin Address */}
                    {key.publicKey && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)" }}>
                        <div>
                          <div style={{ fontSize: "0.625rem", color: "var(--primary-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>PUBLIC KEY (COMPRESSED)</div>
                          <div className="mono" style={{ fontSize: "0.7rem", color: "var(--text-secondary)", wordBreak: "break-all", padding: "8px 10px", background: "rgba(0,0,0,0.3)", borderRadius: "6px" }}>{key.publicKey}</div>
                        </div>
                        {key.address && (
                          <div>
                            <div style={{ fontSize: "0.625rem", color: "var(--success-400)", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>BITCOIN ADRESSE (P2PKH)</div>
                            <div style={{ padding: "8px 10px", background: "rgba(34,197,94,0.08)", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--success-400)", fontWeight: 700 }}>{key.address}</span>
                              <button onClick={() => copyToClipboard(key.address, `rk-addr-${i}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--success-400)" }}>
                                {copiedField === `rk-addr-${i}` ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Gemeinsamer r-Wert */}
                    {key.rValue && (
                      <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.06)", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.15)" }}>
                        <span style={{ fontSize: "0.625rem", color: "var(--danger-400)", fontWeight: 700, textTransform: "uppercase" }}>SCHWACHSTELLE — GEMEINSAMER r-WERT (NONCE REUSE): </span>
                        <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{key.rValue?.slice(0, 32)}...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Kein Nonce-Reuse */}
              {!walletResult.keyRecovery.success && !walletResult.nonceAnalysis?.reusedNonces?.length && (
                <div style={{ padding: "16px", background: "rgba(34, 197, 94, 0.04)", borderRadius: "8px", border: "1px solid rgba(34, 197, 94, 0.1)", display: "flex", alignItems: "center", gap: "12px", color: "var(--success-400)" }}>
                  <Shield size={18} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Kein Nonce-Reuse detektiert</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "2px" }}>
                      {walletResult.blockchainAnalysis?.signaturesExtracted > 0
                        ? `${walletResult.blockchainAnalysis.signaturesExtracted} Signatur(en) analysiert — alle r-Werte einzigartig.`
                        : "Keine Blockchain-Transaktionen gefunden oder Wallet hat keine Ausgaben."}
                    </div>
                  </div>
                </div>
              )}

              {/* Nonce-Reuse detektiert aber kein z-Wert verfügbar */}
              {!walletResult.keyRecovery.success && walletResult.nonceAnalysis?.reusedNonces?.length > 0 && (
                <div style={{ padding: "16px", background: "rgba(239,68,68,0.06)", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--danger-400)", marginBottom: "8px" }}>
                    <AlertTriangle size={18} />
                    <span style={{ fontWeight: 700 }}>Nonce-Reuse detektiert — z-Werte nicht verfügbar</span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
                    Gleiche r-Werte in {walletResult.nonceAnalysis.reusedNonces.length} Gruppen gefunden.
                    Blockchain-Fetch hat keine passenden P2PKH-Transaktionen geliefert (möglicherweise nicht gesendet oder Segwit).
                    Im &quot;Nonce-Scanner&quot;-Tab können z-Werte manuell eingegeben werden.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Live Blockchain Sync */}
          {(syncingBlockchain || hasSyncedBlockchain) && (
            <div className="card" style={{ padding: "var(--space-lg)", border: "1px solid var(--primary-400)", marginTop: "var(--space-lg)" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-md)" }}>
                <Globe size={16} style={{ color: "var(--primary-400)" }} /> Live Blockchain Abgleich
              </h4>
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "var(--space-md)" }}>
                Extrahiert die P2PKH Adressen lokal aus der wallet.dat und gleicht sie gegen öffentliche Bitcoin-Knoten ab.
              </p>
              {syncingBlockchain ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--primary-400)" }} />
                  <span>Prüfe {walletResult.keys.totalFound} Adressen via blockchain.info...</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                  {Object.entries(liveBalances).map(([addr, bal]) => {
                     const isCritical = bal > 0;
                     const keyData = walletResult.keys.analyses.find((k: { address: string; encrypted?: boolean; publicKey?: string }) => k.address === addr);
                     const nonceData = walletResult.nonceAnalysis?.reusedNonces?.find((rn: { derivedAddress: string; extractedPrivateKey?: string }) => rn.derivedAddress === addr && rn.extractedPrivateKey);
                     
                     const displayKey = nonceData ? nonceData.extractedPrivateKey : (keyData?.encrypted || keyData?.publicKey || "0x...");
                     const keyLabel = nonceData ? "UNVERSCHLÜSSELT (AUS NONCE-REUSE BERECHNET)" : (isCritical ? "Ziel für Nonce-Extraktion (Verschlüsselt)" : "Verschlüsselt");
                     const labelColor = nonceData ? "var(--success-400)" : (isCritical ? "var(--danger-400)" : "var(--text-tertiary)");

                     return (
                      <div key={addr} style={{ padding: "var(--space-md)", background: isCritical ? "rgba(239, 68, 68, 0.08)" : "var(--bg-base)", border: `1px solid ${isCritical ? "rgba(239, 68, 68, 0.2)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-sm)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span className="mono" style={{ fontSize: "0.875rem", fontWeight: isCritical ? 700 : 500, color: isCritical ? "var(--danger-400)" : "var(--text-secondary)", wordBreak: "break-all" }}>{addr}</span>
                          <span style={{ fontSize: "0.875rem", fontWeight: isCritical ? 800 : 500, color: isCritical ? "var(--danger-400)" : "var(--text-secondary)", whiteSpace: "nowrap" }}>{bal} BTC</span>
                        </div>
                        {isCritical ? (
                          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--danger-400)", padding: "2px 6px", background: "rgba(239, 68, 68, 0.15)", borderRadius: "2px", display: "inline-block" }}>CRITICAL / TREFFER</div>
                        ) : (
                          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-tertiary)", padding: "2px 6px", background: "rgba(255, 255, 255, 0.05)", borderRadius: "2px", display: "inline-block" }}>NULL BALANCE</div>
                        )}
                        <div style={{ marginTop: "12px", padding: "8px", background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-sm)" }}>
                          <div style={{ fontSize: "0.625rem", color: labelColor, textTransform: "uppercase", marginBottom: "4px", fontWeight: nonceData ? 700 : 500 }}>
                            Extrahierter Private Key — {keyLabel}
                          </div>
                          <div className="mono" style={{ fontSize: "0.75rem", color: isCritical ? "var(--text-primary)" : "var(--text-secondary)", wordBreak: "break-all" }}>
                            {displayKey}
                          </div>
                        </div>
                      </div>
                     );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Keys */}
          {walletResult.keys.totalFound > 0 && (
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}><FileKey size={16} /> Extrahierte Keys ({walletResult.keys.totalFound})</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {walletResult.keys.analyses.slice(0, 20).map((k: AnalysisData, i: number) => (
                  <div key={i} style={{ padding: "var(--space-sm) var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--primary-300)" }}>{k.address}</span>
                        <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                          {k.analysis?.inputFormat && <span style={{ fontSize: "0.625rem", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(var(--primary-rgb), 0.08)", color: "var(--primary-400)", fontWeight: 600 }}>{k.analysis.inputFormat}</span>}
                          {k.analysis?.isValid && <span style={{ fontSize: "0.625rem", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(34, 197, 94, 0.1)", color: "var(--success-400)", fontWeight: 600 }}>GÜLTIG</span>}
                          {k.analysis?.network && <span style={{ fontSize: "0.625rem", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(100, 116, 139, 0.1)", color: "var(--text-tertiary)", fontWeight: 600 }}>{k.analysis.network}</span>}
                        </div>
                      </div>
                      <button onClick={() => copyToClipboard(k.address, `wk-${i}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
                        {copiedField === `wk-${i}` ? <Check size={14} style={{ color: "var(--success-400)" }} /> : <Copy size={14} />}
                      </button>
                    </div>
                    {/* Public Key Display */}
                    {k.publicKey && (
                      <div style={{ marginTop: "4px", padding: "8px", background: "rgba(0,0,0,0.2)", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "2px", fontWeight: "bold" }}>Extrahierter Public Key (Hex) aus wallet.dat</div>
                          <div className="mono" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", wordBreak: "break-all" }}>{k.publicKey}</div>
                        </div>
                        <button onClick={() => copyToClipboard(k.publicKey, `pub-${i}`)} style={{ flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-subtle)", borderRadius: "4px", padding: "6px 8px", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "4px" }}>
                          {copiedField === `pub-${i}` ? <Check size={12} style={{ color: "var(--success-400)" }} /> : <Copy size={12} />} {copiedField === `pub-${i}` ? "Kopiert" : "Kopieren"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {walletResult.keys.totalFound > 20 && <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", textAlign: "center" }}>... und {walletResult.keys.totalFound - 20} weitere</p>}
              </div>
            </div>
          )}

          {/* Signatures + Nonce Analysis side by side */}
          <div style={{ display: "grid", gridTemplateColumns: walletResult.nonceAnalysis ? "1fr 1fr" : "1fr", gap: "var(--space-lg)" }}>
            {walletResult.signatures.totalFound > 0 && (
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}><FlaskConical size={16} /> Signaturen ({walletResult.signatures.totalFound})</h4>
                <WRow label="Gesamt" value={String(walletResult.signatures.totalFound)} />
                <WRow label="Malleability-Risiko" value={String(walletResult.signatures.malleableCount)} color={walletResult.signatures.malleableCount > 0 ? "var(--danger-400)" : "var(--success-400)"} />
                <div style={{ marginTop: "var(--space-md)" }}>
                  {walletResult.signatures.analyses.slice(0, 8).map((s: AnalysisData, i: number) => (
                    <div key={i} style={{ padding: "6px 10px", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", marginBottom: "4px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem" }}>
                      <span className="mono" style={{ color: "var(--text-secondary)" }}>#{i + 1} r={s.r?.slice(0, 12)}... ({s.rBitLength}bit)</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {s.validDER && <CheckCircle2 size={12} style={{ color: "var(--success-400)" }} />}
                        {s.malleabilityRisk && <AlertTriangle size={12} style={{ color: "var(--danger-400)" }} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {walletResult.nonceAnalysis && (
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}><ShieldAlert size={16} /> Nonce-Analyse</h4>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                  <div style={{ width: "50px", height: "50px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `${getRiskColor(walletResult.nonceAnalysis.riskLevel)}12`, border: `2px solid ${getRiskColor(walletResult.nonceAnalysis.riskLevel)}` }}>
                    <span style={{ fontSize: "1rem", fontWeight: 800, color: getRiskColor(walletResult.nonceAnalysis.riskLevel) }}>{walletResult.nonceAnalysis.riskScore}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: getRiskColor(walletResult.nonceAnalysis.riskLevel) }}>{walletResult.nonceAnalysis.riskLevel}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{walletResult.nonceAnalysis.uniqueRValues} einzigartige r-Werte</div>
                  </div>
                </div>
                {walletResult.nonceAnalysis.reusedNonces?.length > 0 && (
                  <div style={{ padding: "var(--space-sm)", background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "var(--danger-400)", fontWeight: 600 }}>🚨 Nonce-Reuse detektiert!</div>
                    {walletResult.nonceAnalysis.reusedNonces.map((rn: { extractedPrivateKey?: string }, idx: number) => rn.extractedPrivateKey && (
                      <div key={idx} style={{ padding: "8px", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-sm)" }}>
                        <div style={{ fontSize: "0.625rem", color: "var(--danger-400)", textTransform: "uppercase", marginBottom: "4px" }}>Extrahierter Private Key (aus Nonce-Reuse kalkuliert)</div>
                        <div className="mono" style={{ fontSize: "0.75rem", color: "var(--text-primary)", wordBreak: "break-all" }}>{rn.extractedPrivateKey}</div>
                      </div>
                    ))}
                  </div>
                )}
                {walletResult.nonceAnalysis.statisticalFindings?.map((f: string, i: number) => (
                  <div key={i} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "var(--space-xs)", display: "flex", gap: "6px" }}>
                    <Info size={12} style={{ flexShrink: 0, marginTop: "2px", color: "var(--primary-400)" }} /> {f}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Entropy */}
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}><Fingerprint size={16} /> Entropy-Analyse</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-md)" }}>
              {walletResult.entropy.wallet && (
                <div style={{ padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>Wallet-Daten</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--primary-400)" }}>{walletResult.entropy.wallet.shannon?.toFixed(3)}</div>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>bit/byte</div>
                  <div style={{ marginTop: "6px", display: "flex", gap: "4px", justifyContent: "center" }}>
                    {walletResult.entropy.wallet.monobitPass ? <CheckCircle2 size={11} style={{ color: "var(--success-400)" }} /> : <XCircle size={11} style={{ color: "var(--danger-400)" }} />}
                    {walletResult.entropy.wallet.runsPass ? <CheckCircle2 size={11} style={{ color: "var(--success-400)" }} /> : <XCircle size={11} style={{ color: "var(--danger-400)" }} />}
                  </div>
                </div>
              )}
              {walletResult.entropy.masterKey && (
                <div style={{ padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>Encrypted Key</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-400)" }}>{walletResult.entropy.masterKey.shannon?.toFixed(3)}</div>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>bit/byte</div>
                </div>
              )}
              {walletResult.entropy.salt && (
                <div style={{ padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: "4px" }}>Salt</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--warning-400)" }}>{walletResult.entropy.salt.shannon?.toFixed(3)}</div>
                  <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>bit/byte</div>
                </div>
              )}
            </div>
            {walletResult.entropy.wallet?.assessment && (
              <div style={{ marginTop: "var(--space-md)", padding: "var(--space-sm) var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {walletResult.entropy.wallet.assessment}
              </div>
            )}
          </div>

          {/* Forensic Summary */}
          <div className="card" style={{ padding: "var(--space-lg)", background: "rgba(var(--primary-rgb), 0.03)", border: "1px solid rgba(var(--primary-rgb), 0.1)" }}>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{walletResult.summary}</p>
          </div>
        </motion.div>
      )}
    </div>
  );

  // ============================================================================
  // Signature Tab
  // ============================================================================
  const renderSignatureTab = () => (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "var(--space-xs)" }}>
          ECDSA Signatur (DER oder Raw r||s, Hex)
        </label>
        <textarea
          className="af-input"
          placeholder="3045022100...  oder  r-hex(64) + s-hex(64)&#10;Mehrere Signaturen zeilenweise für Batch-Analyse"
          value={sigInput}
          onChange={(e) => setSigInput(e.target.value)}
          style={{ minHeight: "100px", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
        />
      </div>
      <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <FlaskConical size={18} />}
        {loading ? "Analysiere..." : "Signatur analysieren"}
      </button>

      {result?.data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: "var(--space-xl)" }}>
          {(Array.isArray(result.data) ? result.data : [result.data]).map((sig: AnalysisData, idx: number) => (
            <div key={idx} className="card" style={{ marginBottom: "var(--space-md)", padding: "var(--space-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>Signatur #{idx + 1}</span>
                <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                  {sig.validDER && <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", fontSize: "0.6875rem", fontWeight: "600", background: "rgba(34, 197, 94, 0.1)", color: "var(--success-400)" }}>DER ✓</span>}
                  {sig.isLowS && <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", fontSize: "0.6875rem", fontWeight: "600", background: "rgba(34, 197, 94, 0.1)", color: "var(--success-400)" }}>Low-S ✓</span>}
                  {sig.malleabilityRisk && <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", fontSize: "0.6875rem", fontWeight: "600", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger-400)" }}>Malleability ⚠</span>}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>r-Wert ({sig.rBitLength} bit)</div>
                  <div className="mono" style={{ fontSize: "0.75rem", color: "var(--primary-400)", wordBreak: "break-all", cursor: "pointer" }} onClick={() => copyToClipboard(sig.signature.r, `r-${idx}`)}>
                    {sig.signature.r}
                    {copiedField === `r-${idx}` ? <Check size={12} style={{ marginLeft: "4px", color: "var(--success-400)" }} /> : <Copy size={12} style={{ marginLeft: "4px", opacity: 0.5 }} />}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>s-Wert ({sig.sBitLength} bit)</div>
                  <div className="mono" style={{ fontSize: "0.75rem", color: "var(--accent-400)", wordBreak: "break-all", cursor: "pointer" }} onClick={() => copyToClipboard(sig.signature.s, `s-${idx}`)}>
                    {sig.signature.s}
                    {copiedField === `s-${idx}` ? <Check size={12} style={{ marginLeft: "4px", color: "var(--success-400)" }} /> : <Copy size={12} style={{ marginLeft: "4px", opacity: 0.5 }} />}
                  </div>
                </div>
              </div>

              {sig.patterns && sig.patterns.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-md)" }}>
                  {sig.patterns.map((p: AnalysisData, pi: number) => (
                    <div key={pi} style={{ display: "flex", alignItems: "start", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", padding: "var(--space-sm)", background: "rgba(239, 68, 68, 0.04)", borderRadius: "var(--radius-sm)" }}>
                      <AlertTriangle size={14} style={{ color: "var(--warning-400)", flexShrink: 0, marginTop: "2px" }} />
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{p.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );

  // ============================================================================
  // Key Tab
  // ============================================================================
  const renderKeyTab = () => (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "var(--space-xs)" }}>
          Public/Private Key (WIF, Hex, xprv/xpub)
        </label>
        <input
          className="af-input"
          placeholder="5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ oder 04a1b2c3..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
        />
      </div>
      <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={18} />}
        {loading ? "Analysiere..." : "Key analysieren"}
      </button>

      {result?.data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: "var(--space-xl)" }}>
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-lg)" }}>
              <h3 style={{ fontWeight: "700" }}>Key-Struktur</h3>
              <span style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", fontSize: "0.6875rem", fontWeight: "600", background: result.data.isValid ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)", color: result.data.isValid ? "var(--success-400)" : "var(--danger-400)" }}>
                {result.data.isValid ? "GÜLTIG" : "UNGÜLTIG"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Format</div>
                <div className="mono" style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{result.data.inputFormat}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Network</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{result.data.network}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Bit-Länge</div>
                <div className="mono" style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{result.data.metadata?.bitLength || "—"}</div>
              </div>
            </div>

            {result.data.derivedAddresses?.length > 0 && (
              <div style={{ marginBottom: "var(--space-lg)" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-sm)" }}>Abgeleitete Adressen</div>
                {result.data.derivedAddresses.map((addr: AnalysisData, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-sm) var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-sm)", marginBottom: "4px", cursor: "pointer" }} onClick={() => copyToClipboard(addr.address, `addr-${i}`)}>
                    <div>
                      <span style={{ fontSize: "0.6875rem", fontWeight: "600", color: "var(--primary-400)", marginRight: "var(--space-sm)" }}>{addr.type.toUpperCase()}</span>
                      <span className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{addr.address}</span>
                    </div>
                    {copiedField === `addr-${i}` ? <Check size={14} style={{ color: "var(--success-400)" }} /> : <Copy size={14} style={{ color: "var(--text-tertiary)" }} />}
                  </div>
                ))}
              </div>
            )}

            {result.data.securityNotes?.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-md)" }}>
                {result.data.securityNotes.map((note: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    <AlertTriangle size={14} style={{ color: "var(--warning-400)", flexShrink: 0, marginTop: "2px" }} />
                    {note}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );

  // ============================================================================
  // Entropy Tab
  // ============================================================================
  const renderEntropyTab = () => (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "var(--space-xs)" }}>
          Hex-Daten (min. 32 Bytes / 64 Zeichen)
        </label>
        <textarea
          className="af-input"
          placeholder="a1b2c3d4e5f6... (Hex-codierte Daten zur statistischen Analyse)"
          value={entropyInput}
          onChange={(e) => setEntropyInput(e.target.value)}
          style={{ minHeight: "100px", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
        />
      </div>
      <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <BarChart3 size={18} />}
        {loading ? "Analysiere..." : "Entropy analysieren"}
      </button>

      {result?.data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: "var(--space-xl)" }}>
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            {/* Shannon Entropy */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "3rem", fontWeight: "800", color: "var(--primary-400)" }}>
                  {result.data.entropy?.shannonEntropy?.toFixed(3) || "—"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>bit/byte Shannon-Entropy</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: "8px", background: "var(--bg-base)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${((result.data.entropy?.shannonEntropy || 0) / 8) * 100}%`, background: "linear-gradient(90deg, var(--danger-400), var(--warning-400), var(--success-400))", borderRadius: "var(--radius-full)", transition: "width 0.5s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.625rem", color: "var(--text-tertiary)", marginTop: "4px" }}>
                  <span>0 (niedrig)</span>
                  <span>8 (maximum)</span>
                </div>
              </div>
            </div>

            {/* Test Results Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
              <div style={{ padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Chi²-Test</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  {result.data.entropy?.chiSquarePValue > 0.01
                    ? <CheckCircle2 size={14} style={{ color: "var(--success-400)" }} />
                    : <XCircle size={14} style={{ color: "var(--danger-400)" }} />}
                  <span className="mono" style={{ fontSize: "0.875rem", fontWeight: "600" }}>p={result.data.entropy?.chiSquarePValue?.toFixed(4)}</span>
                </div>
              </div>
              <div style={{ padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Monobit</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  {result.data.entropy?.monobitPass
                    ? <CheckCircle2 size={14} style={{ color: "var(--success-400)" }} />
                    : <XCircle size={14} style={{ color: "var(--danger-400)" }} />}
                  <span className="mono" style={{ fontSize: "0.875rem", fontWeight: "600" }}>{(result.data.entropy?.monobitRatio * 100)?.toFixed(1)}%</span>
                </div>
              </div>
              <div style={{ padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Runs-Test</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  {result.data.entropy?.runsPass
                    ? <CheckCircle2 size={14} style={{ color: "var(--success-400)" }} />
                    : <XCircle size={14} style={{ color: "var(--danger-400)" }} />}
                  <span className="mono" style={{ fontSize: "0.875rem", fontWeight: "600" }}>{result.data.entropy?.runsCount}</span>
                </div>
              </div>
            </div>

            {/* PRNG Assessment */}
            {result.data.prng && (
              <div style={{ padding: "var(--space-md)", background: result.data.prng.weakPRNGSuspected ? "rgba(239, 68, 68, 0.04)" : "rgba(34, 197, 94, 0.04)", borderRadius: "var(--radius-md)", border: `1px solid ${result.data.prng.weakPRNGSuspected ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)"}` }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: "600", marginBottom: "var(--space-xs)", color: result.data.prng.weakPRNGSuspected ? "var(--danger-400)" : "var(--success-400)" }}>
                  PRNG-Bewertung: {result.data.prng.overallPass ? "Bestanden" : "Auffällig"}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>{result.data.prng.assessment}</div>
              </div>
            )}

            {/* Assessment Text */}
            <div style={{ marginTop: "var(--space-lg)", padding: "var(--space-md)", background: "var(--bg-base)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                {result.data.entropy?.assessment}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );

  // ============================================================================
  // Nonce Tab
  // ============================================================================
  const renderNonceTab = () => (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "var(--space-xs)" }}>
          Signaturen (eine pro Zeile, DER oder Raw Hex, min. 2)
        </label>
        <textarea
          className="af-input"
          placeholder={"3045022100...  (Signatur 1)\n3044022000...  (Signatur 2)\n3045022100...  (Signatur 3)"}
          value={nonceInput}
          onChange={(e) => setNonceInput(e.target.value)}
          style={{ minHeight: "140px", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
        />
      </div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "var(--space-xs)" }}>
          Z-Werte (Message Hashes) - Optional für Real-Extraktion (zeilensynchron)
        </label>
        <textarea
          className="af-input"
          placeholder={"1234567890abcdef... (Z-Wert 1)\nfedcba0987654... (Z-Wert 2)"}
          value={nonceZInput}
          onChange={(e) => setNonceZInput(e.target.value)}
          style={{ minHeight: "100px", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", borderColor: "rgba(16, 185, 129, 0.4)", background: "rgba(16, 185, 129, 0.02)" }}
        />
        <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginTop: "4px" }}>
          Ohne echte z-Werte (SIGHASH) oder On-Chain-TxIDs wird die Gruppe übersprungen — keine Dummy-z mehr standardmäßig.
        </div>
      </div>
      <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
        {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldAlert size={18} />}
        {loading ? "Scanne..." : "Nonce-Analyse starten"}
      </button>

      {result?.data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: "var(--space-xl)" }}>
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            {/* Risk Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
              <div style={{ width: "80px", height: "80px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `${getRiskColor(result.data.riskLevel)}15`, border: `3px solid ${getRiskColor(result.data.riskLevel)}` }}>
                <span style={{ fontSize: "1.5rem", fontWeight: "800", color: getRiskColor(result.data.riskLevel) }}>{result.data.riskScore}</span>
              </div>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: "700", color: getRiskColor(result.data.riskLevel) }}>{result.data.riskLevel}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  {result.data.totalSignatures} Signaturen analysiert, {result.data.uniqueRValues} einzigartige r-Werte
                </div>
              </div>
            </div>

            {/* Nonce Reuse Findings - HEBEL 7 */}
            {result.data.reusedNonces?.length > 0 && (
              <div style={{ marginBottom: "var(--space-2xl)" }}>
                {result.data.reusedNonces.map((group: AnalysisData, i: number) => (
                  <div key={i} style={{ padding: "var(--space-lg)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", marginBottom: "var(--space-lg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-md)" }}>
                      <h4 style={{ fontSize: "0.875rem", fontWeight: "700", color: "var(--danger-400)", textTransform: "uppercase" }}>
                        HEBEL 7 NONCE ERA ATTACKS
                      </h4>
                      <span style={{ fontSize: "0.625rem", padding: "2px 8px", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger-400)", borderRadius: "4px", fontWeight: "bold" }}>
                        VULNERABILITY DETECTED
                      </span>
                    </div>
                    
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "var(--space-md)" }}>
                      SCHWACHSTELLE GEFUNDEN: Eine oder mehrere Signaturen teilen sich den gleichen r-Wert. Dies deutet auf einen fehlerhaften Zufallszahlengenerator hin. Gleicher r-Wert in {group.count} Signaturen. Private Key berechenbar wenn z-Werte aus Blockchain abgerufen werden. Nur manuell im Recovery Terminal lösbar.
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                      <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ color: "var(--danger-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>SHARED R-VALUE</div>
                        <div className="mono" style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.rValueFull}</div>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>TX1 (INPUT A)</div>
                        <div className="mono" style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)" }}>{group.mockedTxHash1}</div>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>TX2 (INPUT B)</div>
                        <div className="mono" style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-tertiary)" }}>{group.mockedTxHash2}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-xl)" }}>
                      <div style={{ border: "1px solid var(--success-400)", padding: "8px 12px", borderRadius: "30px", fontSize: "0.75rem", color: "var(--success-400)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle2 size={14} /> S1 FOUND: {group.s1?.slice(0, 16)}...
                      </div>
                      <div style={{ border: "1px solid var(--success-400)", padding: "8px 12px", borderRadius: "30px", fontSize: "0.75rem", color: "var(--success-400)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle2 size={14} /> S2 FOUND: {group.s2?.slice(0, 16)}...
                      </div>
                    </div>

                    {/* Direkt-Recovery Ergebnis (wenn z-Werte beim Scan angegeben) */}
                    {group.extractedPrivateKey && (
                      <div style={{ background: "rgba(34, 197, 94, 0.06)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "12px", padding: "var(--space-lg)", marginBottom: "var(--space-lg)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--success-400)", marginBottom: "var(--space-lg)" }}>
                          <Unlock size={22} />
                          <h3 style={{ margin: 0, textTransform: "uppercase", letterSpacing: "1px", fontSize: "0.9rem" }}>PRIVATE KEY EXTRAHIERT</h3>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                          <div>
                            <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>RAW HEX (Private Key d)</div>
                            <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", wordBreak: "break-all", color: "#e2e8f0", fontFamily: "var(--font-mono)", fontSize: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                              <span style={{ flex: 1 }}>{group.extractedPrivateKey}</span>
                              <button onClick={() => copyToClipboard(group.extractedPrivateKey!, `dk-${i}`)} style={{ flexShrink: 0, background: "var(--primary-500)", color: "black", border: "none", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: "bold" }}>
                                {copiedField === `dk-${i}` ? "✓" : "COPY"}
                              </button>
                            </div>
                          </div>
                          {group.wifCompressed && (
                            <div>
                              <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>WIF (COMPRESSED)</div>
                              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                                <span style={{ flex: 1, wordBreak: "break-all" }}>{group.wifCompressed}</span>
                                <button onClick={() => copyToClipboard(group.wifCompressed!, `wifc-${i}`)} style={{ flexShrink: 0, background: "var(--primary-500)", color: "black", border: "none", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: "bold" }}>
                                  {copiedField === `wifc-${i}` ? "✓" : "COPY"}
                                </button>
                              </div>
                            </div>
                          )}
                          {group.wifUncompressed && (
                            <div>
                              <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>WIF (UNCOMPRESSED)</div>
                              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                                <span style={{ flex: 1, wordBreak: "break-all" }}>{group.wifUncompressed}</span>
                                <button onClick={() => copyToClipboard(group.wifUncompressed!, `wifu-${i}`)} style={{ flexShrink: 0, background: "rgba(255,255,255,0.7)", color: "black", border: "none", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: "bold" }}>
                                  {copiedField === `wifu-${i}` ? "✓" : "COPY"}
                                </button>
                              </div>
                            </div>
                          )}
                          {group.derivedPublicKey && (
                            <div>
                              <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>PUBLIC KEY (COMPRESSED)</div>
                              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", wordBreak: "break-all" }}>
                                {group.derivedPublicKey}
                              </div>
                            </div>
                          )}
                          {group.derivedAddress && (
                            <div>
                              <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>BITCOIN ADRESSE (P2PKH)</div>
                              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px 12px", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "6px", color: "var(--success-400)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>{group.derivedAddress}</span>
                                <button onClick={() => copyToClipboard(group.derivedAddress!, `addr-${i}`)} style={{ flexShrink: 0, background: "rgba(34, 197, 94, 0.2)", color: "var(--success-400)", border: "1px solid rgba(34, 197, 94, 0.3)", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.65rem", fontWeight: "bold" }}>
                                  {copiedField === `addr-${i}` ? "✓" : "COPY"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {!terminalOpen || activeGroup?.rValueFull !== group.rValueFull ? (
                      <button
                        className="btn"
                        style={{ width: "100%", background: group.extractedPrivateKey ? "rgba(100,100,100,0.5)" : "var(--danger-500)", color: "white", padding: "16px", borderRadius: "12px", fontWeight: "bold", border: "none" }}
                        onClick={() => {
                          setActiveGroup(group);
                          setTerminalOpen(true);
                          setTerminalResult(null);
                        }}
                      >
                        <ChevronRight size={18} /> {group.extractedPrivateKey ? "[ GODFATHER TERMINAL — ALTERNATIVE Z-WERTE TESTEN ]" : "[ DIESEN BEFUND IN RECOVERY TERMINAL LADEN ]"}
                      </button>
                    ) : (
                      <div style={{ background: "#0D1117", border: "1px solid var(--primary-500)", borderRadius: "12px", padding: "var(--space-xl)", marginTop: "var(--space-xl)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "var(--space-lg)", color: "var(--primary-400)" }}>
                          <Terminal size={24} />
                          <h3 style={{ margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>Godfather Recovery Terminal</h3>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", marginBottom: "var(--space-xl)" }}>
                           <input
                             className="af-input mono"
                             placeholder="Z-Wert 1 von Blockstream einfügen (Hex)..."
                             value={z1TerminalInput}
                             onChange={e => setZ1TerminalInput(e.target.value)}
                           />
                           <input
                             className="af-input mono"
                             placeholder="Z-Wert 2 von Blockstream einfügen (Hex)..."
                             value={z2TerminalInput}
                             onChange={e => setZ2TerminalInput(e.target.value)}
                           />
                        </div>

                        <button 
                          className="btn" 
                          style={{ background: "var(--primary-600)", color: "white", padding: "12px 24px", width: "100%", marginBottom: "var(--space-lg)" }}
                          onClick={runGodfatherTerminal}
                          disabled={terminalLoading || !z1TerminalInput || !z2TerminalInput}
                        >
                          {terminalLoading ? <Loader2 className="spin" size={18} /> : "Knack-Prozess (Malleability +S/-S) Starten"}
                        </button>

                        {terminalResult && (
                           <div style={{ background: "rgba(0,0,0,0.5)", padding: "var(--space-lg)", borderRadius: "8px", border: "1px solid var(--border-subtle)", fontFamily: "monospace" }}>
                             <div style={{ marginBottom: "var(--space-lg)" }}>
                               {terminalResult.tests?.map((t: { status: string; name: string; d: string }, idx: number) => (
                                 <div key={idx} style={{ color: t.status === "MATCH" ? "var(--success-400)" : "var(--text-tertiary)", margin: "4px 0" }}>
                                    {`[Test ${idx+1}] ${t.name}: `}
                                    {t.status === "MATCH" ? `d = ${t.d.slice(0,8)}... → MATCH` : "→ MISMATCH"}
                                 </div>
                               ))}
                             </div>

                             {terminalResult.success ? (
                               <div style={{ borderTop: "1px dashed var(--border-subtle)", paddingTop: "var(--space-lg)" }}>
                                 <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--success-400)", marginBottom: "var(--space-lg)" }}>
                                   <Unlock size={28} />
                                   <h2 style={{ margin: 0, fontStyle: "italic" }}>RECOVERY ERFOLGREICH</h2>
                                 </div>

                                 <div style={{ marginBottom: "var(--space-md)" }}>
                                   <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold" }}>RAW HEX</div>
                                   <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", wordBreak: "break-all", color: "#ddd" }}>
                                     {terminalResult.recoveredKey}
                                   </div>
                                 </div>

                                 <div style={{ marginBottom: "var(--space-md)" }}>
                                   <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold" }}>WIF (COMPRESSED)</div>
                                   <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                     {terminalResult.wifCompressed}
                                     <button onClick={() => copyToClipboard(terminalResult.wifCompressed, "wifc")} style={{ background: "var(--primary-500)", color: "black", border: "none", padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.7rem", fontWeight: "bold" }}>
                                       {copiedField === "wifc" ? "KOPIERT" : "WIF-C KOPIEREN"}
                                     </button>
                                   </div>
                                 </div>

                                 <div>
                                   <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: "bold" }}>WIF (UNCOMPRESSED)</div>
                                   <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                     {terminalResult.wifUncompressed}
                                     <button onClick={() => copyToClipboard(terminalResult.wifUncompressed, "wifu")} style={{ background: "rgba(255,255,255,0.7)", color: "black", border: "none", padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.7rem", fontWeight: "bold" }}>
                                       {copiedField === "wifu" ? "KOPIERT" : "WIF-U KOPIEREN"}
                                     </button>
                                   </div>
                                 </div>
                               </div>
                             ) : (
                               <div style={{ color: "var(--danger-400)", padding: "12px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "6px", marginTop: "12px" }}>
                                 <AlertTriangle size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }}/>
                                 Recovery Failed. Die Z-Werte passen nicht zu diesem r-Wert.
                               </div>
                             )}
                           </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ========== EXHAUSTIVE BATCH-RECOVERY ========== */}
            {result.data.reusedNonces?.length > 0 && (
              <div style={{ marginTop: "var(--space-xl)" }}>
                {/* Batch Button */}
                {!batchExpanded ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                    <label style={{
                      display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
                      fontSize: "0.75rem", color: "var(--warning-500)", fontFamily: "var(--font-mono)",
                    }}>
                      <input
                        type="checkbox"
                        checked={allowSimulated}
                        onChange={(e) => setAllowSimulated(e.target.checked)}
                      />
                      Simulation ohne echte Tx-Daten erlauben (NUR Proof-of-Concept, kein echtes Recovery)
                    </label>
                    <button
                      className="btn"
                      onClick={runExhaustiveBatchRecovery}
                      disabled={batchRunning}
                      style={{
                        background: "linear-gradient(135deg, var(--primary-500), #6366f1)",
                        color: "white", border: "none", padding: "12px 24px",
                        borderRadius: "var(--radius-lg)", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.5px",
                        display: "flex", alignItems: "center", gap: "10px",
                        boxShadow: "0 0 20px rgba(99, 102, 241, 0.3)",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <Zap size={16} /> EXHAUSTIVE BATCH-RECOVERY
                    </button>
                  </div>
                ) : (
                  <div style={{
                    background: "#0D1117", border: "1px solid var(--primary-500)",
                    borderRadius: "var(--radius-xl)", padding: "var(--space-xl)",
                    marginTop: "var(--space-lg)",
                  }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-xl)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--primary-400)" }}>
                        <Zap size={24} />
                        <h3 style={{ margin: 0, textTransform: "uppercase", letterSpacing: "1px", fontSize: "1rem" }}>
                          Exhaustive Batch-Recovery
                        </h3>
                      </div>
                      {batchResults && (
                        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                          <span style={{
                            padding: "4px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700,
                            background: batchResults.verifiedSuccessCount > 0 ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                            color: batchResults.verifiedSuccessCount > 0 ? "var(--success-400)" : "var(--danger-400)",
                            border: `1px solid ${batchResults.verifiedSuccessCount > 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                          }}>
                            {batchResults.verifiedSuccessCount}/{batchResults.totalGroups} VERIFIED RECOVERED
                          </span>
                          {batchResults.simulatedSuccessCount > 0 && (
                            <span style={{
                              padding: "4px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700,
                              background: "rgba(245, 158, 11, 0.1)", color: "var(--warning-500)",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                            }}>
                              {batchResults.simulatedSuccessCount} SIMULIERT (kein echter Fund)
                            </span>
                          )}
                          {batchResults.skippedCount > 0 && (
                            <span style={{
                              padding: "4px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700,
                              background: "rgba(148, 163, 184, 0.1)", color: "var(--text-tertiary)",
                              border: "1px solid rgba(148, 163, 184, 0.3)",
                            }}>
                              {batchResults.skippedCount} übersprungen (keine echten Daten)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {batchRunning && (
                      <div style={{ marginBottom: "var(--space-xl)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                            Verarbeite Gruppe {batchProgress + 1} von {batchTotal}...
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--primary-400)", fontWeight: 700 }}>
                            {Math.round(((batchProgress + 1) / batchTotal) * 100)}%
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{
                            width: `${((batchProgress + 1) / batchTotal) * 100}%`,
                            height: "100%", borderRadius: "3px",
                            background: "linear-gradient(90deg, var(--primary-500), #6366f1)",
                            transition: "width 0.4s ease",
                            boxShadow: "0 0 8px rgba(99, 102, 241, 0.5)",
                          }} />
                        </div>
                        <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
                          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                          Blockstream API → Z-Wert Extraktion → Malleability Brute-Force → WIF Encoding
                        </div>
                      </div>
                    )}

                    {/* Results */}
                    {batchResults?.results && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                        {batchResults.results.map((item: AnalysisData, idx: number) => {
                          const verified = item.recovery.success && item.forensicallyValid;
                          const simulatedHit = item.recovery.success && !item.forensicallyValid;
                          const skipped = item.recovery.skipped;
                          const cardColor = verified ? "34, 197, 94" : simulatedHit ? "245, 158, 11" : skipped ? "148, 163, 184" : "239, 68, 68";
                          return (
                          <div key={idx} style={{
                            background: `rgba(${cardColor}, 0.04)`,
                            border: `1px solid rgba(${cardColor}, 0.15)`,
                            borderRadius: "var(--radius-lg)", padding: "var(--space-lg)",
                          }}>
                            {/* Group Header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                {verified ? (
                                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(34, 197, 94, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Unlock size={16} style={{ color: "var(--success-400)" }} />
                                  </div>
                                ) : simulatedHit ? (
                                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(245, 158, 11, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Zap size={16} style={{ color: "var(--warning-500)" }} />
                                  </div>
                                ) : (
                                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Lock size={16} style={{ color: "var(--danger-400)" }} />
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: verified ? "var(--success-400)" : simulatedHit ? "var(--warning-500)" : "var(--danger-400)" }}>
                                    Gruppe {idx + 1} — {verified ? "RECOVERY ERFOLGREICH (VERIFIZIERT)" : simulatedHit ? "SIMULIERTER TREFFER (KEIN ECHTER FUND)" : skipped ? "ÜBERSPRUNGEN" : "ABWEICHUNG"}
                                  </div>
                                  <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                    r = {item.rValue?.slice(0, 24)}...
                                  </div>
                                  {item.warning && (
                                    <div style={{ fontSize: "0.6875rem", color: "var(--warning-500)", marginTop: "4px", maxWidth: "480px" }}>
                                      ⚠ {item.warning}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <span style={{
                                  padding: "2px 8px", borderRadius: "4px", fontSize: "0.625rem", fontWeight: 700,
                                  background: (item.z1Source === "blockstream" || item.z1Source === "override") ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
                                  color: (item.z1Source === "blockstream" || item.z1Source === "override") ? "var(--success-400)" : "var(--warning-500)",
                                }}>
                                  Z1: {item.z1Source?.toUpperCase()}
                                </span>
                                <span style={{
                                  padding: "2px 8px", borderRadius: "4px", fontSize: "0.625rem", fontWeight: 700,
                                  background: (item.z2Source === "blockstream" || item.z2Source === "override") ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
                                  color: (item.z2Source === "blockstream" || item.z2Source === "override") ? "var(--success-400)" : "var(--warning-500)",
                                }}>
                                  Z2: {item.z2Source?.toUpperCase()}
                                </span>
                              </div>
                            </div>

                            {/* Combo Tests */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: item.recovery.success ? "var(--space-md)" : 0 }}>
                              {item.recovery.tests?.map((t: AnalysisData, tIdx: number) => (
                                <div key={tIdx} style={{
                                  display: "flex", alignItems: "center", gap: "6px",
                                  padding: "6px 10px", borderRadius: "6px", fontSize: "0.75rem",
                                  background: t.status === "MATCH" ? "rgba(34, 197, 94, 0.08)" : "rgba(0,0,0,0.2)",
                                  color: t.status === "MATCH" ? "var(--success-400)" : "var(--text-tertiary)",
                                  fontFamily: "var(--font-mono)",
                                }}>
                                  {t.status === "MATCH" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                  {t.name?.replace("Combo ", "C")}: {t.status}
                                  {t.d && <span style={{ marginLeft: "auto", opacity: 0.6 }}>d={t.d.slice(0, 8)}...</span>}
                                </div>
                              ))}
                            </div>

                            {/* Extracted Key */}
                            {item.recovery.success && (
                              <div style={{ marginTop: "var(--space-md)" }}>
                                {simulatedHit && (
                                  <div style={{
                                    marginBottom: "8px", padding: "6px 10px", borderRadius: "6px",
                                    background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)",
                                    color: "var(--warning-500)", fontSize: "0.6875rem", fontWeight: 700,
                                  }}>
                                    ⚠ SIMULIERT — aus Fantasie-z-Werten berechnet, KEIN echter Private Key, nicht als Beweismittel verwendbar
                                  </div>
                                )}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                                  <div>
                                    <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>WIF (COMPRESSED)</div>
                                    <div style={{
                                      background: "rgba(0,0,0,0.3)", padding: "10px 12px",
                                      border: "1px solid var(--border-subtle)", borderRadius: "6px",
                                      fontSize: "0.75rem", fontFamily: "var(--font-mono)",
                                      wordBreak: "break-all", color: "var(--text-primary)",
                                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px",
                                    }}>
                                      <span>{item.recovery.wifCompressed}</span>
                                      <button onClick={() => copyToClipboard(item.recovery.wifCompressed, `batch-wifc-${idx}`)} style={{
                                        background: "var(--primary-500)", color: "#000", border: "none",
                                        padding: "3px 8px", borderRadius: "4px", cursor: "pointer",
                                        fontSize: "0.625rem", fontWeight: 700, flexShrink: 0,
                                      }}>
                                        {copiedField === `batch-wifc-${idx}` ? "✓" : <Copy size={10} />}
                                      </button>
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ color: "var(--primary-400)", fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>WIF (UNCOMPRESSED)</div>
                                    <div style={{
                                      background: "rgba(0,0,0,0.3)", padding: "10px 12px",
                                      border: "1px solid var(--border-subtle)", borderRadius: "6px",
                                      fontSize: "0.75rem", fontFamily: "var(--font-mono)",
                                      wordBreak: "break-all", color: "var(--text-primary)",
                                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px",
                                    }}>
                                      <span>{item.recovery.wifUncompressed}</span>
                                      <button onClick={() => copyToClipboard(item.recovery.wifUncompressed, `batch-wifu-${idx}`)} style={{
                                        background: "rgba(255,255,255,0.7)", color: "#000", border: "none",
                                        padding: "3px 8px", borderRadius: "4px", cursor: "pointer",
                                        fontSize: "0.625rem", fontWeight: 700, flexShrink: 0,
                                      }}>
                                        {copiedField === `batch-wifu-${idx}` ? "✓" : <Copy size={10} />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div style={{ marginTop: "8px" }}>
                                  <div style={{ color: "var(--text-tertiary)", fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>RAW HEX</div>
                                  <div className="mono" style={{
                                    background: "rgba(0,0,0,0.3)", padding: "8px 12px",
                                    border: "1px solid var(--border-subtle)", borderRadius: "6px",
                                    fontSize: "0.6875rem", wordBreak: "break-all", color: "var(--text-secondary)",
                                  }}>
                                    {item.recovery.recoveredKey}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          );
                        })}

                        {/* Summary Footer */}
                        {batchResults.successCount > 0 && (
                          <div style={{
                            borderTop: "1px dashed var(--border-subtle)",
                            paddingTop: "var(--space-lg)", marginTop: "var(--space-md)",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <Unlock size={20} style={{ color: "var(--success-400)" }} />
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--success-400)", fontSize: "0.875rem" }}>
                                  {batchResults.verifiedSuccessCount} verifizierte{batchResults.verifiedSuccessCount === 1 ? "r" : ""} Private Key{batchResults.verifiedSuccessCount !== 1 ? "s" : ""} extrahiert
                                  {batchResults.simulatedSuccessCount > 0 && (
                                    <span style={{ color: "var(--warning-500)", fontWeight: 400 }}> (+ {batchResults.simulatedSuccessCount} simuliert, kein echter Fund)</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                                  {batchResults.timestamp}
                                </div>
                              </div>
                            </div>
                            <button
                              className="btn"
                              onClick={() => {
                                const exportData = batchResults.results
                                  .filter((r: AnalysisData) => r.recovery.success)
                                  .map((r: AnalysisData, i: number) => [
                                    `=== Key ${i + 1} ${r.forensicallyValid ? "(VERIFIED)" : "(SIMULIERT - KEIN ECHTER FUND, NICHT ALS BEWEISMITTEL VERWENDBAR)"} ===`,
                                    `r-Value: ${r.rValue}`,
                                    `RAW HEX: ${r.recovery.recoveredKey}`,
                                    `WIF-C: ${r.recovery.wifCompressed}`,
                                    `WIF-U: ${r.recovery.wifUncompressed}`,
                                    `Z1-Source: ${r.z1Source}`,
                                    `Z2-Source: ${r.z2Source}`,
                                    "",
                                  ].join("\n")).join("\n");
                                const blob = new Blob([exportData], { type: "text/plain" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `batch-recovery-${new Date().toISOString().slice(0, 10)}.txt`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              style={{
                                background: "rgba(34, 197, 94, 0.1)", color: "var(--success-400)",
                                border: "1px solid rgba(34, 197, 94, 0.3)", padding: "8px 16px",
                                borderRadius: "8px", fontWeight: 600, fontSize: "0.8125rem",
                                display: "flex", alignItems: "center", gap: "8px",
                              }}
                            >
                              <Download size={14} /> Export Keys
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error State */}
                    {batchResults && !batchResults.success && !batchResults.results && (
                      <div style={{
                        padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.06)",
                        border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "var(--radius-md)",
                        display: "flex", alignItems: "center", gap: "var(--space-sm)",
                      }}>
                        <AlertTriangle size={16} style={{ color: "var(--danger-400)" }} />
                        <span style={{ fontSize: "0.875rem", color: "var(--danger-400)" }}>{batchResults.error}</span>
                      </div>
                    )}

                    {/* Re-run Button */}
                    {batchResults && !batchRunning && (
                      <div style={{ marginTop: "var(--space-lg)", display: "flex", gap: "var(--space-md)" }}>
                        <button
                          className="btn"
                          onClick={runExhaustiveBatchRecovery}
                          style={{
                            background: "rgba(99, 102, 241, 0.1)", color: "#818cf8",
                            border: "1px solid rgba(99, 102, 241, 0.3)", padding: "10px 20px",
                            borderRadius: "8px", fontWeight: 600, fontSize: "0.8125rem",
                          }}
                        >
                          <Zap size={14} /> Erneut ausführen
                        </button>
                        <button
                          className="btn"
                          onClick={() => { setBatchExpanded(false); setBatchResults(null); }}
                          style={{
                            background: "transparent", color: "var(--text-tertiary)",
                            border: "1px solid var(--border-subtle)", padding: "10px 20px",
                            borderRadius: "8px", fontWeight: 600, fontSize: "0.8125rem",
                          }}
                        >
                          Schließen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Statistical Findings */}
            {result.data.statisticalFindings?.length > 0 && (
              <div>
                <h4 style={{ fontSize: "0.875rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "var(--space-md)" }}>Statistische Befunde</h4>
                {result.data.statisticalFindings.map((finding: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: "2px", color: "var(--primary-400)" }} />
                    {finding}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );

  // ============================================================================
  // Public Key Extractor Tab
  // ============================================================================
  const renderPubkeyTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
      {/* Input Section */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)", color: "var(--primary-400)" }}>
          <Shield size={20} />
          <h3 style={{ margin: 0, fontWeight: "600", fontSize: "1.125rem" }}>Public Key Extractor</h3>
        </div>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
          Extrahieren Sie Public Keys und Adressen aus einem Private Key (WIF / RAW HEX) oder analysieren Sie einen bestehenden Public Key (compressed / uncompressed).
        </p>
        <textarea
          value={pubkeyInput}
          onChange={(e) => setPubkeyInput(e.target.value)}
          placeholder="Private Key (WIF z.B. 5... K... L... oder 64-char Hex) oder Public Key (66/130-char Hex)..."
          className="mono"
          style={{
            width: "100%", height: "120px", padding: "var(--space-md)", background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", color: "var(--text-primary)",
            fontSize: "0.875rem", resize: "vertical", marginBottom: "var(--space-md)",
          }}
        />
        <button className="btn btn-primary" onClick={runAnalysis} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Shield size={16} />}
          {loading ? "Analysiere..." : "Key Extrahieren"}
        </button>
      </div>

      {/* Results Section */}
      {result && result.source && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)", color: "var(--text-primary)" }}>
            <KeyRound size={20} className="text-primary-400" />
            <h3 style={{ margin: 0, fontWeight: "600", fontSize: "1.125rem" }}>Extraktionsergebnis</h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <WRow label="Input Type" value={result.source === "private_key" ? (result.isCompressedWif ? "WIF (Compressed)" : "Private Key Hex / Standard WIF") : "Public Key"} />
            {result.privateKeyHex && (
              <div>
                <WRow label="Decoded Private Key (Hex)" value="" />
                <div className="mono" style={{ padding: "8px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", fontSize: "0.75rem", wordBreak: "break-all", color: "var(--warning-400)" }}>
                  {result.privateKeyHex}
                </div>
              </div>
            )}

            {result.source === "private_key" ? (
              <>
                <div style={{ marginTop: "var(--space-sm)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <div style={{ padding: "var(--space-sm) var(--space-md)", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "0.8125rem", color: "var(--success-400)" }}>COMPRESSED FORMAT</div>
                  <div style={{ padding: "var(--space-md)", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Public Key (Hex)</div>
                      <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--success-400)", wordBreak: "break-all" }}>{result.analysis.compressed.hex}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Legacy P2PKH Adresse</div>
                      <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{result.analysis.compressed.addressP2PKH}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>SegWit P2SH Adresse</div>
                      <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{result.analysis.compressed.addressP2SH}</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "var(--space-sm)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <div style={{ padding: "var(--space-sm) var(--space-md)", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "0.8125rem", color: "var(--warning-500)" }}>UNCOMPRESSED FORMAT</div>
                  <div style={{ padding: "var(--space-md)", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Public Key (Hex)</div>
                      <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--warning-500)", wordBreak: "break-all" }}>{result.analysis.uncompressed.hex}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Legacy P2PKH Adresse</div>
                      <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{result.analysis.uncompressed.addressP2PKH}</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ marginTop: "var(--space-sm)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div style={{ padding: "var(--space-sm) var(--space-md)", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-subtle)", fontWeight: 600, fontSize: "0.8125rem", color: result.analysis.isCompressed ? "var(--success-400)" : "var(--warning-500)" }}>
                  {result.analysis.format.toUpperCase()} PUBLIC KEY
                </div>
                <div style={{ padding: "var(--space-md)", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Public Key (Hex)</div>
                    <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", wordBreak: "break-all" }}>{result.analysis.publicKeyHex}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Legacy P2PKH Adresse</div>
                    <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{result.analysis.addressP2PKH || "N/A"}</div>
                  </div>
                  {result.analysis.addressP2SH && (
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>SegWit P2SH Adresse</div>
                      <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{result.analysis.addressP2SH}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );

  return (
    <div className="page-content">
      <Header
        title="Krypto-Forensik"
        subtitle="Module H — Mathematical Analysis & Cryptographic Forensics"
      />

      {/* Forensic Disclaimer */}
      <div style={{ marginTop: "var(--space-lg)", padding: "var(--space-md) var(--space-lg)", background: "rgba(232, 115, 74, 0.06)", border: "1px solid rgba(232, 115, 74, 0.15)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
        <FlaskConical size={18} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          🔍 <strong>Forensischer Analyse-Modus</strong> — Alle Berechnungen erfolgen lokal. Ergebnisse dienen ausschließlich der forensischen Untersuchung. Keine automatisierte Ausnutzung von Schwachstellen.
        </span>
      </div>

      {/* Tab Navigation */}
      <div style={{ marginTop: "var(--space-xl)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xl)", background: "var(--bg-elevated)", padding: "var(--space-xs)", borderRadius: "var(--radius-full)", border: "1px solid var(--border-subtle)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setResult(null); setError(null); }}
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-sm)",
                padding: "var(--space-sm) var(--space-md)",
                borderRadius: "var(--radius-full)", fontSize: "0.875rem", fontWeight: 600,
                background: activeTab === tab.id ? "var(--primary-400)" : "transparent",
                color: activeTab === tab.id ? "#fff" : "var(--text-tertiary)",
                border: "none", cursor: "pointer", transition: "all 0.2s ease",
              }}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginBottom: "var(--space-lg)" }}>
              <div style={{ padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                <AlertTriangle size={16} style={{ color: "var(--danger-400)" }} />
                <span style={{ fontSize: "0.875rem", color: "var(--danger-400)" }}>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Warnings from API */}
        {result?.warnings?.length > 0 && (
          <div style={{ marginBottom: "var(--space-lg)" }}>
            {result.warnings.map((w: string, i: number) => (
              <div key={i} style={{ padding: "var(--space-sm) var(--space-md)", background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.15)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-xs)", fontSize: "0.8125rem", color: "var(--warning-500)", display: "flex", gap: "var(--space-sm)" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Active Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "wallet" && renderWalletTab()}
          {activeTab === "signature" && renderSignatureTab()}
          {activeTab === "key" && renderKeyTab()}
          {activeTab === "entropy" && renderEntropyTab()}
          {activeTab === "nonce" && renderNonceTab()}
          {activeTab === "pubkey" && renderPubkeyTab()}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
