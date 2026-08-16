"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Grid3X3,
  Loader2,
  Eraser,
  Paintbrush,
  Coins,
  AlertTriangle,
  Copy,
  Check,
  ShieldAlert,
  Activity,
  CircleSlash,
  TrendingUp,
  Fingerprint,
  Sparkles,
  Radio,
  RotateCw,
  FlipHorizontal2,
  ExternalLink,
  KeyRound,
  Wallet,
  LayoutGrid,
} from "lucide-react";
import Header from "@/components/Header";
import { EditablePanel, compactLayouts, type GridLayout } from "@/components/EditablePanel";
import { useI18n } from "@/context/I18nContext";

/**
 * Standard-Layout in RASTER-Einheiten (12-Spalten-Grid, rowH s. u.).
 * Karten rasten ein, überlappen nie (Auto-Kompaktierung) und reflowen
 * responsiv, wenn das Fenster schmaler wird (Spaltenzahl sinkt).
 */
const DEFAULT_LAYOUTS: Record<string, GridLayout> = {
  canvas: { col: 0, row: 0, w: 4, h: 17 },
  scan: { col: 0, row: 17, w: 4, h: 9 },
  algo: { col: 4, row: 0, w: 8, h: 5 },
  derived: { col: 4, row: 5, w: 8, h: 18 },
  onchain: { col: 4, row: 23, w: 8, h: 9 },
  empty: { col: 4, row: 5, w: 8, h: 6 },
};
const BOARD_STORAGE_KEY = "vk_board_layout_v2";
const ROW_H = 34;
const GRID_GAP = 14;

/** Debounce while painting so we don't hammer mempool.space */
const LIVE_DEBOUNCE_MS = 450;

type Cell = 0 | 1 | 2 | 3;
type GridSize = 8 | 12 | 16;
type Preset = "checker" | "diamond" | "spiral" | "cross" | "random" | "smile";

interface KeyResult {
  algorithm: string;
  version: string;
  patternFingerprint: string;
  features: {
    density: number;
    activeCells: number;
    components: number;
    centroidX: number;
    centroidY: number;
    symmetryH: number;
    symmetryV: number;
    symmetryD: number;
    shannonBits: number;
    estimatedEntropyBits: number;
  } | null;
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  addresses: { p2pkh: string; p2pkhUncompressed: string; p2shP2wpkh: string; p2wpkh: string };
  warnings: string[];
}

interface CheckResult {
  anyCollision: boolean;
  anyBalance: boolean;
  totalBtc: string;
  verdict: "funded" | "used" | "virgin";
  results: Array<{
    address: string;
    type: string;
    balance: string;
    unit: string;
    txCount: number;
    active: boolean;
    collision: boolean;
    error?: string;
  }>;
}

interface ScanHit {
  matchedAddress: string;
  matchedType: string;
  fileBalanceRaw?: string;
  size: number;
  privateKeyHex: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyCompressed: string;
  addresses: { p2pkh: string; p2pkhUncompressed: string; p2shP2wpkh: string; p2wpkh: string };
  foundAt: string;
}

interface ScanState {
  phase: "idle" | "generating" | "scanning" | "done" | "stopped" | "error";
  target: number;
  generated: number;
  addressesIndexed: number;
  fileLines: number;
  hits: ScanHit[];
  error?: string;
  hitsFile?: string;
}

interface ScanInfo {
  dir: string;
  fileName: string;
  filePresent: boolean;
  fileSizeBytes: number;
}

const INTENSITY_COLORS: Record<Cell, string> = {
  0: "transparent",
  1: "rgba(232, 115, 74, 0.35)",
  2: "rgba(232, 115, 74, 0.7)",
  3: "rgba(139, 92, 246, 0.9)",
};

function empty(size: GridSize): Cell[] {
  return Array(size * size).fill(0) as Cell[];
}

function buildPreset(name: Preset, size: GridSize): Cell[] {
  const cells = empty(size);
  const set = (x: number, y: number, v: Cell = 2) => {
    if (x >= 0 && x < size && y >= 0 && y < size) cells[y * size + x] = v;
  };
  if (name === "checker") {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if ((x + y) % 2 === 0) set(x, y);
  } else if (name === "diamond") {
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (Math.abs(x - c) + Math.abs(y - c) <= size / 3) set(x, y);
  } else if (name === "cross") {
    const m = (size / 2) | 0;
    for (let i = 0; i < size; i++) {
      set(m, i);
      set(i, m);
    }
  } else if (name === "spiral") {
    let x = 0,
      y = 0,
      dx = 1,
      dy = 0;
    const visited = new Set<string>();
    for (let i = 0; i < size * size; i++) {
      if (i % 2 === 0) set(x, y, (((i % 3) + 1) as Cell));
      visited.add(`${x},${y}`);
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || visited.has(`${nx},${ny}`)) {
        const t = dx;
        dx = -dy;
        dy = t;
      }
      x += dx;
      y += dy;
    }
  } else if (name === "smile") {
    const e1x = Math.floor(size * 0.3),
      e2x = Math.floor(size * 0.7),
      ey = Math.floor(size * 0.35);
    set(e1x, ey, 3);
    set(e2x, ey, 3);
    const my = Math.floor(size * 0.65);
    for (let x = Math.floor(size * 0.25); x <= Math.floor(size * 0.75); x++) {
      const dy = Math.abs(x - size / 2) > size * 0.2 ? 1 : 0;
      set(x, my + dy, 2);
    }
  } else if (name === "random") {
    for (let i = 0; i < cells.length; i++) {
      if (Math.random() < 0.35) cells[i] = ((((Math.random() * 3) | 0) + 1) as Cell);
    }
  }
  return cells;
}

/**
 * Rotiert das quadratische Zellraster um 90° im Uhrzeigersinn.
 * Zelle (x,y) → (size-1-y, x). Erhält Intensitätswerte 1:1.
 */
function rotateCW(cells: Cell[], size: GridSize): Cell[] {
  const out = empty(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[x * size + (size - 1 - y)] = cells[y * size + x];
    }
  }
  return out;
}

/**
 * Invertiert das Muster: gesetzte Zellen (>0) werden leer, leere Zellen
 * werden gesetzt. Neu gesetzte Zellen bekommen die zuletzt gewählte
 * Intensität, damit das Ergebnis konsistent mit dem aktuellen Pinsel ist.
 */
function invertCells(cells: Cell[], fill: Cell): Cell[] {
  const paint = (fill > 0 ? fill : 2) as Cell;
  return cells.map((c) => (c > 0 ? 0 : paint)) as Cell[];
}

/** Normalisiert eine HEX-Key-Eingabe (ohne 0x, klein, nur Hex-Zeichen). */
function normalizeHex(input: string): string {
  return input.trim().replace(/^0x/i, "").toLowerCase().replace(/[^0-9a-f]/g, "");
}

/** Wandelt einen 64-stelligen HEX-Key in seinen 256-Bit-Binärstring. */
function hexToBin(hex: string): string {
  const clean = normalizeHex(hex).padStart(64, "0").slice(0, 64);
  let bin = "";
  for (const ch of clean) {
    bin += parseInt(ch, 16).toString(2).padStart(4, "0");
  }
  return bin;
}

/** true, wenn die Eingabe ein vollständiger 256-bit-Key (64 Hex-Zeichen) ist. */
function isValidPrivateHex(input: string): boolean {
  return /^[0-9a-f]{64}$/.test(normalizeHex(input));
}

/**
 * Visualisiert einen 256-bit-HEX-Key als 16×16-Raster (256 Bits → 256 Zellen).
 * Bit gesetzt → Intensität 3 (violett), sonst leer. MSB des ersten Bytes =
 * Zelle 0. Unvollständige Eingaben werden links mit Nullen aufgefüllt.
 */
function hexToCells(input: string): Cell[] {
  const cells = empty(16);
  const hex = normalizeHex(input).slice(0, 64).padStart(64, "0");
  for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
    const byte = parseInt(hex.slice(byteIdx * 2, byteIdx * 2 + 2), 16);
    if (Number.isNaN(byte)) continue;
    for (let bit = 0; bit < 8; bit++) {
      if ((byte >> (7 - bit)) & 1) cells[byteIdx * 8 + bit] = 3;
    }
  }
  return cells;
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: "4px 8px", minWidth: 0 }}
      title="Kopieren"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* ignore */
        }
      }}
    >
      {ok ? <Check size={14} style={{ color: "var(--success-500)" }} /> : <Copy size={14} />}
    </button>
  );
}

/** Block-Explorer-URL für eine BTC-Adresse (mempool.space). */
function mempoolAddressUrl(addr: string): string {
  return `https://mempool.space/address/${addr}`;
}

/**
 * Öffnet eine Explorer-URL im Standardbrowser. In der nativen App würde ein
 * normaler Link im App-Fenster navigieren; daher wird die URL über die lokale
 * Route /api/system/open-url an den OS-Browser übergeben. In einem echten
 * Browser (Dev) tut das dasselbe (öffnet lokal). preventDefault verhindert die
 * In-App-Navigation; das href bleibt für Rechtsklick/Kopieren erhalten.
 */
function openExternal(e: React.MouseEvent, url: string) {
  e.preventDefault();
  void fetch("/api/system/open-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => {
    /* Fallback: im Zweifel normalen Tab-Open versuchen */
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

function MonoRow({
  label,
  value,
  mono = true,
  danger = false,
  explorerAddr,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
  /** Wenn gesetzt: rendert einen Explorer-Link (mempool.space) für diese Adresse. */
  explorerAddr?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        padding: "3px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span
        style={{
          width: 104,
          flexShrink: 0,
          fontSize: "0.6875rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-tertiary)",
          paddingTop: 2,
        }}
      >
        {label}
      </span>
      <code
        className={mono ? "mono" : undefined}
        style={{
          flex: 1,
          fontSize: "0.75rem",
          wordBreak: "break-all",
          color: danger ? "var(--danger-500)" : "var(--text-primary)",
        }}
      >
        {value}
      </code>
      {explorerAddr && (
        <a
          href={mempoolAddressUrl(explorerAddr)}
          onClick={(e) => openExternal(e, mempoolAddressUrl(explorerAddr))}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          style={{ padding: "4px 8px", minWidth: 0, display: "inline-flex", alignItems: "center" }}
          title="Im Block-Explorer öffnen (mempool.space)"
        >
          <ExternalLink size={14} />
        </a>
      )}
      <CopyBtn text={value} />
    </div>
  );
}

/** Kleine, dezente Zwischenüberschrift zur Gruppierung von MonoRow-Blöcken. */
function SectionLabel({ icon, children, tone = "default" }: { icon?: React.ReactNode; children: React.ReactNode; tone?: "default" | "danger" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        margin: "14px 0 6px",
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: tone === "danger" ? "var(--danger-500)" : "var(--text-tertiary)",
      }}
    >
      {icon}
      {children}
    </div>
  );
}

export default function VisualKeyPage() {
  const { t } = useI18n();
  const [size, setSize] = useState<GridSize>(12);
  const [cells, setCells] = useState<Cell[]>(() => empty(12));
  const [intensity, setIntensity] = useState<Cell>(2);
  const [mode, setMode] = useState<"paint" | "erase">("paint");
  const [salt, setSalt] = useState("");
  const [painting, setPainting] = useState(false);
  // Modus „eigener HEX-Key": Nutzer gibt einen 256-bit-Key ein, der als
  // 16×16-Raster visualisiert und dessen Adressen direkt (ohne CL-1) geprüft
  // werden. Malen ist in diesem Modus deaktiviert (Raster = Abbild des Keys).
  const [ownKeyMode, setOwnKeyMode] = useState(false);
  const [ownKeyHex, setOwnKeyHex] = useState("");
  // Offline-Muster-Scan (Research)
  const [scanInfo, setScanInfo] = useState<ScanInfo | null>(null);
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [scanCount, setScanCount] = useState(100000);
  const [scanErr, setScanErr] = useState<string | null>(null);
  // Editierbares Snap-Grid-Layout der Karten
  const [editMode, setEditMode] = useState(false);
  const [layouts, setLayouts] = useState<Record<string, GridLayout>>(DEFAULT_LAYOUTS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [boardWidth, setBoardWidth] = useState(1100);
  const boardRef = useRef<HTMLDivElement>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "pending" | "loading" | "ready" | "empty">("empty");
  const [result, setResult] = useState<KeyResult | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  const activeCount = useMemo(() => cells.filter((c) => c > 0).length, [cells]);
  const cellsKey = useMemo(() => cells.join(""), [cells]);

  const resize = (n: GridSize) => {
    setSize(n);
    setCells(empty(n));
  };

  // Umschalten in/aus dem eigenen-HEX-Key-Modus. Beim Aktivieren wird auf
  // 16×16 (= 256 Bit) gewechselt und der aktuelle Key visualisiert; beim
  // Deaktivieren wird das Raster geleert, damit wieder frei gemalt werden kann.
  const toggleOwnKeyMode = (on: boolean) => {
    setOwnKeyMode(on);
    if (on) {
      setSize(16);
      setCells(hexToCells(ownKeyHex));
    } else {
      setCells(empty(size));
    }
  };

  const onOwnKeyChange = (val: string) => {
    const norm = normalizeHex(val).slice(0, 64);
    setOwnKeyHex(norm);
    setCells(hexToCells(norm));
  };

  // ── Offline-Muster-Scan (Research) ──
  const scanApi = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      return fetch("/api/visual-key/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      }).then((x) => x.json());
    },
    []
  );

  const scanPrepare = useCallback(async () => {
    const r = await scanApi("prepare");
    if (r.success) setScanInfo(r as ScanInfo);
  }, [scanApi]);

  const refreshScan = useCallback(async () => {
    const r = await scanApi("status");
    if (r.success) setScanState(r.state as ScanState | null);
  }, [scanApi]);

  const startScanRun = async () => {
    setScanErr(null);
    const r = await scanApi("start", { count: scanCount, size: 16 });
    if (r.success) setScanState(r.state as ScanState);
    else setScanErr(r.error || "Start fehlgeschlagen");
  };

  const stopScanRun = async () => {
    const r = await scanApi("stop");
    if (r.success) setScanState(r.state as ScanState | null);
  };

  const revealFundedFolder = async () => {
    await scanApi("reveal");
    await scanPrepare();
  };

  // Ordnerinfo einmalig laden + laufenden Scan-Status übernehmen
  useEffect(() => {
    void scanPrepare();
    void refreshScan();
  }, [scanPrepare, refreshScan]);

  // Solange ein Scan läuft: Status pollen
  const scanRunning = scanState?.phase === "generating" || scanState?.phase === "scanning";
  useEffect(() => {
    if (!scanRunning) return;
    const id = setInterval(() => void refreshScan(), 1200);
    return () => clearInterval(id);
  }, [scanRunning, refreshScan]);

  // ── Snap-Grid-Layout: laden + Breite messen (responsiv) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOARD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, GridLayout>;
        setLayouts({ ...DEFAULT_LAYOUTS, ...parsed });
      }
    } catch {
      /* ungültiger Speicherstand → Defaults */
    }
  }, []);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setBoardWidth(Math.max(320, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spaltenzahl abhängig von der Breite → responsive Reflow.
  const cols = boardWidth >= 1024 ? 12 : boardWidth >= 640 ? 6 : 2;
  const colW = boardWidth / cols;

  const updateLayout = useCallback((id: string, next: GridLayout) => {
    setLayouts((prev) => ({ ...prev, [id]: next }));
  }, []);

  const resetLayout = useCallback(() => {
    setLayouts(DEFAULT_LAYOUTS);
    try {
      localStorage.removeItem(BOARD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const ownKeyValid = ownKeyMode && isValidPrivateHex(ownKeyHex);

  // Malen beim Ziehen (Drag): setzt die Zelle auf die aktuelle Intensität
  // (bzw. leert sie im Radier-Modus). Kein Toggle — sonst würde das
  // Drüberziehen über bereits gemalte Zellen diese wieder löschen.
  const applyAt = useCallback(
    (index: number) => {
      if (ownKeyMode) return; // Raster spiegelt den eingegebenen Key — kein Malen
      setCells((prev) => {
        const next = prev.slice() as Cell[];
        next[index] = mode === "erase" ? 0 : intensity;
        return next;
      });
    },
    [mode, intensity, ownKeyMode]
  );

  // Einzelklick/Tastatur: Toggle. Hat die Zelle bereits die aktuelle
  // Intensität, wird sie geleert; sonst wird sie gesetzt. So lässt sich ein
  // gemalter Kasten durch erneutes Klicken wieder rückgängig machen.
  const toggleAt = useCallback(
    (index: number) => {
      if (ownKeyMode) return;
      setCells((prev) => {
        const next = prev.slice() as Cell[];
        if (mode === "erase") {
          next[index] = 0;
        } else {
          next[index] = prev[index] === intensity ? 0 : intensity;
        }
        return next;
      });
    },
    [mode, intensity, ownKeyMode]
  );

  const onCellEnter = (index: number) => {
    if (painting) applyAt(index);
  };

  // Live: every pattern / salt / key change → derive key + on-chain balance (debounced)
  useEffect(() => {
    // Nichts zu prüfen: im eigenen-Key-Modus braucht es einen gültigen Key,
    // sonst mindestens eine gesetzte Zelle.
    if (ownKeyMode ? !ownKeyValid : activeCount === 0) {
      reqIdRef.current += 1; // invalidate in-flight requests
      return;
    }

    const myId = ++reqIdRef.current;
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled || myId !== reqIdRef.current) return;
      setLiveStatus("loading");
      setError(null);

      void (async () => {
        try {
          // Automatischer Offline-Balance-Check: prüft die Adressen bei jeder
          // (debounced) Änderung gegen die lokale Adressdatei. Kein Netzwerk,
          // daher kein Rate-Limit (checkBalance: true).
          const requestBody = ownKeyMode
            ? { privateKeyHex: normalizeHex(ownKeyHex), checkBalance: true }
            : { size, cells, salt: salt.trim() || undefined, checkBalance: true };
          const r = await fetch("/api/visual-key/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }).then((x) => x.json());

          if (cancelled || myId !== reqIdRef.current) return;

          if (!r.success) {
            setError(r.error || t("vk.errorCheck"));
            setResult(null);
            setCheck(null);
            setLiveStatus("idle");
            return;
          }

          if (r.key) setResult(r.key as KeyResult);
          setCheck(r as CheckResult);
          setLiveStatus("ready");
        } catch {
          if (cancelled || myId !== reqIdRef.current) return;
          setError(t("common.networkError"));
          setLiveStatus("idle");
        }
      })();
    }, LIVE_DEBOUNCE_MS);

    // Immediate UI feedback while debouncing (schedule microtask to avoid sync setState-in-effect lint)
    const pendingTimer = setTimeout(() => {
      if (!cancelled && myId === reqIdRef.current) setLiveStatus("pending");
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(pendingTimer);
    };
  }, [size, cellsKey, salt, activeCount, cells, t, ownKeyMode, ownKeyValid, ownKeyHex]);


  // Grid-Abstand + feste Breite der Zeilennummern-Spalte (für die
  // Rasterbeschriftung, muss zwischen Header und Grid konsistent sein).
  const gapPx = size >= 16 ? 2 : 3;
  const rowLabelW = 18;
  const labelFontPx = size >= 16 ? 8 : size >= 12 ? 9 : 11;

  // „Aktiv" = es gibt etwas zu zeigen: gültiger eigener Key oder gemaltes Muster.
  const hasContent = ownKeyMode ? ownKeyValid : activeCount > 0;
  const effectiveStatus = !hasContent ? "empty" : liveStatus;
  const showResult = hasContent ? result : null;
  const showCheck = hasContent ? check : null;
  const showError = hasContent ? error : null;
  const isBusy = effectiveStatus === "pending" || effectiveStatus === "loading";

  const verdictUi = () => {
    if (!showCheck) return null;
    const cfg =
      showCheck.verdict === "funded"
        ? {
            color: "var(--success-500)",
            bg: "rgba(34,197,94,0.1)",
            icon: <TrendingUp size={18} />,
            text: t("vk.verdictFunded"),
          }
        : showCheck.verdict === "used"
          ? {
              color: "var(--warning-500)",
              bg: "rgba(245,158,11,0.1)",
              icon: <Activity size={18} />,
              text: t("vk.verdictUsed"),
            }
          : {
              color: "var(--text-tertiary)",
              bg: "var(--bg-secondary)",
              icon: <CircleSlash size={18} />,
              text: t("vk.verdictVirgin"),
            };
    return (
      <div
        style={{
          marginTop: "var(--space-md)",
          padding: "var(--space-md) var(--space-lg)",
          borderRadius: "var(--radius-md)",
          background: cfg.bg,
          border: `1px solid ${cfg.color}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: cfg.color,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          {cfg.icon} {cfg.text}
          {showCheck.anyBalance && (
            <span className="mono" style={{ marginLeft: "auto", fontSize: "0.875rem" }}>
              Σ {showCheck.totalBtc} BTC
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {showCheck.results.map((r, i) => (
            <div
              key={i}
              style={{
                fontSize: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", width: 90 }}>
                {r.type}
                {r.collision && (
                  <span style={{ color: "var(--warning-500)", marginLeft: 4 }}>●</span>
                )}
              </span>
              <a
                href={mempoolAddressUrl(r.address)}
                onClick={(e) => openExternal(e, mempoolAddressUrl(r.address))}
                target="_blank"
                rel="noopener noreferrer"
                className="mono"
                title="Im Block-Explorer öffnen (mempool.space)"
                style={{
                  color: "var(--primary-500)",
                  wordBreak: "break-all",
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  textDecoration: "none",
                }}
              >
                {r.address}
                <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
              </a>
              <span
                className="mono"
                style={{
                  color: parseFloat(r.balance) > 0 ? "var(--success-500)" : "var(--text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                {r.error
                  ? `⚠ ${r.error}`
                  : r.collision
                    ? `TREFFER${parseFloat(r.balance) > 0 ? ` · ${r.balance} ${r.unit}` : r.balance && r.balance !== "0" ? ` · ${r.balance}` : ""}`
                    : "nicht in Liste"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Sichtbare Karten → überlappungsfrei kompaktiertes Layout (Snap-Grid).
  const visiblePanelIds = ["canvas", "scan", "algo", ...(showResult ? ["derived", "onchain"] : ["empty"])];
  const positioned = compactLayouts(layouts, visiblePanelIds, cols, draggingId);
  const boardRows = Math.max(
    0,
    ...visiblePanelIds.map((pid) => {
      const l = positioned[pid];
      return l ? l.row + l.h : 0;
    })
  );
  const boardHeight = boardRows * ROW_H + GRID_GAP + 8;

  // Loslassen (Drag/Resize-Ende): Kompaktierung dauerhaft „einbacken" + speichern.
  const onDragState = (id: string | null) => {
    if (id) {
      setDraggingId(id);
      return;
    }
    setDraggingId(null);
    setLayouts((prev) => {
      const merged = { ...prev, ...compactLayouts(prev, visiblePanelIds, cols, null) };
      try {
        localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* Speichern optional */
      }
      return merged;
    });
  };

  // Gemeinsame Props je Panel (aus dem kompaktierten Layout).
  const panelProps = (pid: string) => ({
    id: pid,
    layout: positioned[pid] || layouts[pid] || DEFAULT_LAYOUTS[pid],
    colW,
    rowH: ROW_H,
    gap: GRID_GAP,
    cols,
    editMode,
    dragging: draggingId === pid,
    onChange: updateLayout,
    onDragState,
  });

  return (
    <div className="page-container">
      <Header title={t("vk.title")} subtitle={t("vk.subtitle")} />

      <motion.main
        className="content-area"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}
      >
        {/* Research notice */}
        <div
          className="card"
          style={{
            padding: "12px 16px",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.35)",
          }}
        >
          <ShieldAlert size={18} style={{ color: "var(--warning-500)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--warning-600)" }}>{t("vk.researchBadge")}</strong>
            {" — "}
            {t("vk.researchNote")}
          </div>
        </div>

        {/* ── Layout-Editor-Leiste ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${editMode ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setEditMode((v) => !v)}
            style={{ padding: "6px 12px", fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <LayoutGrid size={15} /> {editMode ? t("vk.layout.done") : t("vk.layout.edit")}
          </button>
          {editMode && (
            <>
              <button type="button" className="btn btn-ghost" onClick={resetLayout} style={{ padding: "6px 12px", fontSize: "0.8125rem" }}>
                {t("vk.layout.reset")}
              </button>
              <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{t("vk.layout.hint")}</span>
            </>
          )}
        </div>

        {/* ── Editierbares Snap-Grid-Board (Karten rasten ein, kein Overlap) ── */}
        <div ref={boardRef} className="vk-board" style={{ position: "relative", height: boardHeight }}>
          <EditablePanel {...panelProps("canvas")}>
          {/* ── Canvas ── */}
          <section className="card" style={{ padding: "var(--space-lg)" }}>
            <h3
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: "var(--space-md)",
                fontSize: "0.95rem",
              }}
            >
              <Grid3X3 size={18} style={{ color: "var(--primary-400)" }} />
              {t("vk.canvas")}
              <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                {activeCount}/{size * size}
              </span>
            </h3>

            {/* Eigener HEX-Private-Key (Visualisierung) */}
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: ownKeyMode ? "rgba(99,102,241,0.08)" : "var(--bg-secondary)",
                border: `1px solid ${ownKeyMode ? "var(--primary-400)" : "var(--border-subtle)"}`,
              }}
            >
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, color: "var(--primary-500)" }}>
                <input
                  type="checkbox"
                  checked={ownKeyMode}
                  onChange={(e) => toggleOwnKeyMode(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--primary-500)", cursor: "pointer" }}
                />
                {t("vk.ownKey.toggle")}
              </label>
              {ownKeyMode && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    {t("vk.ownKey.label")}
                  </div>
                  <input
                    className="af-input form-input"
                    value={ownKeyHex}
                    onChange={(e) => onOwnKeyChange(e.target.value)}
                    placeholder={t("vk.ownKey.placeholder")}
                    spellCheck={false}
                    autoComplete="off"
                    style={{
                      width: "100%",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      borderColor: ownKeyHex && !ownKeyValid ? "var(--danger-500)" : undefined,
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: "0.6875rem", color: ownKeyHex && !ownKeyValid ? "var(--danger-500)" : "var(--text-tertiary)" }}>
                    {ownKeyHex && !ownKeyValid ? t("vk.ownKey.invalid") : `${normalizeHex(ownKeyHex).length}/64 · ${t("vk.ownKey.hint")}`}
                  </div>
                </div>
              )}
            </div>

            {/* Size */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {([8, 12, 16] as GridSize[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${size === n ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => resize(n)}
                  disabled={ownKeyMode}
                  style={{ padding: "6px 12px", fontSize: "0.8125rem", opacity: ownKeyMode ? 0.5 : 1, cursor: ownKeyMode ? "not-allowed" : "pointer" }}
                >
                  {n}×{n}
                </button>
              ))}
            </div>

            {/* Tools */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className={`btn ${mode === "paint" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setMode("paint")}
                style={{ padding: "6px 10px", display: "flex", gap: 6, alignItems: "center" }}
              >
                <Paintbrush size={14} /> {t("vk.paint")}
              </button>
              <button
                type="button"
                className={`btn ${mode === "erase" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setMode("erase")}
                style={{ padding: "6px 10px", display: "flex", gap: 6, alignItems: "center" }}
              >
                <Eraser size={14} /> {t("vk.erase")}
              </button>
              <span style={{ width: 1, height: 22, background: "var(--border-default)", margin: "0 4px" }} />
              {([1, 2, 3] as Cell[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setIntensity(lvl);
                    setMode("paint");
                  }}
                  title={`${t("vk.intensity")} ${lvl}`}
                  style={{
                    padding: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: INTENSITY_COLORS[lvl],
                    border:
                      intensity === lvl && mode === "paint"
                        ? "2px solid var(--primary-500)"
                        : "1px solid var(--border-default)",
                  }}
                />
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCells(empty(size))}
                style={{ marginLeft: "auto", padding: "6px 10px", fontSize: "0.75rem" }}
              >
                {t("vk.clear")}
              </button>
            </div>

            {/* Grid mit Zeilen-/Spaltenbeschriftung (1…size). Responsiv:
                füllt die Spalte bis zu einer Maximalbreite und bleibt
                quadratisch; Zellen skalieren mit (aspect-ratio), sodass auch
                16×16 nie über den Container hinausragt. */}
            <div style={{ width: "100%", maxWidth: 340 + rowLabelW }}>
              {/* Spaltennummern */}
              <div style={{ display: "flex" }}>
                <div style={{ width: rowLabelW, flexShrink: 0 }} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${size}, 1fr)`,
                    gap: gapPx,
                    flex: 1,
                    padding: "0 10px",
                    boxSizing: "border-box",
                    marginBottom: 3,
                  }}
                >
                  {Array.from({ length: size }).map((_, i) => (
                    <div
                      key={i}
                      style={{ textAlign: "center", fontSize: labelFontPx, fontWeight: 700, color: "var(--text-tertiary)" }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "stretch" }}>
                {/* Zeilennummern */}
                <div
                  style={{
                    width: rowLabelW,
                    flexShrink: 0,
                    display: "grid",
                    gridTemplateRows: `repeat(${size}, 1fr)`,
                    gap: gapPx,
                    padding: "10px 0",
                    boxSizing: "border-box",
                  }}
                >
                  {Array.from({ length: size }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        paddingRight: 4,
                        fontSize: labelFontPx,
                        fontWeight: 700,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Zell-Grid */}
                <div
                  ref={gridRef}
                  onMouseLeave={() => setPainting(false)}
                  onMouseUp={() => setPainting(false)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${size}, 1fr)`,
                    gap: gapPx,
                    flex: 1,
                    aspectRatio: "1 / 1",
                    padding: 10,
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    userSelect: "none",
                    touchAction: "none",
                    boxSizing: "border-box",
                  }}
                >
              {cells.map((c, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`cell ${i}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setPainting(true);
                    toggleAt(i);
                  }}
                  onMouseEnter={() => onCellEnter(i)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggleAt(i);
                    }
                  }}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    minWidth: 0,
                    borderRadius: size >= 16 ? 3 : 4,
                    background:
                      c === 0
                        ? "var(--bg-surface)"
                        : INTENSITY_COLORS[c],
                    border: "1px solid var(--border-subtle)",
                    cursor: ownKeyMode ? "default" : "crosshair",
                    boxShadow: c === 3 ? "0 0 0 1px rgba(139,92,246,0.4)" : undefined,
                    transition: "background 60ms",
                  }}
                />
              ))}
                </div>
              </div>
            </div>

            {/* Presets */}
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--text-tertiary)",
                  marginBottom: 6,
                }}
              >
                {t("vk.presets")}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {(["checker", "diamond", "cross", "spiral", "smile", "random"] as Preset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCells(buildPreset(p, size))}
                    style={{ padding: "5px 10px", fontSize: "0.75rem" }}
                  >
                    {t(`vk.preset.${p}`)}
                  </button>
                ))}
                {/* Trenner zwischen Presets und Transformationen */}
                <span style={{ width: 1, height: 20, background: "var(--border-default)", margin: "0 2px" }} />
                {/* Transformationen: wirken auf das aktuelle Muster (Uhrzeigersinn / Invertierung) */}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCells((prev) => rotateCW(prev, size))}
                  disabled={activeCount === 0}
                  title={t("vk.transform.rotate")}
                  style={{ padding: "5px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <RotateCw size={13} /> {t("vk.transform.rotate")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCells((prev) => invertCells(prev, intensity))}
                  title={t("vk.transform.invert")}
                  style={{ padding: "5px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <FlipHorizontal2 size={13} /> {t("vk.transform.invert")}
                </button>
              </div>
            </div>

            {/* Salt */}
            <div style={{ marginTop: 14 }}>
              <label className="form-label">{t("vk.salt")}</label>
              <input
                className="af-input form-input"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder={t("vk.saltPlaceholder")}
                style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
              />
            </div>

            {/* Live status — no buttons required */}
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
              }}
            >
              {isBusy ? (
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--primary-400)", flexShrink: 0 }} />
              ) : (
                <Radio
                  size={16}
                  style={{
                    color: effectiveStatus === "ready" ? "var(--success-500)" : "var(--text-tertiary)",
                    flexShrink: 0,
                  }}
                />
              )}
              <span>
                {effectiveStatus === "empty" && t("vk.liveEmpty")}
                {effectiveStatus === "pending" && t("vk.livePending")}
                {effectiveStatus === "loading" && t("vk.liveLoading")}
                {effectiveStatus === "ready" && t("vk.liveReady")}
                {effectiveStatus === "idle" && (showError || t("vk.liveIdle"))}
              </span>
            </div>

            {showError && (
              <div style={{ marginTop: 12, color: "var(--danger-500)", fontSize: "0.8125rem" }}>{showError}</div>
            )}
          </section>
          </EditablePanel>

          {/* ── Offline-Muster-Scan ── */}
          <EditablePanel {...panelProps("scan")}>
          <section className="card" style={{ padding: "var(--space-md)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: "0.9rem" }}>
              <Sparkles size={16} style={{ color: "var(--accent-500)" }} />
              {t("vk.scan.title")}
              {scanRunning && <Loader2 size={13} className="animate-spin" style={{ color: "var(--primary-400)" }} />}
            </h3>
            <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: 8, lineHeight: 1.45 }}>
              {t("vk.scan.desc")}
            </p>
            <div
              style={{
                display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
                padding: "8px 10px", borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", marginBottom: 8,
              }}
            >
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                {t("vk.scan.file")}: <span className="mono">{scanInfo?.fileName || "btcadresseswithbalance.txt"}</span>
              </span>
              {scanInfo?.filePresent ? (
                <span className="badge badge-success" style={{ fontSize: "0.65rem" }}>
                  {t("vk.scan.filePresent")} ({(scanInfo.fileSizeBytes / 1e6).toFixed(1)} MB)
                </span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: "0.65rem" }}>{t("vk.scan.fileMissing")}</span>
              )}
              <button
                type="button" className="btn btn-ghost" onClick={revealFundedFolder}
                style={{ padding: "4px 8px", fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto" }}
              >
                <ExternalLink size={12} /> {t("vk.scan.openFolder")}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: "0.72rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                {t("vk.scan.count")}:
                <input
                  type="number" min={1000} max={5000000} step={10000} value={scanCount}
                  onChange={(e) => setScanCount(Math.max(1, Number(e.target.value) || 0))}
                  disabled={scanRunning} className="af-input form-input"
                  style={{ width: 110, fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}
                />
              </label>
              {!scanRunning ? (
                <button
                  type="button" className="btn btn-primary" onClick={startScanRun} disabled={!scanInfo?.filePresent}
                  style={{ padding: "5px 12px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Sparkles size={13} /> {t("vk.scan.start")}
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={stopScanRun} style={{ padding: "5px 12px", fontSize: "0.78rem" }}>
                  {t("vk.scan.stop")}
                </button>
              )}
              {scanErr && <span style={{ fontSize: "0.72rem", color: "var(--danger-500)" }}>{scanErr}</span>}
            </div>
            {scanState && scanState.phase !== "idle" && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>{t("vk.scan.phase")}: <strong style={{ color: scanState.phase === "error" ? "var(--danger-500)" : "var(--text-primary)" }}>{t(`vk.scan.phase.${scanState.phase}`)}</strong></span>
                <span className="mono">{t("vk.scan.generated")}: {scanState.generated.toLocaleString()} / {scanState.target.toLocaleString()}</span>
                {scanState.fileLines > 0 && <span className="mono">{t("vk.scan.scanned")}: {scanState.fileLines.toLocaleString()}</span>}
                <span className="mono" style={{ color: scanState.hits.length > 0 ? "var(--success-500)" : undefined }}>{t("vk.scan.hits")}: {scanState.hits.length}</span>
              </div>
            )}
            {scanState && scanState.hits.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {scanState.hits.map((h, i) => (
                  <div key={i} className="card" style={{ padding: "var(--space-md)", border: "1px solid var(--success-500)", background: "rgba(34,197,94,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span className="badge badge-success" style={{ fontSize: "0.65rem" }}>TREFFER</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>{h.matchedType}</span>
                      {h.fileBalanceRaw && <span className="mono" style={{ fontSize: "0.78rem", color: "var(--success-500)", marginLeft: "auto" }}>{h.fileBalanceRaw}</span>}
                    </div>
                    <MonoRow label="Treffer-Adr." value={h.matchedAddress} explorerAddr={h.matchedAddress} />
                    <SectionLabel icon={<KeyRound size={12} />} tone="danger">{t("vk.group.secret")}</SectionLabel>
                    <MonoRow label="Private Key" value={h.privateKeyHex} danger />
                    <MonoRow label="WIF (compr.)" value={h.wifCompressed} danger />
                    <MonoRow label="WIF (uncompr.)" value={h.wifUncompressed} danger />
                    <SectionLabel icon={<Wallet size={12} />}>{t("vk.group.addresses")}</SectionLabel>
                    <MonoRow label="P2PKH" value={h.addresses.p2pkh} explorerAddr={h.addresses.p2pkh} />
                    <MonoRow label="P2PKH (uncompr.)" value={h.addresses.p2pkhUncompressed} explorerAddr={h.addresses.p2pkhUncompressed} />
                    <MonoRow label="P2SH-P2WPKH" value={h.addresses.p2shP2wpkh} explorerAddr={h.addresses.p2shP2wpkh} />
                    <MonoRow label="P2WPKH" value={h.addresses.p2wpkh} explorerAddr={h.addresses.p2wpkh} />
                  </div>
                ))}
                {scanState.hitsFile && (
                  <div style={{ fontSize: "0.65rem", color: "var(--text-tertiary)" }}>{t("vk.scan.savedTo")}: <span className="mono">{scanState.hitsFile}</span></div>
                )}
              </div>
            )}
            {scanState && (scanState.phase === "done" || scanState.phase === "stopped") && scanState.hits.length === 0 && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 8 }}>{t("vk.scan.noHits")}</div>
            )}
          </section>
          </EditablePanel>

          {/* ── Algorithmus CL-1 ── */}
          <EditablePanel {...panelProps("algo")}>
            <section className="card" style={{ padding: "var(--space-md)" }}>
              <h3
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: "var(--space-sm)",
                  fontSize: "0.95rem",
                }}
              >
                <Sparkles size={18} style={{ color: "var(--accent-500)" }} />
                {t("vk.algoTitle")}
              </h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 10 }}>
                {t("vk.algoDesc")}
              </p>
              <div
                className="mono"
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-tertiary)",
                  background: "var(--bg-secondary)",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  lineHeight: 1.6,
                }}
              >
                {t("vk.algoPipeline")}
              </div>
            </section>
          </EditablePanel>

            {showResult && (
              <>
                <EditablePanel {...panelProps("derived")}>
                <section className="card" style={{ padding: "var(--space-md)" }}>
                  <h3
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: "var(--space-md)",
                      fontSize: "0.95rem",
                    }}
                  >
                    <Fingerprint size={18} style={{ color: "var(--primary-400)" }} />
                    {t("vk.result")}
                    <span
                      className="mono"
                      style={{
                        marginLeft: "auto",
                        fontSize: "0.7rem",
                        color: "var(--text-tertiary)",
                        fontWeight: 400,
                      }}
                    >
                      {showResult.algorithm} v{showResult.version} · fp {showResult.patternFingerprint}
                    </span>
                  </h3>

                  {/* Feature KPIs — nur bei Muster-Ableitung (CL-1), nicht im
                      eigenen-HEX-Key-Modus (dort gibt es kein Muster). */}
                  {showResult.features && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                      marginBottom: "var(--space-md)",
                    }}
                  >
                    {[
                      { l: t("vk.feat.entropy"), v: `~${showResult.features.estimatedEntropyBits} bit` },
                      { l: t("vk.feat.active"), v: showResult.features.activeCells },
                      { l: t("vk.feat.components"), v: showResult.features.components },
                      { l: t("vk.feat.density"), v: `${(showResult.features.density * 100).toFixed(0)}%` },
                      {
                        l: t("vk.feat.symmetry"),
                        v: `${(((showResult.features.symmetryH + showResult.features.symmetryV + showResult.features.symmetryD) / 3) * 100).toFixed(0)}%`,
                      },
                      { l: t("vk.feat.shannon"), v: `${showResult.features.shannonBits.toFixed(2)}` },
                    ].map((k) => (
                      <div
                        key={k.l}
                        style={{
                          textAlign: "center",
                          padding: "7px 6px",
                          background: "var(--bg-secondary)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>{k.v}</div>
                        <div
                          style={{
                            fontSize: "0.625rem",
                            color: "var(--text-tertiary)",
                            textTransform: "uppercase",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {k.l}
                        </div>
                      </div>
                    ))}
                  </div>
                  )}

                  {showResult.warnings.length > 0 && (
                    <div
                      style={{
                        marginBottom: "var(--space-md)",
                        padding: "10px 12px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(248,113,113,0.08)",
                        border: "1px solid rgba(248,113,113,0.3)",
                        fontSize: "0.75rem",
                        color: "var(--danger-600)",
                      }}
                    >
                      {showResult.warnings.map((w, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, marginBottom: i < showResult.warnings.length - 1 ? 4 : 0 }}>
                          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Geheimes Schlüsselmaterial — optisch abgesetzt (getönt). */}
                  <div
                    style={{
                      padding: "4px 14px 10px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(248,113,113,0.05)",
                      border: "1px solid rgba(248,113,113,0.2)",
                    }}
                  >
                    <SectionLabel icon={<KeyRound size={12} />} tone="danger">
                      {t("vk.group.secret")}
                    </SectionLabel>
                    <MonoRow label="Private Key" value={showResult.privateKeyHex} danger />
                    <MonoRow label="Priv (BIN)" value={hexToBin(showResult.privateKeyHex)} danger />
                    <MonoRow label="WIF (compr.)" value={showResult.wifCompressed} danger />
                    <MonoRow label="WIF (uncompr.)" value={showResult.wifUncompressed} danger />
                    <MonoRow label="Pubkey" value={showResult.publicKeyCompressed} />
                  </div>

                  <SectionLabel icon={<Wallet size={12} />}>{t("vk.group.addresses")}</SectionLabel>
                  <MonoRow label="P2PKH" value={showResult.addresses.p2pkh} explorerAddr={showResult.addresses.p2pkh} />
                  <MonoRow label="P2PKH (uncompr.)" value={showResult.addresses.p2pkhUncompressed} explorerAddr={showResult.addresses.p2pkhUncompressed} />
                  <MonoRow label="P2SH-P2WPKH" value={showResult.addresses.p2shP2wpkh} explorerAddr={showResult.addresses.p2shP2wpkh} />
                  <MonoRow label="P2WPKH" value={showResult.addresses.p2wpkh} explorerAddr={showResult.addresses.p2wpkh} />
                </section>
                </EditablePanel>

                <EditablePanel {...panelProps("onchain")}>
                <section className="card" style={{ padding: "var(--space-md)" }}>
                  <h3
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                      fontSize: "0.95rem",
                    }}
                  >
                    <Coins size={18} style={{ color: "var(--success-500)" }} />
                    {t("vk.onchain")}
                    {isBusy && (
                      <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
                    )}
                  </h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>
                    {t("vk.onchainHint")}
                  </p>
                  {verdictUi()}
                  {!showCheck && isBusy && (
                    <div style={{ marginTop: 12, fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
                      {t("vk.balance.checking")}
                    </div>
                  )}
                </section>
                </EditablePanel>
              </>
            )}

            {!showResult && (
              <EditablePanel {...panelProps("empty")}>
              <section
                className="card"
                style={{
                  padding: "var(--space-2xl)",
                  textAlign: "center",
                  color: "var(--text-tertiary)",
                  fontSize: "0.875rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isBusy ? (
                  <Loader2 size={32} className="animate-spin" style={{ opacity: 0.5, marginBottom: 12 }} />
                ) : (
                  <Grid3X3 size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
                )}
                <div>{isBusy ? t("vk.liveLoading") : t("vk.emptyState")}</div>
              </section>
              </EditablePanel>
            )}
        </div>
      </motion.main>

      <style jsx global>{`
        /* Frei editierbares Karten-Board: Panels sind absolut positioniert
           (siehe EditablePanel), daher braucht der Container nur einen
           Scroll-Kontext bei sehr breiten/hohen Anordnungen. */
        .vk-board {
          min-width: 0;
        }
        .animate-spin {
          animation: vk-spin 0.8s linear infinite;
        }
        @keyframes vk-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
