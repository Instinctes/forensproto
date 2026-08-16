/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Send,
  Loader2,
  Cpu,
  Download,
  Copy,
  Check,
  Zap,
  Sparkles,
  KeyRound,
  FileText,
  RefreshCw,
  Square,
  Trash2,
  Play,
  ListPlus,
} from 'lucide-react';
import Header from '@/components/Header';
import ChatMarkdown from '@/components/ChatMarkdown';
import { useI18n } from '@/context/I18nContext';

const CHAT_STORAGE_KEY = 'af_ai_chat';

interface ChatAction {
  tool: 'wordlist' | 'mask' | 'prepare_job';
  keywords?: string[];
  passwords?: string[];
  mask?: string;
  method?: string;
  wordlist?: string;
  note?: string;
}

/** Trennt sichtbaren Text von eingebetteten ```action-Blöcken. */
function parseActions(content: string): { text: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  const text = content.replace(/```action\s*([\s\S]*?)```/g, (_m, json) => {
    try {
      const obj = JSON.parse(String(json).trim());
      if (obj && typeof obj.tool === 'string') actions.push(obj as ChatAction);
    } catch { /* ungültiges JSON ignorieren */ }
    return '';
  }).trim();
  return { text, actions };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface GeneratedRules {
  rules: string[];
  metadata?: {
    count: number;
    timestamp: string;
  };
}

export default function AIPage() {
  const { locale } = useI18n();
  const router = useRouter();
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Rule Engine state
  const [passwords, setPasswords] = useState('');
  const [keywords, setKeywords] = useState('');
  const [generatedRules, setGeneratedRules] = useState<GeneratedRules | null>(null);
  const [isGeneratingRules, setIsGeneratingRules] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [genWordlist, setGenWordlist] = useState<{ count: number; words: string[] } | null>(null);
  const [isGeneratingWordlist, setIsGeneratingWordlist] = useState(false);
  const [wordlistMsg, setWordlistMsg] = useState<string | null>(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [context, setContext] = useState({
    activeJobs: 0,
    systemStatus: 'ready',
  });

  // LLM-Modell-Auswahl
  const [models, setModels] = useState<{ name: string; sizeGB: number | null; paramSize: string | null }[]>([]);
  const [selectedModel, setSelectedModel] = useState('llama3');
  const [ollamaOnline, setOllamaOnline] = useState(true);

  const [refreshingModels, setRefreshingModels] = useState(false);
  const loadModels = useCallback(async () => {
    setRefreshingModels(true);
    try {
      const d = await fetch('/api/models', { cache: 'no-store' }).then((r) => r.json());
      if (!d.success) return;
      setModels(d.models || []);
      setOllamaOnline(d.online);
      const saved = localStorage.getItem('af_ai_model');
      const names = (d.models || []).map((m: { name: string }) => m.name);
      if (saved && names.includes(saved)) setSelectedModel(saved);
      else if (names.length > 0) setSelectedModel(names.includes('llama3') ? 'llama3' : names.includes('llama3:latest') ? 'llama3:latest' : names[0]);
    } catch { /* ignore */ }
    finally { setRefreshingModels(false); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadModels();
  }, [loadModels]);

  const changeModel = (m: string) => {
    setSelectedModel(m);
    try { localStorage.setItem('af_ai_model', m); } catch { /* ignore */ }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load context from localStorage
  useEffect(() => {
    const savedContext = localStorage.getItem('forensicContext');
    if (savedContext) {
      try {
        setContext(JSON.parse(savedContext));
      } catch (e) {
        console.error('Failed to load context:', e);
      }
    }
  }, []);

  // Persistenter Chat-Verlauf laden
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessages(arr.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch { /* ignore */ }
  }, []);
  // Chat-Verlauf speichern
  useEffect(() => {
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const generateMessageId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const newMessage: Message = {
      id: generateMessageId(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  // Streaming-Kern: hängt eine leere Assistenten-Nachricht an und füllt sie token-weise.
  const streamChat = useCallback(async (history: { role: string; content: string }[]) => {
    setError(null);
    setIsLoading(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const assistantId = generateMessageId();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model: selectedModel, locale, stream: true }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => null);
        const msg = e?.error || `API Error: ${res.statusText}`;
        setError(msg);
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m)));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)));
      }
      if (!acc.trim()) {
        const empty = locale === 'en' ? '⚠️ No response from Ollama. Is the model loaded?' : '⚠️ Keine Antwort von Ollama erhalten. Ist das Modell geladen?';
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: empty } : m)));
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        const stopped = locale === 'en' ? '(stopped)' : '(gestoppt)';
        setMessages((prev) => prev.map((m) => (m.id === assistantId && !m.content ? { ...m, content: stopped } : m)));
      } else {
        const msg = err instanceof Error ? err.message : 'Fehler';
        setError(msg);
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m)));
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [selectedModel, locale]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    const userMessage = inputValue.trim();
    setInputValue('');
    const history = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }];
    addMessage('user', userMessage);
    await streamChat(history);
  }, [inputValue, isLoading, messages, addMessage, streamChat]);

  const regenerate = useCallback(async (assistantId: string) => {
    if (isLoading) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    const upTo = messages.slice(0, idx);
    setMessages(upTo);
    await streamChat(upTo.map((m) => ({ role: m.role, content: m.content })));
  }, [isLoading, messages, streamChat]);

  const stopGenerating = useCallback(() => abortRef.current?.abort(), []);

  const copyMessage = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 1500);
    });
  };

  // Führt eine vom Modell vorgeschlagene Aktion aus (Action-Protokoll).
  const executeAction = useCallback(async (a: ChatAction) => {
    if (a.tool === 'wordlist') {
      const kws = (a.keywords || []).map((s) => String(s).trim()).filter(Boolean);
      const pws = (a.passwords || []).map((s) => String(s).trim()).filter(Boolean);
      if (!kws.length && !pws.length) { setWordlistMsg('Aktion ohne Keywords/Passwörter'); return; }
      setIsGeneratingWordlist(true); setWordlistMsg(null); setGenWordlist(null);
      try {
        const res = await fetch('/api/wordlist-gen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: kws, passwords: pws }) }).then((r) => r.json());
        if (!res.success) { setWordlistMsg(`Fehler: ${res.error}`); return; }
        setGenWordlist({ count: res.count, words: res.words });
        const name = `ki-wordlist-${Date.now().toString(36)}.txt`;
        const save = await fetch('/api/wordlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, words: res.words }) }).then((r) => r.json()).catch(() => ({ success: false }));
        setWordlistMsg(save.success ? `✓ ${res.count} Kandidaten generiert und als ${save.name} in wordlists/ gespeichert` : `✓ ${res.count} Kandidaten generiert (Auto-Speichern fehlgeschlagen)`);
      } catch { setWordlistMsg('Generierung fehlgeschlagen'); }
      finally { setIsGeneratingWordlist(false); }
    } else if (a.tool === 'mask' && a.mask) {
      try { await navigator.clipboard?.writeText(a.mask); } catch { /* ignore */ }
      router.push(`/recovery?method=mask&mask=${encodeURIComponent(a.mask)}`);
    } else if (a.tool === 'prepare_job') {
      const q = new URLSearchParams();
      if (a.method) q.set('method', a.method);
      if (a.mask) q.set('mask', a.mask);
      if (a.wordlist) q.set('wordlist', a.wordlist);
      router.push(`/recovery?${q.toString()}`);
    }
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ---- Chat-Button „Wordlist": echter Generator + Auto-Speichern in wordlists/ ----
  const generateAndSaveWordlist = useCallback(async () => {
    let kws = keywords.split('\n').map((s) => s.trim()).filter(Boolean);
    const pws = passwords.split('\n').map((s) => s.trim()).filter(Boolean);
    // Fallback: Stichwörter aus dem Chat-Eingabefeld ziehen, wenn die Keyword-Box leer ist
    if (kws.length === 0 && pws.length === 0 && inputValue.trim()) {
      const stop = /^(generiere|eine|optimierte|wortliste|basierend|auf|den|der|die|das|verfügbaren|hinweisen|und|mit|für|von)$/i;
      kws = inputValue.split(/[\s,;\n]+/).map((s) => s.trim()).filter((w) => w.length > 1 && !stop.test(w));
    }
    if (kws.length === 0 && pws.length === 0) {
      setWordlistMsg('Bitte rechts unter „Keywords" Stichwörter eintragen (eines pro Zeile) oder sie ins Chatfeld schreiben, dann „Wordlist".');
      addMessage('assistant', 'Für die Wortlisten-Generierung brauche ich Stichwörter — trage sie rechts unter „Keywords" ein (z. B. Namen, Jahre, Hobbys; eines pro Zeile) oder schreibe sie ins Chatfeld und klicke erneut auf „Wordlist".');
      return;
    }
    setIsGeneratingWordlist(true);
    setWordlistMsg(null);
    setGenWordlist(null);
    try {
      const res = await fetch('/api/wordlist-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: kws, passwords: pws }),
      });
      const data = await res.json();
      if (!data.success) {
        setWordlistMsg(`Fehler: ${data.error}`);
        return;
      }
      setGenWordlist({ count: data.count, words: data.words });
      // Automatisch in den wordlists/-Ordner speichern (im Recovery-Wizard auswählbar)
      const name = `ki-wordlist-${Date.now().toString(36)}.txt`;
      const save = await fetch('/api/wordlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, words: data.words }),
      }).then((r) => r.json()).catch(() => ({ success: false }));
      if (save.success) {
        setWordlistMsg(`✓ ${data.count} Kandidaten generiert und als ${save.name} in wordlists/ gespeichert`);
        addMessage('assistant', `✓ Wortliste erstellt: ${data.count} Kandidaten, gespeichert als „${save.name}" im Ordner wordlists/. Sie ist jetzt im Recovery-Wizard auswählbar.`);
      } else {
        setWordlistMsg(`✓ ${data.count} Kandidaten generiert (Auto-Speichern fehlgeschlagen — nutze „Speichern"/„Herunterladen")`);
      }
    } catch {
      setWordlistMsg('Generierung fehlgeschlagen');
    } finally {
      setIsGeneratingWordlist(false);
    }
  }, [keywords, passwords, inputValue, addMessage]);

  const handleQuickAction = (action: string) => {
    if (action === 'wordlistGenerate') {
      generateAndSaveWordlist();
      return;
    }
    const actionPrompts: Record<string, string> = {
      passwordPattern: 'Analysiere die folgenden Passwort-Muster und gib Empfehlungen für Hashcat-Regeln',
      recoveryStrategy: 'Erstelle eine Recovery-Strategie basierend auf den Passwort-Mustern',
      hashcatMask: 'Erstelle eine optimierte Hashcat-Mask-Zeichenfolge',
    };

    setInputValue(actionPrompts[action] || '');
  };

  const handleGenerateRules = useCallback(async () => {
    if (!passwords.trim() && !keywords.trim()) {
      setRuleError('Bitte geben Sie mindestens Passwörter oder Schlüsselwörter ein');
      return;
    }

    setIsGeneratingRules(true);
    setRuleError(null);
    setGeneratedRules(null);

    try {
      const response = await fetch('/api/ai-rules/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          passwords: passwords
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean),
          keywords: keywords
            .split('\n')
            .map((k) => k.trim())
            .filter(Boolean),
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedRules({
        rules: data.rules || [],
        metadata: {
          count: (data.rules || []).length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Fehler beim Generieren von Regeln';
      setRuleError(errorMessage);
    } finally {
      setIsGeneratingRules(false);
    }
  }, [passwords, keywords, selectedModel]);

  // ---- Wortlisten-Generator (Closed-Loop) ----
  const handleGenerateWordlist = useCallback(async () => {
    const kws = keywords.split('\n').map((s) => s.trim()).filter(Boolean);
    const pws = passwords.split('\n').map((s) => s.trim()).filter(Boolean);
    if (kws.length === 0 && pws.length === 0) {
      setWordlistMsg('Bitte Keywords oder Passwörter eingeben');
      return;
    }
    setIsGeneratingWordlist(true);
    setWordlistMsg(null);
    setGenWordlist(null);
    try {
      const res = await fetch('/api/wordlist-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: kws, passwords: pws }),
      });
      const data = await res.json();
      if (data.success) {
        setGenWordlist({ count: data.count, words: data.words });
        setWordlistMsg(`${data.count} Kandidaten generiert`);
      } else {
        setWordlistMsg(`Fehler: ${data.error}`);
      }
    } catch {
      setWordlistMsg('Generierung fehlgeschlagen');
    } finally {
      setIsGeneratingWordlist(false);
    }
  }, [keywords, passwords]);

  const downloadWordlist = () => {
    if (!genWordlist) return;
    const blob = new Blob([genWordlist.words.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordlist-${Date.now().toString(36)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveWordlistToEngine = async () => {
    if (!genWordlist) return;
    const name = window.prompt('Dateiname für die Wortliste:', `targeted-${Date.now().toString(36)}.txt`);
    if (!name) return;
    try {
      const res = await fetch('/api/wordlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, words: genWordlist.words }),
      });
      const data = await res.json();
      setWordlistMsg(data.success ? `✓ ${data.count} Wörter als ${data.name} gespeichert` : `✗ ${data.error}`);
    } catch {
      setWordlistMsg('Speichern fehlgeschlagen');
    }
  };

  const handleDownloadRules = () => {
    if (!generatedRules || generatedRules.rules.length === 0) return;

    const content = generatedRules.rules.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-rules-${Date.now()}.rule`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleCopyRule = (rule: string, index: number) => {
    navigator.clipboard.writeText(rule);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAllRules = () => {
    if (!generatedRules || generatedRules.rules.length === 0) return;
    const content = generatedRules.rules.join('\n');
    navigator.clipboard.writeText(content);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Header title="AI Assistent" subtitle="Forensik-Chat & Rule Engine" />

      {/* Modell-Auswähler */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px var(--space-lg)',
        borderBottom: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>LLM-Modell</span>
        <select
          value={selectedModel}
          onChange={(e) => changeModel(e.target.value)}
          className="form-select"
          style={{ fontSize: '0.8125rem', padding: '6px 12px', width: 'auto', minWidth: '420px', maxWidth: '100%', flex: '0 1 auto' }}
        >
          {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}{m.paramSize ? ` · ${m.paramSize}` : ''}{m.sizeGB ? ` · ${m.sizeGB} GB` : ''}
            </option>
          ))}
        </select>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600,
          color: ollamaOnline ? 'var(--success-400)' : 'var(--warning-400)',
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: ollamaOnline ? 'var(--success-400)' : 'var(--warning-400)' }} />
          {ollamaOnline ? `Ollama · ${models.length} Modelle` : 'Ollama offline'}
        </span>
        <button onClick={loadModels} title="Modelle aktualisieren" className="header-btn" style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          <RefreshCw size={13} className={refreshingModels ? 'animate-spin' : undefined} />
        </button>
        {!ollamaOnline && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
            <code className="mono">ollama serve</code> starten · <code className="mono">ollama pull llama3</code>
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {messages.length > 0 && (
            <button onClick={clearChat} className="btn btn-ghost" title="Chat leeren" style={{ fontSize: '0.75rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--danger-400)' }}>
              <Trash2 size={14} /> Chat leeren
            </button>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 'var(--space-lg)',
        height: 'calc(100vh - 220px)',
        padding: 'var(--space-lg)',
        overflow: 'hidden',
      }}>
        {/* LEFT COLUMN - CHAT AREA */}
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg)',
            minHeight: 0,
            minWidth: 0,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Messages Container */}
          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            paddingRight: 'var(--space-sm)',
          }}>
            {messages.length === 0 ? (
              <motion.div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  style={{ marginBottom: 'var(--space-lg)' }}
                >
                  <Bot size={64} color="var(--primary-400)" />
                </motion.div>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 'var(--space-md)',
                }}>AI Assistent</h2>
                <p style={{
                  color: 'var(--text-secondary)',
                  maxWidth: '28rem',
                  marginBottom: 'var(--space-lg)',
                  fontSize: '0.9375rem',
                }}>
                  Starten Sie ein Gespräch mit dem AI-gestützten Passwort-Recovery-System oder nutzen Sie die
                  Rule Engine auf der rechten Seite.
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-md)',
                  width: '100%',
                  maxWidth: '28rem',
                }}>
                  {[
                    { action: 'passwordPattern', icon: Sparkles, label: 'Passwort-Muster' },
                    { action: 'wordlistGenerate', icon: FileText, label: 'Wordlist' },
                    { action: 'recoveryStrategy', icon: Zap, label: 'Recovery' },
                    { action: 'hashcatMask', icon: KeyRound, label: 'Hashcat-Mask' },
                  ].map(({ action, icon: Icon, label }) => (
                    <motion.button
                      key={action}
                      onClick={() => handleQuickAction(action)}
                      style={{
                        padding: 'var(--space-md)',
                        fontSize: '0.8125rem',
                        textAlign: 'center',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                      }}
                      whileHover={{ scale: 1.05, borderColor: 'var(--primary-400)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Icon size={16} />
                      {label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <>
                <AnimatePresence>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      style={{
                        display: 'flex',
                        justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '80%',
                          padding: 'var(--space-md)',
                          borderRadius: 'var(--radius-lg)',
                          background: message.role === 'user'
                            ? 'var(--primary-500)'
                            : 'var(--bg-surface)',
                          border: message.role === 'user'
                            ? 'none'
                            : '1px solid var(--border-subtle)',
                          color: message.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 'var(--space-md)',
                        }}>
                          {message.role === 'assistant' && (
                            <Bot size={20} color="var(--primary-400)" style={{ flexShrink: 0, marginTop: '2px' }} />
                          )}
                          <div style={{ flex: 1 }}>
                            <p style={{
                              fontSize: '0.8125rem',
                              opacity: 0.75,
                              marginBottom: 'var(--space-xs)',
                              color: message.role === 'user' ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
                            }}>
                              {message.role === 'user' ? 'Sie' : 'Assistent'}
                            </p>
                            {message.role === 'user' ? (
                              <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', color: '#ffffff' }}>{message.content}</p>
                            ) : (
                              (() => {
                                const { text, actions } = parseActions(message.content);
                                return (
                                  <>
                                    {text ? <ChatMarkdown content={text} /> : (isLoading ? <span style={{ color: 'var(--text-tertiary)' }}>…</span> : null)}
                                    {actions.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                        {actions.map((a, ai) => (
                                          <button key={ai} onClick={() => executeAction(a)} className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            {a.tool === 'wordlist' ? <><ListPlus size={14} /> Wortliste erstellen &amp; speichern</> : a.tool === 'mask' ? <><Play size={14} /> Mask im Recovery verwenden{a.note ? ` (${a.note})` : ''}</> : <><Play size={14} /> Recovery vorbereiten</>}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                );
                              })()
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 'var(--space-sm)' }}>
                              <span style={{ fontSize: '0.75rem', opacity: 0.5, color: message.role === 'user' ? 'rgba(255,255,255,0.8)' : 'var(--text-tertiary)' }}>
                                {message.timestamp.toLocaleTimeString(locale === 'en' ? 'en-US' : 'de-DE', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {message.role === 'assistant' && message.content && (
                                <>
                                  <button onClick={() => copyMessage(message.id, message.content)} title="Kopieren" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'inline-flex' }}>
                                    {copiedMsgId === message.id ? <Check size={13} /> : <Copy size={13} />}
                                  </button>
                                  <button onClick={() => regenerate(message.id)} disabled={isLoading} title="Neu generieren" style={{ background: 'transparent', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', color: 'var(--text-tertiary)', padding: 2, display: 'inline-flex', opacity: isLoading ? 0.4 : 1 }}>
                                    <RefreshCw size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <div style={{
                      padding: 'var(--space-md)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-md)',
                    }}>
                      <Loader2 size={20} color="var(--primary-400)" style={{ animation: 'spin 1s linear infinite' }} />
                      <span style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                      }}>Assistent antwortet...</span>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Quick Actions */}
          {messages.length > 0 && (
            <motion.div
              style={{
                display: 'flex',
                gap: 'var(--space-md)',
                overflowX: 'auto',
                paddingBottom: 'var(--space-sm)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {[
                { action: 'passwordPattern', label: 'Passwort-Muster' },
                { action: 'wordlistGenerate', label: 'Wordlist' },
                { action: 'recoveryStrategy', label: 'Recovery' },
                { action: 'hashcatMask', label: 'Hashcat-Mask' },
              ].map(({ action, label }) => (
                <motion.button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  className="btn btn-sm btn-ghost"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    flexShrink: 0,
                  }}
                >
                  {label}
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Input Area */}
          <motion.div
            style={{
              padding: 'var(--space-lg)',
              borderTop: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error && (
              <motion.div
                style={{
                  marginBottom: 'var(--space-md)',
                  padding: 'var(--space-md)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger-400)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--danger-400)',
                  fontSize: '0.875rem',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}
            <div style={{
              display: 'flex',
              gap: 'var(--space-md)',
              alignItems: 'flex-end',
            }}>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Schreiben Sie Ihre Frage oder Anfrage..."
                className="form-input"
                style={{
                  flex: 1,
                  height: '90px',
                }}
              />
              {isLoading ? (
                <button
                  onClick={stopGenerating}
                  className="btn btn-secondary"
                  title="Generierung stoppen"
                  style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', height: '44px', cursor: 'pointer', color: 'var(--danger-400)' }}
                >
                  <Square size={18} />
                </button>
              ) : (
                <motion.button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className="btn btn-primary"
                  style={{
                    padding: 'var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '44px',
                    height: '44px',
                    opacity: !inputValue.trim() ? 0.5 : 1,
                    cursor: !inputValue.trim() ? 'not-allowed' : 'pointer',
                  }}
                  whileHover={{ scale: inputValue.trim() ? 1.05 : 1 }}
                  whileTap={{ scale: inputValue.trim() ? 0.95 : 1 }}
                >
                  <Send size={20} />
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* RIGHT COLUMN - SIDEBAR */}
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg)',
            overflowY: 'auto',
            minHeight: 0,
            paddingRight: 'var(--space-sm)',
          }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          {/* Rule Engine Section */}
          <div className="card">
            <motion.div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                marginBottom: 'var(--space-md)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Cpu size={20} color="var(--primary-400)" />
              <h3 style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>Rule Engine</h3>
            </motion.div>

            <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Passwords Input */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  <KeyRound size={16} />
                  Bekannte Passwörter
                </label>
                <textarea
                  value={passwords}
                  onChange={(e) => setPasswords(e.target.value)}
                  placeholder="Ein Passwort pro Zeile..."
                  className="form-input"
                  style={{
                    minHeight: '80px',
                  }}
                />
              </div>

              {/* Keywords Input */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  <Sparkles size={16} />
                  Schlüsselwörter
                </label>
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Ein Schlüsselwort pro Zeile..."
                  className="form-input"
                  style={{
                    minHeight: '80px',
                  }}
                />
              </div>

              {/* Generate Button */}
              <motion.button
                onClick={handleGenerateRules}
                disabled={isGeneratingRules}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  opacity: isGeneratingRules ? 0.6 : 1,
                  cursor: isGeneratingRules ? 'not-allowed' : 'pointer',
                }}
                whileHover={{ scale: !isGeneratingRules ? 1.05 : 1 }}
                whileTap={{ scale: !isGeneratingRules ? 0.95 : 1 }}
              >
                {isGeneratingRules ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Generiere...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Rules generieren
                  </>
                )}
              </motion.button>

              {/* Wortlisten-Generator */}
              <button
                onClick={handleGenerateWordlist}
                disabled={isGeneratingWordlist}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', gap: '8px', marginTop: '8px', display: 'flex', alignItems: 'center', opacity: isGeneratingWordlist ? 0.6 : 1 }}
              >
                {isGeneratingWordlist ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={16} />}
                Wortliste generieren
              </button>

              {genWordlist && (
                <div style={{ marginTop: '8px', padding: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '8px' }}>
                    {genWordlist.count.toLocaleString('de-DE')} Kandidaten
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={downloadWordlist} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: '6px', fontSize: '0.75rem', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
                      <Download size={13} /> .txt
                    </button>
                    <button onClick={saveWordlistToEngine} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', gap: '6px', fontSize: '0.75rem', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
                      <Check size={13} /> In Engine
                    </button>
                  </div>
                </div>
              )}
              {wordlistMsg && (
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: wordlistMsg.startsWith('✓') ? 'var(--success-400)' : wordlistMsg.startsWith('Fehler') || wordlistMsg.startsWith('✗') ? 'var(--danger-400)' : 'var(--text-tertiary)' }}>
                  {wordlistMsg}
                </div>
              )}

              {ruleError && (
                <motion.div
                  style={{
                    padding: 'var(--space-md)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--danger-400)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--danger-400)',
                    fontSize: '0.75rem',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {ruleError}
                </motion.div>
              )}

              {/* Generated Rules */}
              {generatedRules && generatedRules.rules.length > 0 && (
                <motion.div
                  className="card"
                  style={{
                    border: '1px solid var(--primary-400)',
                    background: 'rgba(232, 115, 74, 0.04)',
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--space-md)',
                  }}>
                    <p style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                    }}>
                      {generatedRules.metadata?.count || 0} Regeln generiert
                    </p>
                    <motion.button
                      onClick={handleCopyAllRules}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--primary-400)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        transition: 'all var(--transition-fast)',
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {copiedIndex === -1 ? (
                        <>
                          <Check size={12} />
                          Kopiert
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          Alle kopieren
                        </>
                      )}
                    </motion.button>
                  </div>

                  <div style={{
                    maxHeight: '256px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-md)',
                  }}>
                    {generatedRules.rules.map((rule, index) => (
                      <motion.div
                        key={index}
                        style={{
                          background: 'var(--bg-base)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-sm)',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 'var(--space-sm)',
                        }}
                        whileHover={{ x: 4, background: 'var(--bg-surface)' }}
                        onClick={() => handleCopyRule(rule, index)}
                      >
                        <code className="mono break-all" style={{
                          fontSize: '0.75rem',
                          color: 'var(--primary-400)',
                          flex: 1,
                          lineHeight: 1.4,
                        }}>
                          {rule}
                        </code>
                        <motion.div
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          style={{ flexShrink: 0, marginTop: '2px' }}
                        >
                          {copiedIndex === index ? (
                            <Check size={14} color="var(--success-400)" />
                          ) : (
                            <Copy size={14} color="var(--text-tertiary)" />
                          )}
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>

                  <motion.button
                    onClick={handleDownloadRules}
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      padding: 'var(--space-sm) var(--space-md)',
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Download size={14} />
                    Als .rule Datei herunterladen
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Context Section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-md)',
              marginBottom: 'var(--space-md)',
            }}>
              <RefreshCw size={20} color="var(--success-400)" />
              <h3 style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>Kontext</h3>
            </motion.div>

            <div className="card" style={{
              border: '1px solid var(--success-400)',
              background: 'rgba(34, 197, 94, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-md)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                }}>Aktive Jobs</span>
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--success-400)',
                }}>{context.activeJobs}</span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                }}>System Status</span>
                <motion.div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                  }}
                  animate={{
                    scale: context.systemStatus === 'ready' ? [1, 1.05, 1] : 1,
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: context.systemStatus === 'ready'
                        ? 'var(--success-400)'
                        : 'var(--warning-400)',
                    }}
                  />
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'capitalize',
                  }}>
                    {context.systemStatus === 'ready' ? 'Bereit' : 'Beschäftigt'}
                  </span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
