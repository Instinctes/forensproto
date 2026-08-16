"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Share2, Lock, ArrowDown, Database, Hash, HardDrive } from 'lucide-react';

interface CryptoExplainerProps {
  pubKey: string;
  address: string;
  sha256?: string;
  ripemd160?: string;
}

export const CryptoExplainer: React.FC<CryptoExplainerProps> = ({ pubKey, address, sha256, ripemd160 }) => {
  const steps = [
    {
      title: "Public Key",
      icon: <Database size={18} />,
      value: pubKey,
      desc: "Der aus dem Wallet-Datenblock extrahierte Header (SEC1 Format).",
      color: "#06b6d4"
    },
    {
      title: "SHA-256 Hash",
      icon: <Hash size={18} />,
      value: sha256 || "Calculating...",
      desc: "Erster kryptographischer Durchlauf zur Rauschunterdrückung.",
      color: "#3b82f6"
    },
    {
      title: "RIPEMD-160",
      icon: <Lock size={18} />,
      value: ripemd160 || "Calculating...",
      desc: "Zweiter Durchlauf für eine kompakte, eindeutige Identifikation.",
      color: "#6366f1"
    },
    {
      title: "Network Byte + Checksum",
      icon: <Share2 size={18} />,
      value: "Mainnet Prefix (0x00)",
      desc: "Hinzufügen von Netzwerkmetadaten und Validierungssummen.",
      color: "#8b5cf6"
    },
    {
      title: "Base58 Check Encoding",
      icon: <HardDrive size={18} />,
      value: address,
      desc: "Konvertierung in das menschenlesbare Bitcoin-Adressformat.",
      isFinal: true,
      color: "#10b981"
    }
  ];

  return (
    <div className="crypto-explainer-container" style={{
      padding: '24px',
      background: 'rgba(30, 41, 59, 0.4)',
      borderRadius: '12px',
      border: '1px solid rgba(148, 163, 184, 0.1)',
      marginTop: '20px'
    }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Hash className="text-primary" size={20} />
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Kryptographischer Verifikations-Pfad</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step, idx) => (
          <React.Fragment key={idx}>
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                padding: '12px',
                background: step.isFinal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.05)',
                borderRadius: '8px',
                borderLeft: `3px solid ${step.color}`
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: `${step.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: step.color
              }}>
                {step.icon}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: step.color, marginBottom: '2px' }}>
                  STEP {idx + 1}: {step.title}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {step.value.substring(0, 48)}{step.value.length > 48 ? '...' : ''}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {step.desc}
                </div>
              </div>
            </motion.div>
            
            {idx < steps.length - 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', color: 'var(--text-muted)' }}>
                <ArrowDown size={14} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
