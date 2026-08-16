/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState } from "react";
import { Search, Copy, Download, ShieldCheck, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface UnencryptedKey {
  address: string;
  wif: string;
  public_key_hex: string;
  private_key_hex: string;
  compressed: boolean;
}

export default function UnencryptedViewer({ keys }: { keys: UnencryptedKey[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedWif, setCopiedWif] = useState<string | null>(null);

  const filteredKeys = keys.filter(k => 
     k.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
     k.wif.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const copyToClipboard = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedWif(id);
      setTimeout(() => setCopiedWif(null), 2000);
  };

  const downloadCSV = () => {
      const header = "Address,WIF Private Key,Compressed,Public Key Hex\n";
      const rows = keys.map(k => `${k.address},${k.wif},${k.compressed},${k.public_key_hex}`).join("\n");
      const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "alphaforensic_unencrypted_keys.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <motion.div 
       className="card" 
       initial={{ opacity: 0, y: 20 }}
       animate={{ opacity: 1, y: 0 }}
       style={{ 
          marginTop: "var(--space-xl)",
          border: "1px solid var(--success-500)",
          boxShadow: "0 0 20px rgba(16, 185, 129, 0.1)"
       }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-lg)" }}>
         <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
               <div style={{ background: "rgba(16, 185, 129, 0.15)", padding: "8px", borderRadius: "8px", color: "var(--success-400)" }}>
                  <ShieldCheck size={24} />
               </div>
               <h2 style={{ fontSize: "1.25rem", color: "var(--text-primary)" }}>Unverschlüsselte Wallet erkannt</h2>
            </div>
            <p style={{ color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
               Diese Wallet benötigt kein Passwort. {keys.length} Private Keys wurden direkt aus der Binärstruktur extrahiert.
            </p>
         </div>
         <button onClick={downloadCSV} className="btn" style={{ background: "var(--bg-hover)", border: "1px solid var(--border-subtle)" }}>
            <Download size={16} style={{ color: "var(--text-primary)" }} />
            Als CSV exportieren
         </button>
      </div>

      <div style={{ position: "relative", marginBottom: "var(--space-lg)" }}>
         <Search size={18} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
         <input 
            type="text" 
            placeholder="Nach Adresse oder WIF Key suchen..." 
            className="form-input"
            style={{ paddingLeft: "42px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
         />
      </div>

      <div className="table-container" style={{ maxHeight: "600px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
         <table style={{ minWidth: "100%", margin: 0 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-elevated)" }}>
               <tr>
                  <th>Öffentliche Adresse (P2PKH)</th>
                  <th>Privater Schlüssel (WIF)</th>
                  <th style={{ width: "80px", textAlign: "right" }}>Aktion</th>
               </tr>
            </thead>
            <tbody>
               {filteredKeys.length === 0 ? (
                  <tr>
                     <td colSpan={3} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        Keine Adressen gefunden für &quot;{searchTerm}&quot;
                     </td>
                  </tr>
               ) : (
                  filteredKeys.map((k, idx) => (
                     <tr key={idx}>
                        <td>
                           <span className="mono" style={{ color: "var(--primary-300)" }}>
                              {k.address}
                           </span>
                           {k.compressed && <span style={{ marginLeft: "8px", fontSize: "0.65rem", background: "var(--bg-hover)", padding: "2px 6px", borderRadius: "10px", color: "var(--text-tertiary)" }}>KOMPRIMIERT</span>}
                        </td>
                        <td>
                           <span className="mono" style={{ color: "var(--warning-300)", filter: "blur(0px)" }}>
                              {k.wif}
                           </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                           <button 
                              onClick={() => copyToClipboard(k.wif, k.wif)}
                              className="header-btn" 
                              title="WIF kopieren"
                           >
                              {copiedWif === k.wif ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                           </button>
                        </td>
                     </tr>
                  ))
               )}
            </tbody>
         </table>
      </div>
    </motion.div>
  );
}
