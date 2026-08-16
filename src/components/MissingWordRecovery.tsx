"use client";

import { useState } from "react";
import { Puzzle, Loader2, KeyRound, CheckCircle2, Globe } from "lucide-react";

interface Candidate {
  mnemonic: string;
  filledWords: string[];
  addresses: string[];
  onchain?: { address: string; txCount: number; balanceBtc: string } | null;
  isMatch?: boolean;
}
interface RecoverResponse {
  success: boolean;
  error?: string;
  unknownPositions: number[];
  totalCombinations: number;
  checksumValid: number;
  truncated: boolean;
  onchainChecked: number;
  matched: Candidate | null;
  candidates: Candidate[];
}

export default function MissingWordRecovery() {
  const [phrase, setPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [checkOnChain, setCheckOnChain] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<RecoverResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const words = phrase.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      setError("Bitte Phrase eingeben (unbekannte Wörter mit ? markieren)");
      return;
    }
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/seed-recovery/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words, passphrase: passphrase || undefined, targetAddress: targetAddress || undefined, checkOnChain }),
      }).then((x) => x.json());
      if (r.success) setRes(r);
      else setError(r.error || "Recovery fehlgeschlagen");
    } catch {
      setError("Recovery fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: "var(--space-xl)", marginTop: "var(--space-lg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
        <Puzzle size={20} style={{ color: "var(--primary-500)" }} />
        <div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Fehlende Wörter wiederherstellen</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: "2px 0 0" }}>
            Unbekannte Wörter mit <code>?</code> markieren (max. 2). Checksum-Filter + HD-Ableitung; optional On-Chain-Bestätigung.
          </p>
        </div>
      </div>

      <textarea
        className="af-input form-input"
        rows={3}
        placeholder="z.B.  legal winner thank year wave sausage worth useful legal winner thank ?"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", width: "100%" }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginTop: "var(--space-md)" }}>
        <div>
          <label className="form-label">BIP39-Passphrase (optional)</label>
          <input className="af-input form-input" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="leer lassen, falls keine" />
        </div>
        <div>
          <label className="form-label">Bekannte Adresse (optional, beschleunigt)</label>
          <input className="af-input form-input" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} placeholder="1... (falls bekannt)" style={{ fontFamily: "var(--font-mono)" }} />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", cursor: "pointer", marginTop: "var(--space-md)" }}>
        <input type="checkbox" checked={checkOnChain} onChange={() => setCheckOnChain((v) => !v)} style={{ width: 16, height: 16 }} />
        <Globe size={14} /> On-Chain-Bestätigung (prüft Adressen gegen die Blockchain — langsamer)
      </label>

      <button className="btn btn-primary" onClick={run} disabled={loading} style={{ marginTop: "var(--space-md)", display: "flex", alignItems: "center", gap: "8px" }}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Wiederherstellen
      </button>

      {error && <div style={{ marginTop: "var(--space-md)", color: "var(--danger-400)", fontSize: "0.8125rem" }}>{error}</div>}

      {res && (
        <div style={{ marginTop: "var(--space-lg)" }}>
          <div style={{ display: "flex", gap: "var(--space-lg)", flexWrap: "wrap", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
            <span>Kombinationen: <b>{res.totalCombinations.toLocaleString("de-DE")}</b></span>
            <span>Checksum-gültig: <b style={{ color: "var(--success-400)" }}>{res.checksumValid}</b></span>
            {res.onchainChecked > 0 && <span>On-Chain geprüft: <b>{res.onchainChecked}</b></span>}
            {res.truncated && <span style={{ color: "var(--warning-400)" }}>Limit erreicht</span>}
          </div>

          {res.matched ? (
            <div style={{ padding: "var(--space-lg)", borderRadius: "var(--radius-md)", background: "rgba(16,185,129,0.1)", border: "1px solid var(--success-400)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--success-400)", fontWeight: 700, marginBottom: "8px" }}>
                <CheckCircle2 size={18} /> Treffer bestätigt
              </div>
              <div className="mono" style={{ fontSize: "0.9375rem", marginBottom: "6px", wordBreak: "break-word" }}>{res.matched.mnemonic}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                Adresse: <span className="mono">{res.matched.addresses[0]}</span>
                {res.matched.onchain && <> · {res.matched.onchain.txCount} Tx · {res.matched.onchain.balanceBtc} BTC</>}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", marginBottom: "8px" }}>
                {res.checksumValid === 0
                  ? "Keine checksum-gültige Kombination gefunden — Eingabe prüfen."
                  : `${res.candidates.length} checksum-gültige Kandidaten (kein eindeutiger Treffer — bekannte Adresse angeben oder On-Chain-Prüfung aktivieren):`}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "260px", overflowY: "auto" }}>
                {res.candidates.slice(0, 50).map((c, i) => (
                  <div key={i} className="card" style={{ padding: "8px 12px", background: "var(--bg-secondary)" }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)" }}>Eingesetzt: <b style={{ color: "var(--primary-400)" }}>{c.filledWords.join(", ")}</b></div>
                    <div className="mono" style={{ fontSize: "0.6875rem", wordBreak: "break-word" }}>{c.addresses[0]}{c.onchain ? ` · ${c.onchain.txCount} Tx · ${c.onchain.balanceBtc} BTC` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
