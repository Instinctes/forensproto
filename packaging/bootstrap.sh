#!/usr/bin/env bash
#
# bootstrap.sh — Kern-Abhängigkeits-Installer (headless-fähig)
# =============================================================
# Installiert Homebrew, Node.js, Hashcat, Python 3 und Ollama + LLM-Modell.
# Einzige Quelle der Wahrheit für diesen Teil der Installation — wird
# aufgerufen von:
#
#   • packaging/install-forensproto-macos.sh (manueller Ein-Kommando-Setup,
#     mit hübscher Terminal-Ausgabe, gefolgt von npm-Build + App-Bundle)
#   • src-tauri/src/main.rs → run_bootstrap_if_needed() (automatisch beim
#     allerersten Start der nativen App, mit `--from-app`)
#
# Nicht idempotent-kritisch: mehrfaches Ausführen überspringt bereits
# vorhandene Komponenten. Bewusst OHNE `set -e` — ein einzelner
# fehlgeschlagener, optionaler Schritt (z.B. Ollama-Modell-Download ohne
# Internet) soll die übrigen Schritte und das Schreiben des Abschluss-
# Markers nicht verhindern; die App muss danach in jedem Fall startbar
# bleiben (nur mit ggf. eingeschränkten Funktionen).
#
# Optionen:
#   --from-app     Aufruf durch die laufende Tauri-App: knappere Wartezeit
#                  auf den Xcode-CLT-Dialog (kein unbegrenztes Warten im
#                  Hintergrund-Thread der App), Log zusätzlich nach
#                  .forensproto/bootstrap.log
#   --model=NAME   abweichendes Ollama-Modell statt "llama3"
#   --skip-ollama  KI-Setup überspringen
#
# Exit-Code: immer 0, außer bei fundamentalen Fehlern (kein macOS/arm64,
# Homebrew nicht installierbar) — siehe FATAL unten. Einzelne optionale
# Komponenten (Ollama/Modell) schlagen "weich" fehl (Warnung, kein Abbruch).
#
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# FORENSPROTO_DATA_DIR (falls gesetzt, z.B. von main.rs beim Start der
# gebündelten App) hat Vorrang vor dem Skript-Elternordner. Wichtig für
# die source-unabhängige App: dort liegt bootstrap.sh innerhalb des
# (potenziell read-only) App-Bundles selbst — Zustand darf nicht dorthin
# geschrieben werden, sondern muss in den echten Datenordner (z.B.
# ~/Library/Application Support/ForensProto). Ohne diese Variable
# (klassischer Aufruf aus packaging/ im Source-Ordner) bleibt das
# Verhalten exakt wie zuvor.
STATE_DIR="${FORENSPROTO_DATA_DIR:-$PROJECT_DIR}/.forensproto"
STATE_FILE="$STATE_DIR/setup-state.json"
LOG_FILE="$STATE_DIR/bootstrap.log"
mkdir -p "$STATE_DIR"

FROM_APP=false
MODEL="llama3"
SKIP_OLLAMA=false
for arg in "$@"; do
  case "$arg" in
    --from-app) FROM_APP=true ;;
    --model=*) MODEL="${arg#*=}" ;;
    --skip-ollama) SKIP_OLLAMA=true ;;
  esac
done

# Bei --from-app zusätzlich in eine Logdatei schreiben (kein Terminal
# sichtbar, da im Hintergrund-Thread der App gestartet).
if $FROM_APP; then
  exec > >(tee -a "$LOG_FILE") 2>&1
  echo ""
  echo "=== Bootstrap-Lauf $(date -u +%Y-%m-%dT%H:%M:%SZ) (--from-app) ==="
fi

log()  { printf "\n\033[1;36m→ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[1;32m✓ %s\033[0m\n" "$1"; }
warn() { printf "  \033[1;33m⚠ %s\033[0m\n" "$1"; }
fatal(){ printf "  \033[1;31m✗ FATAL: %s\033[0m\n" "$1"; write_state "fatal" "$1"; exit 1; }

# Status je Komponente für setup-state.json (einfacher Key=Value-Puffer).
declare -A COMPONENT_STATUS
COMPONENT_STATUS=(
  [homebrew]="pending" [node]="pending" [hashcat]="pending"
  [python]="pending" [ollama]="pending" [model]="pending"
)

write_state() {
  local overall="$1"
  local reason="${2:-}"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    echo "{"
    echo "  \"completedAt\": \"$now\","
    echo "  \"overall\": \"$overall\","
    echo "  \"reason\": \"$(echo "$reason" | sed 's/"/\\"/g')\","
    echo "  \"model\": \"$MODEL\","
    echo "  \"components\": {"
    local i=0
    local total=${#COMPONENT_STATUS[@]}
    for key in "${!COMPONENT_STATUS[@]}"; do
      i=$((i + 1))
      sep=","
      [ "$i" -eq "$total" ] && sep=""
      echo "    \"$key\": \"${COMPONENT_STATUS[$key]}\"$sep"
    done
    echo "  }"
    echo "}"
  } > "$STATE_FILE"
}

brew_install_if_missing() {
  local formula="$1"
  if brew list --formula "$formula" &>/dev/null || brew list --cask "$formula" &>/dev/null; then
    ok "$formula bereits installiert"
    return 0
  fi
  log "Installiere $formula via Homebrew…"
  brew install "$formula"
}

# ---------------------------------------------------------------------------
# 1) Plattform-Check (fundamental — ohne macOS/Homebrew kann nichts weiter
#    installiert werden)
# ---------------------------------------------------------------------------
log "Prüfe Plattform"
if [[ "$(uname -s)" != "Darwin" ]]; then
  fatal "Dieses Skript läuft nur auf macOS."
fi
ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  warn "Kein Apple Silicon erkannt (Architektur: $ARCH) — fahre trotzdem fort (ungetestet)."
else
  ok "Apple Silicon erkannt"
fi

# ---------------------------------------------------------------------------
# 2) Xcode Command Line Tools
# ---------------------------------------------------------------------------
log "Prüfe Xcode Command Line Tools"
if ! xcode-select -p &>/dev/null; then
  warn "Xcode Command Line Tools fehlen — installiere (Systemdialog erscheint, bitte 'Installieren' bestätigen)…"
  xcode-select --install || true
  # Im App-Kontext (--from-app) nicht unbegrenzt blockieren: max. 10 Minuten,
  # danach weiter (Homebrew/Formeln, die CLT brauchen, schlagen dann fehl
  # und werden unten als "failed" markiert, statt den App-Start ewig zu
  # blockieren). Im manuellen Aufruf (install-forensproto-macos.sh) darf
  # länger gewartet werden, da ein Mensch am Terminal sitzt.
  MAX_WAIT=$([ "$FROM_APP" = true ] && echo 600 || echo 1800)
  WAIT_SECS=0
  until xcode-select -p &>/dev/null || [ "$WAIT_SECS" -ge "$MAX_WAIT" ]; do
    sleep 5
    WAIT_SECS=$((WAIT_SECS + 5))
  done
  if xcode-select -p &>/dev/null; then
    ok "Xcode Command Line Tools installiert"
  else
    warn "Xcode Command Line Tools weiterhin nicht vorhanden nach ${MAX_WAIT}s Wartezeit — Homebrew-Installation wird vermutlich fehlschlagen."
  fi
else
  ok "Xcode Command Line Tools vorhanden"
fi

# ---------------------------------------------------------------------------
# 3) Homebrew (fundamental für alles Folgende)
# ---------------------------------------------------------------------------
log "Prüfe Homebrew"
if ! command -v brew &>/dev/null; then
  log "Installiere Homebrew (nicht-interaktiv)…"
  if NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
    :
  fi
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
else
  eval "$(brew shellenv)"
fi

if ! command -v brew &>/dev/null; then
  COMPONENT_STATUS[homebrew]="failed"
  write_state "partial" "Homebrew-Installation fehlgeschlagen — weitere Schritte übersprungen."
  fatal "Homebrew-Installation fehlgeschlagen. Bitte manuell installieren: https://brew.sh"
fi
COMPONENT_STATUS[homebrew]="ok"
ok "Homebrew: $(brew --version | head -1)"

BREW_PREFIX="$(brew --prefix)"
SHELL_RC="$HOME/.zprofile"
if [ "$(basename "${SHELL:-}")" != "zsh" ]; then SHELL_RC="$HOME/.bash_profile"; fi
if ! grep -qs "brew shellenv" "$SHELL_RC" 2>/dev/null; then
  echo "eval \"\$($BREW_PREFIX/bin/brew shellenv)\"" >> "$SHELL_RC" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 4) Node.js
# ---------------------------------------------------------------------------
log "Prüfe Node.js"
if brew_install_if_missing node; then
  COMPONENT_STATUS[node]="ok"
else
  COMPONENT_STATUS[node]="failed"
  warn "Node-Installation fehlgeschlagen."
fi
NODE_VER="$(node -v 2>/dev/null || echo "nicht gefunden")"
ok "Node $NODE_VER"

# ---------------------------------------------------------------------------
# 5) Hashcat
# ---------------------------------------------------------------------------
log "Prüfe Hashcat"
if brew_install_if_missing hashcat; then
  COMPONENT_STATUS[hashcat]="ok"
  ok "Hashcat: $(hashcat --version 2>/dev/null | head -1 || echo installiert)"
else
  COMPONENT_STATUS[hashcat]="failed"
  warn "Hashcat-Installation fehlgeschlagen — Recovery-Funktionen bleiben eingeschränkt."
fi

# ---------------------------------------------------------------------------
# 6) Python 3 (Standardbibliothek genügt für scripts/*.py)
# ---------------------------------------------------------------------------
log "Prüfe Python 3"
if command -v python3 &>/dev/null; then
  COMPONENT_STATUS[python]="ok"
  ok "Python: $(python3 --version)"
elif brew_install_if_missing python@3.12; then
  COMPONENT_STATUS[python]="ok"
else
  COMPONENT_STATUS[python]="failed"
  warn "Python-Installation fehlgeschlagen — Hash-Extraktionsskripte bleiben eingeschränkt."
fi

# ---------------------------------------------------------------------------
# 7) Ollama + LLM-Modell für den KI-Assistenten
# ---------------------------------------------------------------------------
if $SKIP_OLLAMA; then
  COMPONENT_STATUS[ollama]="skipped"
  COMPONENT_STATUS[model]="skipped"
  warn "Ollama-Setup übersprungen (--skip-ollama)."
else
  log "Prüfe Ollama"
  if brew_install_if_missing ollama; then
    COMPONENT_STATUS[ollama]="ok"
  else
    COMPONENT_STATUS[ollama]="failed"
  fi

  if command -v ollama &>/dev/null; then
    brew services start ollama &>/dev/null || nohup ollama serve >/tmp/forensproto-ollama.log 2>&1 &

    OLLAMA_READY=false
    for _ in $(seq 1 30); do
      if curl -s -o /dev/null http://127.0.0.1:11434 2>/dev/null; then
        OLLAMA_READY=true
        break
      fi
      sleep 1
    done

    if $OLLAMA_READY; then
      ok "Ollama läuft"
      log "Lade LLM-Modell '$MODEL' (Standard-Assistenz-Modell von ForensProto)…"
      if ollama pull "$MODEL"; then
        COMPONENT_STATUS[model]="ok"
        ok "Modell '$MODEL' geladen"
      elif ollama pull llama3.1; then
        COMPONENT_STATUS[model]="fallback:llama3.1"
        ok "Fallback-Modell 'llama3.1' geladen"
      else
        COMPONENT_STATUS[model]="failed"
        warn "Modell-Download fehlgeschlagen (Internet? Speicherplatz?) — KI-Funktionen bleiben ohne Modell eingeschränkt."
      fi
    else
      COMPONENT_STATUS[ollama]="not-responding"
      COMPONENT_STATUS[model]="skipped"
      warn "Ollama-Dienst antwortet nicht auf Port 11434 — KI-Funktionen bleiben eingeschränkt."
    fi
  else
    COMPONENT_STATUS[model]="skipped"
  fi
fi

# ---------------------------------------------------------------------------
# Abschluss: Marker immer schreiben, damit weder install-forensproto-macos.sh
# noch der App-Wrapper (main.rs) den Bootstrap bei jedem Start wiederholen —
# einzelne fehlgeschlagene, optionale Komponenten bleiben in setup-state.json
# nachvollziehbar, statt die App unbenutzbar zu machen.
# ---------------------------------------------------------------------------
write_state "completed" "Bootstrap abgeschlossen (einzelne Komponenten ggf. eingeschränkt, siehe components)."
ok "Bootstrap abgeschlossen — Status: $STATE_FILE"
exit 0
