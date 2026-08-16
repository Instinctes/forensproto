"use client";

import { useState, useRef, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import * as bip39 from 'bip39'
import levenshtein from 'fast-levenshtein'
import {
  KeyRound,
  Search,
  Upload,
  ChevronRight,
  ChevronLeft,
  Copy,
  AlertCircle,
  Zap,
  Lock,
  Bitcoin,
  Archive,
  BookOpen,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  Gauge,
  Loader2,
} from 'lucide-react'
import WorthCheck from '@/components/WorthCheck'

import Header from '@/components/Header'
import { CryptoExplainer } from '@/components/forensics/CryptoExplainer'
import UnencryptedViewer from '@/components/UnencryptedViewer'

// ============================================================================
// TYPES
// ============================================================================

interface WalletAnalysisResult {
  success: boolean
  filename: string
  filePath?: string
  wallet_type?: string
  format?: string
  encryption?: boolean
  encrypted?: boolean
  kdf?: string
  hashcatMode?: number | string
  strength?: number
  hash?: string
  addresses?: Array<{ address: string; label?: string; public_key?: string; publicKey?: string }>
  keys?: { address: string; wif: string; public_key_hex: string; private_key_hex: string; compressed: boolean; derived_from_seed?: boolean; hd_path?: string }[]
  metadata?: Record<string, string | number | boolean | null>
  mkey?: {
    salt: string
    iv: string
    iterations: number
  }
  binaryMetadata?: {
    authenticityStatus: 'valid' | 'suspicious' | 'fake'
    authenticityScore: number
    warnings: string[]
  }
  error?: string
  message?: string
}

interface UploadResponse {
  success: boolean
  jobId: string
  filePath: string
  filename: string
  fileSize: number
  walletType: string
  format: string
  error?: string
}



interface ForensicsResult {
  success: boolean;
  addresses?: Array<{ address: string; label?: string; public_key?: string }>;
  metadata?: Array<string>;
  error?: string;
}

interface WordlistItem {
  name: string
  sizeBytes: number
}

// ============================================================================
// RECOVERY TAB COMPONENTS
// ============================================================================

function RecoveryStepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="wizard-steps" style={{ marginBottom: 'var(--space-xl)' }}>
      {steps.map((step, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <div
            className={`wizard-step ${index < currentStep ? 'completed' : index === currentStep ? 'active' : ''}`}
            style={{
              background:
                index < currentStep
                  ? 'var(--success-500)'
                  : index === currentStep
                    ? 'var(--primary-400)'
                    : 'var(--bg-surface)',
              color:
                index < currentStep || index === currentStep ? '#fff' : 'var(--text-tertiary)',
              borderColor: 'var(--border-default)'
            }}
          >
            <div className="wizard-step-number">
              {index < currentStep ? '✓' : index + 1}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div
              className="wizard-connector"
              style={{
                background: index < currentStep ? 'var(--success-500)' : 'var(--border-subtle)',
                flex: 1,
                height: '1px'
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function RecoveryTab() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState(0)
  const [walletType, setWalletType] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState('')
  const [analysis, setAnalysis] = useState<WalletAnalysisResult | null>(null)
  const [recoveryMethod, setRecoveryMethod] = useState('dictionary')
  const [wordlist, setWordlist] = useState('')
  const [wordlists, setWordlists] = useState<WordlistItem[]>([])
  const [ruleFiles, setRuleFiles] = useState<{ name: string; ruleCount: number }[]>([])
  const [ruleFile, setRuleFile] = useState('')
  const [devices, setDevices] = useState('')
  const [shards, setShards] = useState(1)
  const [mask, setMask] = useState('?l?l?l?l?l?l?l?l')
  const [estimate, setEstimate] = useState<null | { keyspace: number | null; benchmark: { speedHps: number; fallback: boolean }; estimate: { human: string; gpuHours: number | null; costUsd: number | null; feasibility: string; label: string; note: string } }>(null)
  const [estimating, setEstimating] = useState(false)
  const [passwordLengthMin, setPasswordLengthMin] = useState(8)
  const [passwordLengthMax, setPasswordLengthMax] = useState(16)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const steps = [
    'Wallet-Typ',
    'Datei Upload',
    'Analyse',
    'Methode',
    'Parameter',
    'Start'
  ]

  const walletTypeOptions = [
    { name: 'Bitcoin Core', mode: '11300', icon: Bitcoin },
    { name: 'Ethereum', mode: '15600', icon: Lock },
    { name: 'Litecoin', mode: '11300', icon: Zap },
    { name: 'Electrum', mode: '16600', icon: KeyRound }
  ]

  // Load from URL params if coming from Dashboard or Doc Breaker
  useEffect(() => {
    const mode = searchParams.get('mode')
    const qs = searchParams.get('quickStart')
    const jId = searchParams.get('jobId')
    const fPath = searchParams.get('filePath')
    const wType = searchParams.get('walletType')
    const fName = searchParams.get('filename')

    if (qs === 'true' && jId && fPath) {
      setJobId(jId)
      if (wType) {
        // Map common names if needed
        const found = walletTypeOptions.find(o => o.name.toLowerCase().includes(wType.toLowerCase()) || wType.includes(o.name.toLowerCase()))
        setWalletType(found ? found.name : "Bitcoin Core")
      }

      // UI-Label für bereits serverseitig hochgeladene Datei (Pfad kommt aus Quick-Start)
      if (fName) {
        setUploadedFile({ name: fName } as unknown as File)
      }

      // Automatically trigger analysis
      const runQuickAnalyze = async () => {
        setLoading(true)
        setError('')
        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: fPath,
              walletType: wType || 'bitcoin_core'
            })
          })

          if (!res.ok) throw new Error('Schnelle Analyse fehlgeschlagen')
          const data = await res.json()
          setAnalysis(data)
          setStep(2) // Jump straight to Analysis results
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Auto-Analyse fehlgeschlagen')
          setStep(1) // Fallback to upload step if it fails
        } finally {
          setLoading(false)
        }
      }
      runQuickAnalyze()
    } else if (mode) {
      const found = walletTypeOptions.find((w) => w.mode === mode)
      if (found) {
        setWalletType(found.name)
        setStep(3)
      }
    }

    // Vom KI-Assistenten vorbefüllt (Action-Protokoll): method/mask/wordlist
    const qMethod = searchParams.get('method')
    const qMask = searchParams.get('mask')
    const qWordlist = searchParams.get('wordlist')
    if (qMethod && ['dictionary', 'mask', 'hybrid'].includes(qMethod)) setRecoveryMethod(qMethod)
    if (qMask) { setMask(qMask); if (!qMethod) setRecoveryMethod('mask') }
    if (qWordlist) setWordlist(qWordlist)
    if (qMethod || qMask || qWordlist) setStep(3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Fetch wordlists
  useEffect(() => {
    const fetchWordlists = async () => {
      try {
        const res = await fetch('/api/wordlists')
        const data = await res.json()
        if (data.success && data.wordlists?.length > 0) {
          setWordlists(data.wordlists)
          setWordlist(data.wordlists[0].name)
        }
      } catch (err) {
        console.error('Failed to fetch wordlists:', err)
      }
    }
    fetchWordlists()
  }, [])

  // Fetch rule files (Rule-Engine)
  useEffect(() => {
    fetch('/api/rules')
      .then((r) => r.json())
      .then((d) => { if (d.success) setRuleFiles(d.rules || []) })
      .catch(() => {})
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      setError('')
    }
  }

  const handleUploadAndAnalyze = async () => {
    if (!uploadedFile) {
      setError('Bitte Datei wählen')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Step 1: Upload file
      const formData = new FormData()
      formData.append('file', uploadedFile)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.json()
        throw new Error(uploadErr.error || 'Upload fehlgeschlagen')
      }

      const uploadData: UploadResponse = await uploadRes.json()
      setJobId(uploadData.jobId)

      // Step 2: Analyze
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: uploadData.filePath,
          walletType: uploadData.walletType || walletType
        })
      })

      if (!analyzeRes.ok) {
        const analyzeErr = await analyzeRes.json()
        throw new Error(analyzeErr.error || 'Analyse fehlgeschlagen')
      }

      const analysisData: WalletAnalysisResult = await analyzeRes.json()
      setAnalysis(analysisData)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Analysieren')
    } finally {
      setLoading(false)
    }
  }

  const handleEstimate = async () => {
    setEstimating(true)
    setEstimate(null)
    try {
      const selectedWallet = walletTypeOptions.find(w => w.name === walletType)
      const hashcatMode = selectedWallet?.mode || '11300'
      const gpuCount = devices.trim() ? devices.split(',').filter(Boolean).length : 1
      const res = await fetch('/api/recovery/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashcatMode: parseInt(String(hashcatMode)),
          method: recoveryMethod,
          wordlist: recoveryMethod === 'dictionary' || recoveryMethod === 'hybrid' ? wordlist : undefined,
          mask: recoveryMethod === 'mask' || recoveryMethod === 'hybrid' ? mask : undefined,
          ruleFile: ruleFile || undefined,
          gpuCount: shards > 1 ? shards : gpuCount,
        }),
      })
      const data = await res.json()
      if (data.success) setEstimate(data)
    } catch {
      /* ignore */
    } finally {
      setEstimating(false)
    }
  }

  const handleStartRecovery = async () => {
    if (!analysis?.hash && !analysis?.success) {
      setError('Hash nicht verfügbar')
      return
    }

    setLoading(true)
    setError('')

    try {
      const selectedWallet = walletTypeOptions.find(w => w.name === walletType)
      const hashcatMode = selectedWallet?.mode || '11300'

      const payload = {
        jobId: jobId,
        walletName: uploadedFile?.name || 'Unknown Wallet',
        walletType: walletType,
        hashcatMode: parseInt(hashcatMode),
        hash: analysis?.hash || '',
        method: recoveryMethod,
        wordlist: recoveryMethod === 'dictionary' || recoveryMethod === 'hybrid' ? wordlist : undefined,
        mask: recoveryMethod === 'mask' || recoveryMethod === 'hybrid' ? mask : undefined,
        ruleFile: (recoveryMethod === 'dictionary' || recoveryMethod === 'hybrid') && ruleFile ? ruleFile : undefined,
        devices: devices.trim() || undefined,
        shards: shards > 1 ? shards : undefined,
        walletFilePath: analysis?.filePath || undefined,
      }

      const res = await fetch('/api/recovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const resErr = await res.json()
        throw new Error(resErr.error || 'Recovery-Job fehlgeschlagen')
      }

      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Starten')
    } finally {
      setLoading(false)
    }
  }



  return (
    <div>
      <RecoveryStepIndicator steps={steps} currentStep={step} />

      <AnimatePresence mode="wait">
        {/* Step 0: Wallet Type Selection */}
        {step === 0 && (
          <motion.div
            key="step-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="card"
          >
            <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
              Wallet-Typ auswählen
            </h2>
            <div className="wallet-type-grid">
              {walletTypeOptions.map((option) => (
                <button
                  key={option.name}
                  onClick={() => {
                    setWalletType(option.name)
                    setStep(1)
                  }}
                  className={`wallet-type-option ${walletType === option.name ? 'selected' : ''}`}
                  style={{
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  <div className="wallet-type-icon" style={{ background: 'var(--primary-500)', color: '#fff' }}>
                    <option.icon size={24} />
                  </div>
                  <div className="wallet-type-name">{option.name}</div>
                  <div className="wallet-type-desc">Mode {option.mode}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>
                <ChevronLeft size={16} />
                Zurück
              </button>
              <button className="btn btn-primary" onClick={() => setStep(1)} disabled={!walletType}>
                Weiter
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 1: File Upload */}
        {step === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="card"
          >
            <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
              Wallet-Datei hochladen
            </h2>
            <div className="upload-zone">
              <div className="upload-zone-icon">
                <Upload size={32} />
              </div>
              <p className="upload-zone-title">Wallet-Datei hochladen</p>
              <p className="upload-zone-desc">Ziehe deine Datei hierher oder klicke zum Durchsuchen</p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-primary btn-sm"
              >
                Datei wählen
              </button>
              {uploadedFile && (
                <p style={{ marginTop: 'var(--space-md)', color: 'var(--success-500)', fontSize: '0.875rem' }}>
                  ✓ {uploadedFile.name}
                </p>
              )}
            </div>
            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-500)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-lg)', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} />
                Zurück
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUploadAndAnalyze}
                disabled={!uploadedFile || loading}
              >
                {loading ? 'Analysiere...' : 'Analysieren'}
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Deep Analysis Results */}
        {step === 2 && analysis && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="card"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Tiefenanalyse
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Ergebnisse der binären Untersuchung
                </p>
              </div>
              {analysis.binaryMetadata && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 14px",
                  background: analysis.binaryMetadata.authenticityStatus === 'valid'
                    ? "rgba(16, 185, 129, 0.1)"
                    : analysis.binaryMetadata.authenticityStatus === 'suspicious'
                      ? "rgba(245, 158, 11, 0.1)"
                      : "rgba(239, 68, 68, 0.1)",
                  color: analysis.binaryMetadata.authenticityStatus === 'valid'
                    ? "var(--success-400)"
                    : analysis.binaryMetadata.authenticityStatus === 'suspicious'
                      ? "var(--warning-400)"
                      : "var(--danger-400)",
                  borderRadius: "100px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  border: `1px solid ${analysis.binaryMetadata.authenticityStatus === 'valid'
                      ? "rgba(16, 185, 129, 0.2)"
                      : analysis.binaryMetadata.authenticityStatus === 'suspicious'
                        ? "rgba(245, 158, 11, 0.2)"
                        : "rgba(239, 68, 68, 0.2)"
                    }`
                }}>
                  {analysis.binaryMetadata.authenticityStatus === 'valid' && <ShieldCheck size={14} />}
                  {analysis.binaryMetadata.authenticityStatus === 'suspicious' && <Shield size={14} />}
                  {analysis.binaryMetadata.authenticityStatus === 'fake' && <ShieldAlert size={14} />}
                  {analysis.binaryMetadata.authenticityStatus?.toUpperCase() || "UNKNOWN"} ({analysis.binaryMetadata.authenticityScore}%)
                </div>
              )}
            </div>

            {analysis.binaryMetadata && (
              <div style={{
                marginBottom: "var(--space-lg)",
                padding: "16px",
                background: "var(--bg-elevated)",
                borderRadius: "12px",
                border: `1px solid ${analysis.binaryMetadata.authenticityStatus === 'valid'
                    ? "var(--border-subtle)"
                    : analysis.binaryMetadata.authenticityStatus === 'suspicious'
                      ? "rgba(245, 158, 11, 0.3)"
                      : "rgba(239, 68, 68, 0.3)"
                  }`,
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                    <TrendingDown size={14} className="text-primary" /> Authentizitäts-Score
                  </div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 700 }}>
                    {analysis.binaryMetadata.authenticityScore}/100
                  </div>
                </div>
                <div style={{ width: "100%", height: "6px", background: "var(--bg-surface)", borderRadius: "3px", overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${analysis.binaryMetadata.authenticityScore}%` }}
                    style={{
                      height: "100%",
                      background: analysis.binaryMetadata.authenticityScore > 75
                        ? "var(--success-500)"
                        : analysis.binaryMetadata.authenticityScore > 40
                          ? "var(--warning-500)"
                          : "var(--danger-500)"
                    }}
                  />
                </div>

                {analysis.binaryMetadata.warnings?.length > 0 && (
                  <div style={{ marginTop: "4px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "8px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertTriangle size={12} className="text-warning" /> Sicherheits-Hinweise:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {analysis.binaryMetadata.warnings.map((warn: string, i: number) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {analysis.error ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-500)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                <AlertCircle size={16} style={{ marginBottom: 'var(--space-sm)' }} />
                {analysis.error}
              </div>
            ) : analysis.encrypted === false && analysis.keys ? (
              <UnencryptedViewer keys={analysis.keys} />
            ) : (
              <>
                <div className="responsive-grid-2" style={{ marginBottom: 'var(--space-lg)' }}>
                  <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>DATEINAME</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{analysis.filename}</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>FORMAT</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{analysis.format || 'Unknown'}</div>
                  </div>
                </div>

                {analysis.mkey && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--warning-600)', marginBottom: 'var(--space-md)' }}>
                      Verschlüsselungs-Metadaten
                    </h3>
                    <div className="responsive-grid-3" style={{ gap: 'var(--space-md)' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>SALT</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {analysis.mkey.salt.substring(0, 32)}...
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>IV</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {analysis.mkey.iv.substring(0, 32)}...
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>ITERATIONS</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {analysis.mkey.iterations.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {analysis.addresses && analysis.addresses.length > 0 && (
                  <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Extrahierte Adressen ({analysis.addresses.length})
                      </h3>
                      <div style={{ position: 'relative', width: '200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                          type="text"
                          placeholder="Adresse suchen..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 12px 6px 32px',
                            fontSize: '0.75rem',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)'
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', maxHeight: '200px', overflowY: 'auto' }}>
                      {analysis.addresses
                        .filter(addr => addr.address.toLowerCase().includes(searchTerm.toLowerCase()))
                        .slice(0, 10)
                        .map((addr, idx) => (
                          <div key={idx} style={{ padding: '8px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--primary-300)' }}>
                            {addr.address}
                          </div>
                        ))}
                      {analysis.addresses.length > 10 && (
                        <div style={{ padding: '8px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                          ... und {analysis.addresses.length - 10} weitere Adressen
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {analysis.addresses && analysis.addresses.length > 0 && (
              <div style={{ marginTop: 'var(--space-lg)' }}>
                <WorthCheck addresses={analysis.addresses.slice(0, 10).map((a) => a.address)} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} />
                Zurück
              </button>
              {analysis.encrypted !== false && (
                <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!analysis.hash && !analysis.success}>
                  Methode wählen
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Step 3: Recovery Method Selection */}
        {step === 3 && (
          <motion.div
            key="step-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="card"
          >
            <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
              Recovery-Methode
            </h2>
            <div className="wallet-type-grid">
              <button
                onClick={() => setRecoveryMethod('dictionary')}
                className={`wallet-type-option ${recoveryMethod === 'dictionary' ? 'selected' : ''}`}
              >
                <div className="wallet-type-icon" style={{ background: 'var(--primary-500)', color: '#fff' }}>
                  <BookOpen size={24} />
                </div>
                <div className="wallet-type-name">Dictionary</div>
                <div className="wallet-type-desc">Wörterbuch-Attack</div>
              </button>
              <button
                onClick={() => setRecoveryMethod('mask')}
                className={`wallet-type-option ${recoveryMethod === 'mask' ? 'selected' : ''}`}
              >
                <div className="wallet-type-icon" style={{ background: 'var(--primary-500)', color: '#fff' }}>
                  <Zap size={24} />
                </div>
                <div className="wallet-type-name">Mask</div>
                <div className="wallet-type-desc">Muster-basiert</div>
              </button>
              <button
                onClick={() => setRecoveryMethod('hybrid')}
                className={`wallet-type-option ${recoveryMethod === 'hybrid' ? 'selected' : ''}`}
              >
                <div className="wallet-type-icon" style={{ background: 'var(--primary-500)', color: '#fff' }}>
                  <Archive size={24} />
                </div>
                <div className="wallet-type-name">Hybrid</div>
                <div className="wallet-type-desc">Kombination</div>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} />
                Zurück
              </button>
              <button className="btn btn-primary" onClick={() => setStep(4)}>
                Weiter
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 4: Parameters */}
        {step === 4 && (
          <motion.div
            key="step-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="card"
          >
            <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
              Parameter
            </h2>

            {(recoveryMethod === 'dictionary' || recoveryMethod === 'hybrid') && (
              <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="form-label">Wörterliste</label>
                <select
                  className="form-select"
                  value={wordlist}
                  onChange={(e) => setWordlist(e.target.value)}
                >
                  {wordlists.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.name} ({(w.sizeBytes / 1024 / 1024).toFixed(1)}MB)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(recoveryMethod === 'dictionary' || recoveryMethod === 'hybrid') && (
              <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="form-label">Regelset (Hashcat -r)</label>
                <select className="form-select" value={ruleFile} onChange={(e) => setRuleFile(e.target.value)}>
                  <option value="">— Keine Regeln —</option>
                  {ruleFiles.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name} ({r.ruleCount} Regeln)
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  KI-/gelernte Regeln werden unter „AI Rules“ erzeugt und hier angewendet.
                </div>
              </div>
            )}

            {(recoveryMethod === 'mask' || recoveryMethod === 'hybrid') && (
              <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="form-label">Mask Pattern</label>
                <input
                  type="text"
                  className="form-input"
                  value={mask}
                  onChange={(e) => setMask(e.target.value)}
                  placeholder="?l?l?l?l?l?l?l?l"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  ?l = lowercase, ?u = uppercase, ?d = digit, ?s = special
                </div>
              </div>
            )}

            <div className="responsive-grid-2">
              <div className="form-group">
                <label className="form-label">Min. Länge</label>
                <input
                  type="number"
                  className="form-input"
                  value={passwordLengthMin}
                  onChange={(e) => setPasswordLengthMin(parseInt(e.target.value) || 0)}
                  min="1"
                  max="64"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Max. Länge</label>
                <input
                  type="number"
                  className="form-input"
                  value={passwordLengthMax}
                  onChange={(e) => setPasswordLengthMax(parseInt(e.target.value) || 0)}
                  min="1"
                  max="128"
                />
              </div>
            </div>

            {/* Multi-GPU & verteilte Recovery */}
            <div className="responsive-grid-2" style={{ marginTop: 'var(--space-lg)' }}>
              <div className="form-group">
                <label className="form-label">GPU-Geräte (-d, optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={devices}
                  onChange={(e) => setDevices(e.target.value)}
                  placeholder="z.B. 1,2 (leer = alle)"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Komma-getrennte Hashcat-Geräte-IDs. Leer = alle GPUs.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Shards (verteilte Recovery)</label>
                <input
                  type="number"
                  className="form-input"
                  value={shards}
                  onChange={(e) => setShards(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="64"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  &gt;1 teilt den Keyspace auf (Skip/Limit) und parallelisiert über die Queue.
                </div>
              </div>
            </div>

            {/* Machbarkeits-/Zeit-/Kosten-Ampel */}
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <button className="btn btn-secondary" onClick={handleEstimate} disabled={estimating}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {estimating ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />}
                Aufwand prüfen
              </button>
              {estimate && (() => {
                const f = estimate.estimate.feasibility
                const color = f === 'green' ? 'var(--success-400)' : f === 'amber' ? 'var(--warning-400)' : f === 'red' ? 'var(--danger-400)' : 'var(--text-tertiary)'
                const bg = f === 'green' ? 'rgba(16,185,129,0.08)' : f === 'amber' ? 'rgba(245,158,11,0.08)' : f === 'red' ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)'
                return (
                  <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md) var(--space-lg)', borderRadius: 'var(--radius-md)', background: bg, border: `1px solid ${color}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                      <span style={{ fontWeight: 700, color, textTransform: 'uppercase', fontSize: '0.8125rem', letterSpacing: '0.03em' }}>{estimate.estimate.label}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '8px' }}>
                      <div><div style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Ø Dauer</div><div className="mono" style={{ fontWeight: 600 }}>{estimate.estimate.human}</div></div>
                      <div><div style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Keyspace</div><div className="mono" style={{ fontWeight: 600 }}>{estimate.keyspace != null ? estimate.keyspace.toLocaleString('de-DE') : 'unbekannt'}</div></div>
                      <div><div style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>GPU-Std</div><div className="mono" style={{ fontWeight: 600 }}>{estimate.estimate.gpuHours ?? '—'}</div></div>
                      <div><div style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>~Cloud-Kosten</div><div className="mono" style={{ fontWeight: 600 }}>{estimate.estimate.costUsd != null ? `$${estimate.estimate.costUsd}` : '—'}</div></div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{estimate.estimate.note}</p>
                    {estimate.benchmark.fallback && <p style={{ margin: '4px 0 0', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>Hinweis: Schätzwert (Hashcat-Benchmark nicht verfügbar).</p>}
                  </div>
                )
              })()}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} />
                Zurück
              </button>
              <button className="btn btn-primary" onClick={() => setStep(5)}>
                Review
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Start Recovery */}
        {step === 5 && (
          <motion.div
            key="step-5"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="card"
          >
            <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
              Recovery starten
            </h2>

            <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
              <div className="responsive-grid-2">
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600 }}>WALLET-TYP</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{walletType}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600 }}>METHODE</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{recoveryMethod}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600 }}>DATEI</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{uploadedFile?.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600 }}>STATUS</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--success-500)' }}>Bereit</div>
                </div>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-500)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={loading}>
                <ChevronLeft size={16} />
                Zurück
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartRecovery}
                disabled={loading}
              >
                {loading ? 'Starte...' : 'Recovery starten'}
                <Zap size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// FORENSICS TAB
// ============================================================================

function ForensicsTab() {
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<WalletAnalysisResult | null>(null)
  const [forensics, setForensics] = useState<ForensicsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addressSearch, setAddressSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (selectedFile: File) => {
    setLoading(true)
    setError('')
    setFile(selectedFile)

    try {
      // Upload
      const uploadForm = new FormData()
      uploadForm.append('file', selectedFile)
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm
      })
      if (!uploadRes.ok) throw new Error('Upload fehlgeschlagen')
      const uploadData: UploadResponse = await uploadRes.json()

      // Analyze in parallel
      const analyzeRes = fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: uploadData.filePath,
          walletType: uploadData.walletType
        })
      })

      // Forensics extract in parallel
      const forensicsForm = new FormData()
      forensicsForm.append('wallet', selectedFile)
      const forensicsRes = fetch('/api/forensics/extract', {
        method: 'POST',
        body: forensicsForm
      })

      const [analyzeResult, forensicsResult] = await Promise.all([analyzeRes, forensicsRes])

      if (analyzeResult.ok) {
        setAnalysis(await analyzeResult.json())
      }
      if (forensicsResult.ok) {
        setForensics(await forensicsResult.json())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Verarbeiten der Datei')
    } finally {
      setLoading(false)
    }
  }

  const filteredAddresses = useMemo(() => {
    if (!forensics?.addresses) return []
    if (!addressSearch) return forensics.addresses
    return forensics.addresses.filter(addr =>
      addr.address.toLowerCase().includes(addressSearch.toLowerCase())
    )
  }, [forensics?.addresses, addressSearch])

  return (
    <div>
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
          Wallet-Datei analysieren
        </h2>
        <div className="upload-zone">
          <div className="upload-zone-icon">
            <Upload size={32} />
          </div>
          <p className="upload-zone-title">Wallet hochladen</p>
          <p className="upload-zone-desc">Ziehe deine Datei hierher oder klicke zum Durchsuchen</p>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary btn-sm"
            disabled={loading}
          >
            {loading ? 'Analysiere...' : 'Datei wählen'}
          </button>
          {file && (
            <p style={{ marginTop: 'var(--space-md)', color: 'var(--success-500)', fontSize: '0.875rem' }}>
              ✓ {file.name}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-500)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
          {error}
        </div>
      )}

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-lg)' }}>
            Analyse-Ergebnisse
          </h3>

          {analysis.hash && (
            <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
                HASH
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all', background: 'var(--bg-surface)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)' }}>
                  {analysis.hash}
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => navigator.clipboard.writeText(analysis.hash || '')}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {forensics?.addresses && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-lg)' }}>
            Extrahierte Adressen ({forensics.addresses.length})
          </h3>

          {forensics.addresses.length > 0 && (
            <>
              <CryptoExplainer
                pubKey={forensics.addresses[0]?.public_key || forensics.addresses[0]?.address || ''}
                address={forensics.addresses[0]?.address || ''}
              />

              <div style={{ marginTop: 'var(--space-md)' }}>
                <div style={{ position: 'relative', marginBottom: 'var(--space-md)' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)'
                    }}
                  />
                  <input
                    type="text"
                    placeholder="BTC Adresse suchen..."
                    value={addressSearch}
                    onChange={(e) => setAddressSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8125rem',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--primary-400)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                  />
                  {addressSearch && (
                    <button
                      onClick={() => setAddressSearch('')}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 700
                      }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                  {filteredAddresses.length > 0 ? (
                    <>
                      {(addressSearch ? filteredAddresses : filteredAddresses.slice(0, 50)).map((addr: { address: string }, idx: number) => (
                        <div
                          key={idx}
                          className="address-row"
                          style={{
                            padding: '12px',
                            background: 'var(--bg-elevated)',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '6px',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            color: 'var(--primary-300)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: '1px solid transparent',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span style={{ wordBreak: 'break-all' }}>{addr.address}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(addr.address)
                              // Optional: toast notification
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-tertiary)',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="Adresse kopieren"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      ))}
                      {!addressSearch && filteredAddresses.length > 50 && (
                        <div style={{ padding: 'var(--space-md)', color: 'var(--text-tertiary)', fontSize: '0.75rem', textAlign: 'center' }}>
                          ... {filteredAddresses.length - 50} weitere Adressen. Nutze die Suche für Details.
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                      <AlertTriangle size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div>Keine passenden Adressen gefunden</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ============================================================================
// DOC BREAKER TAB
// ============================================================================


// ============================================================================
// SEED FIXER TAB
// ============================================================================

function SeedFixerTab() {
  const [wordCount, setWordCount] = useState(12)
  const [words, setWords] = useState<string[]>(Array(12).fill(''))
  const [suggestions, setSuggestions] = useState<Record<number, string[]>>({})
  const [validations, setValidations] = useState<Record<number, boolean>>({})

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...words]
    newWords[index] = value.toLowerCase().trim()
    setWords(newWords)

    // Get suggestions
    if (value.length >= 2) {
      const wordlist = bip39.wordlists.english
      const matches = wordlist.filter(w =>
        levenshtein.get(w, value.toLowerCase().trim()) <= 2
      )
      setSuggestions({ ...suggestions, [index]: matches.slice(0, 3) })
    } else {
      setSuggestions({ ...suggestions, [index]: [] })
    }

    // Validate
    const isValid = bip39.wordlists.english.includes(value.toLowerCase().trim())
    setValidations({ ...validations, [index]: isValid })
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const pasted_words = pasted
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0)

    if (pasted_words.length === 12 || pasted_words.length === 24) {
      setWordCount(pasted_words.length)
      setWords([...pasted_words, ...Array(Math.max(0, wordCount - pasted_words.length)).fill('')])
    }
  }

  const isValid = words.slice(0, wordCount).every(w => w.length > 0 && bip39.wordlists.english.includes(w))
  const mnemonic = isValid ? words.slice(0, wordCount).join(' ') : ''

  return (
    <div>
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 style={{ marginBottom: 'var(--space-lg)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
          Seed-Phrase reparieren
        </h2>

        <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
          <label className="form-label">Word Count</label>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button
              className={`btn ${wordCount === 12 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setWordCount(12)
                setWords(Array(12).fill(''))
                setSuggestions({})
                setValidations({})
              }}
            >
              12 Words
            </button>
            <button
              className={`btn ${wordCount === 24 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setWordCount(24)
                setWords(Array(24).fill(''))
                setSuggestions({})
                setValidations({})
              }}
            >
              24 Words
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-lg)'
          }}
          onPaste={handlePaste}
        >
          {Array(wordCount).fill(0).map((_, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              <div style={{
                fontSize: '0.625rem',
                fontWeight: '700',
                color: words[idx] === '' ? 'var(--text-tertiary)' : validations[idx] ? 'var(--success-500)' : 'var(--danger-500)',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                #{idx + 1}
              </div>
              <input
                type="text"
                className="form-input"
                value={words[idx]}
                onChange={(e) => handleWordChange(idx, e.target.value)}
                placeholder={`Wort ${idx + 1}`}
                style={{
                  width: '100%',
                  borderColor: words[idx] === '' ? 'var(--border-subtle)' : validations[idx] ? 'var(--success-500)' : 'var(--danger-500)',
                  fontSize: '0.8125rem',
                  boxSizing: 'border-box'
                }}
              />
              {suggestions[idx]?.length > 0 && (
                <div style={{
                  marginTop: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  {suggestions[idx].map(s => (
                    <button
                      key={s}
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleWordChange(idx, s)}
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        fontSize: '0.6875rem',
                        padding: '4px 8px'
                      }}
                    >
                      → {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {isValid && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              color: 'var(--success-500)',
              padding: 'var(--space-lg)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-lg)',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              fontSize: '0.8125rem'
            }}
          >
            ✓ Gültige Seed-Phrase erkannt
            <div style={{ marginTop: 'var(--space-md)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              {mnemonic}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN RECOVERY PAGE
// ============================================================================

function RecoveryPageContent() {
  const [activeTab, setActiveTab] = useState(0)

  const tabs = [
    { name: 'Recovery', icon: KeyRound },
    { name: 'Forensik', icon: Zap },
    { name: 'Seed Fixer', icon: BookOpen }
  ]

  return (
    <>
      <Header
        title="Recovery Hub"
        subtitle="Upload → Analyse → Recovery → Seed Fixer"
      />
      <main className="page-content">
        {/* Tab Bar */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xl)',
          background: 'var(--bg-elevated)',
          padding: 'var(--space-xs)',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)',
          width: 'fit-content'
        }}>
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTab(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: '10px 16px',
                borderRadius: 'var(--radius-full)',
                background: activeTab === idx ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === idx ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                fontSize: '0.875rem',
                fontWeight: activeTab === idx ? 600 : 500,
                boxShadow: activeTab === idx ? 'var(--shadow-sm)' : 'none',
                border: activeTab === idx ? '1px solid var(--border-subtle)' : '1px solid transparent'
              }}
            >
              <tab.icon size={16} />
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 0 && (
            <motion.div
              key="recovery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <RecoveryTab />
            </motion.div>
          )}
          {activeTab === 1 && (
            <motion.div
              key="forensics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ForensicsTab />
            </motion.div>
          )}
          {activeTab === 2 && (
            <motion.div
              key="seedfixer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <SeedFixerTab />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  )
}

export default function RecoveryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--space-xl)' }}>Laden…</div>}>
      <RecoveryPageContent />
    </Suspense>
  )
}

// Re-export types for other modules
export type { WalletAnalysisResult, UploadResponse, ForensicsResult }
