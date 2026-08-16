"use client";

import { motion } from "framer-motion";
import { 
  Settings2, 
  Cpu, 
  Key,  
  ArrowRight,
  Zap,
  Layers,
  Database,
  FileText,
  HardDrive,
  Image,
  ScanSearch,
} from "lucide-react";
import Header from "@/components/Header";
import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { FlaskConical } from "lucide-react";

interface Extension {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  status: string;
  color: string;
  category: string;
  badge: string;
}

const extensions: Extension[] = [
  {
    id: "gpu-cluster",
    title: "GPU Hardware",
    description: "Überwachung der lokalen GPU-Hardware für beschleunigte Recovery-Jobs.",
    icon: Cpu,
    href: "/gpu-cluster",
    status: "Aktiv",
    color: "var(--primary-500)",
    category: "Hardware",
    badge: "Lokal"
  },
  {
    id: "seed-recovery",
    title: "Seed-Phrase-Wiederherstellung",
    description: "Spezialisierte Algorithmen zur Wiederherstellung von mnemonischen Phrasen (BIP39).",
    icon: Key,
    href: "/seed-recovery",
    status: "Aktiv",
    color: "var(--accent-500)",
    category: "Crypto",
    badge: "BIP39/44"
  },
  {
    id: "ai-rules",
    title: "KI-Regelengine",
    description: "Verwaltung der KI-gestützten Transformationsregeln für Dictionary-Attacken.",
    icon: Settings2,
    href: "/ai-rules",
    status: "Aktiv",
    color: "var(--primary-400)",
    category: "Intelligence",
    badge: "Rule Engine"
  },
  {
    id: "crypto-forensics",
    title: "Kryptografische Analyse",
    description: "Module H — ECDSA-Signatur-Analyse, Key-Struktur, Entropy-Tests, Nonce-Detection.",
    icon: FlaskConical,
    href: "/advanced-analysis",
    status: "Aktiv",
    color: "#f97316",
    category: "Crypto-Forensik",
    badge: "Module H"
  },
  {
    id: "doc-breaker",
    title: "Document Breaker",
    description: "Hash-Extraktion aus verschlüsselten Dokumenten — PDF, Office, ZIP, RAR, 7-Zip.",
    icon: FileText,
    href: "/doc-breaker",
    status: "Aktiv",
    color: "#ef4444",
    category: "Forensik-Tools",
    badge: "Hash-Extraktion"
  },
  {
    id: "file-carver",
    title: "File Carver",
    description: "Magic-Byte Scanning zur Erkennung eingebetteter Dateien in Binärdaten und Disk-Images.",
    icon: HardDrive,
    href: "/file-carver",
    status: "Aktiv",
    color: "#06b6d4",
    category: "Forensik-Tools",
    badge: "12 Signaturen"
  },
  {
    id: "stego",
    title: "Steganografie-Analyse",
    description: "Versteckte Daten in Bildern erkennen — EXIF, LSB-Analyse, Metadaten, PEM-Keys.",
    icon: Image,
    href: "/stego",
    status: "Aktiv",
    color: "#8b5cf6",
    category: "Forensik-Tools",
    badge: "Stego-Scan"
  },
  {
    id: "memory-scan",
    title: "Memory Scanner",
    description: "RAM-Dumps und Binärdateien nach Krypto-Artefakten durchsuchen (WIF, xprv, Seeds).",
    icon: ScanSearch,
    href: "/memory-scan",
    status: "Aktiv",
    color: "#f59e0b",
    category: "Forensik-Tools",
    badge: "RAM-Analyse"
  },
];

export default function ExtensionsHub() {
  return (
    <div className="page-content">
      <Header 
        title="Erweiterungen Hub" 
        subtitle="Verwaltung spezialisierter Forensik-Module und Cluster-Ressourcen" 
      />

      <div style={{ marginTop: "var(--space-2xl)" }}>
        {/* Categories / Stats Overview */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(3, 1fr)", 
          gap: "var(--space-lg)",
          marginBottom: "var(--space-2xl)"
        }}>
          <div className="card" style={{ padding: "var(--space-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
             <div style={{ padding: "var(--space-md)", background: "rgba(232, 115, 74, 0.1)", borderRadius: "var(--radius-lg)" }}>
                <Zap size={24} style={{ color: "var(--primary-500)" }} />
             </div>
             <div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Module Gesamt</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{extensions.length}</div>
             </div>
          </div>
          <div className="card" style={{ padding: "var(--space-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
             <div style={{ padding: "var(--space-md)", background: "rgba(139, 92, 246, 0.1)", borderRadius: "var(--radius-lg)" }}>
                <Layers size={24} style={{ color: "var(--accent-500)" }} />
             </div>
             <div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Bereitgestellt</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>Lokal / Cluster</div>
             </div>
          </div>
          <div className="card" style={{ padding: "var(--space-lg)", display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
             <div style={{ padding: "var(--space-md)", background: "rgba(34, 197, 94, 0.1)", borderRadius: "var(--radius-lg)" }}>
                <Database size={24} style={{ color: "var(--success-500)" }} />
             </div>
             <div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Ressourcen</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>Bereit</div>
             </div>
          </div>
        </div>

        {/* Extensions Grid */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", 
          gap: "var(--space-lg)" 
        }}>
          {extensions.map((ext, idx) => (
            <motion.div
              key={ext.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Link href={ext.href} style={{ textDecoration: "none" }}>
                <div className="card" style={{ 
                  height: "100%",
                  padding: "var(--space-xl)",
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  {/* Category & Badge */}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: "var(--space-lg)"
                  }}>
                    <div style={{ 
                      fontSize: "0.75rem", 
                      fontWeight: "700", 
                      textTransform: "uppercase", 
                      letterSpacing: "0.05em",
                      color: "var(--text-tertiary)"
                    }}>
                      {ext.category}
                    </div>
                    <div style={{
                      padding: "4px 10px",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.6875rem",
                      fontWeight: "600",
                      color: ext.color
                    }}>
                      {ext.badge}
                    </div>
                  </div>

                  {/* Main Content */}
                  <div style={{ display: "flex", gap: "var(--space-lg)", flex: 1 }}>
                     <div style={{ 
                       width: "56px", 
                       height: "56px", 
                       borderRadius: "var(--radius-lg)",
                       display: "flex",
                       alignItems: "center",
                       justifyContent: "center",
                       background: `linear-gradient(135deg, ${ext.color}15, ${ext.color}05)`,
                       border: `1px solid ${ext.color}20`,
                       color: ext.color,
                       flexShrink: 0
                     }}>
                       <ext.icon size={28} />
                     </div>
                     <div>
                       <h3 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
                         {ext.title}
                       </h3>
                       <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                         {ext.description}
                       </p>
                     </div>
                  </div>

                  <div style={{ 
                    marginTop: "var(--space-xl)", 
                    paddingTop: "var(--space-md)",
                    borderTop: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--success-500)" }}>
                       Module Status: Ready
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", color: "var(--primary-500)", fontWeight: "600", fontSize: "0.875rem" }}>
                      Öffnen <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
