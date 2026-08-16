#!/usr/bin/env bash
#
# install-forensproto-macos.sh — Ein-Kommando-Installer für Apple Silicon
# =========================================================================
# Installiert alle Laufzeit-Abhängigkeiten von ForensProto (über
# packaging/bootstrap.sh) und baut anschließend die ECHTE native
# Fenster-App (Tauri) — standardmäßig, kein Browser-Tab, kein sichtbarer
# Dev-Server:
#
#   • Xcode Command Line Tools, Homebrew, Node.js, Hashcat, Python 3
#   • Ollama + LLM-Modell für den KI-Assistenten (Standard: llama3)
#   • Rust-Toolchain (rustup) — nur für den nativen Build benötigt
#   • npm install / npm run build (erzeugt u.a. den Next.js-"standalone"-
#     Server, siehe next.config.ts)
#   • native App via `npm run tauri build` → wird als ./ForensProto.app
#     (+ ./ForensProto.dmg, falls erzeugt) im Projekt-Stammverzeichnis
#     bereitgestellt. Ein Doppelklick öffnet ein eigenes App-Fenster,
#     keinen Browser-Tab.
#
#   Die App bringt ihren Server (packaging/prepare-bundle.sh →
#   src-tauri/resources/app/, automatisch über tauri.conf.json
#   beforeBuildCommand) fest eingebettet mit und ist danach VOLLSTÄNDIG
#   UNABHÄNGIG vom Source-/Projektordner — der Ordner kann nach dem Bau
#   verschoben oder gelöscht werden, ohne die App zu beeinträchtigen.
#   Nutzdaten (Wortlisten, Fall-DB, Audit-Log) landen dafür automatisch in
#   ~/Library/Application Support/<Bundle-ID> statt im Projektordner;
#   bereits vorhandene Daten werden beim ersten Start der App einmalig und
#   additiv dorthin übernommen (Original bleibt unangetastet, siehe
#   src-tauri/src/main.rs → migrate_legacy_data_if_present()).
#
# Aufruf (einmalig, im Projekt-Stammverzeichnis, auf dem Mac):
#     bash packaging/install-forensproto-macos.sh
#
# Optionen:
#     --allow-intel    auch auf Intel-Macs ausführen (ungetestet/nicht optimiert)
#     --skip-ollama    KI-Assistent überspringen (kein Ollama/Modell-Download)
#     --model=<name>   abweichendes Ollama-Modell statt "llama3" laden
#     --browser-only   KEINE native App bauen (kein Rust nötig), stattdessen
#                       nur den alten Browser-Tab-Launcher erzeugen
#                       (ForensProto-Browser.app) — für den Fall, dass du
#                       keine Rust-Toolchain installieren willst
#
# Das Skript ist idempotent: mehrfaches Ausführen überspringt bereits
# installierte Komponenten und aktualisiert nur, was fehlt.
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# Optionen
# ---------------------------------------------------------------------------
ALLOW_NON_ARM64=false
SKIP_OLLAMA=false
MODEL="llama3"
BROWSER_ONLY=false
# Rust-Zielarchitektur des Tauri-Builds. Leer = Host-Architektur (nativ).
#   x86_64-apple-darwin      → Intel
#   aarch64-apple-darwin     → Apple Silicon
#   universal-apple-darwin   → Universal (läuft auf beiden)
RUST_TARGET=""
# Minimales macOS-Deployment-Ziel (leer = Standard von Tauri/Compiler).
# Für ältere Intel-Macs sinnvoll auf "10.15" (Catalina) — das ist der
# praktische Boden, weil Node 20+ und aktuelle Homebrew-Pakete darunter
# nicht mehr zuverlässig laufen.
MIN_MACOS=""

usage() {
  cat <<USAGE
Verwendung: bash packaging/install-forensproto-macos.sh [Optionen]

Standardverhalten: baut die ECHTE native App (Tauri) — ./ForensProto.app,
eigenes Fenster, kein Browser, kein sichtbarer Dev-Server, für die
Architektur des Rechners, auf dem gebaut wird.

Optionen:
  --intel           Für Intel-Macs bauen (x86_64-apple-darwin)
  --universal       Universal-Build (Intel + Apple Silicon in einer App)
  --arch=NAME       Zielarchitektur: intel | universal | arm | native
  --min-macos=VER   Minimales macOS (z. B. 10.15 für ältere Intel-Macs);
                     Default bei --intel/--universal: 10.15
  --allow-intel     Installation/Build auch auf Intel-Macs erlauben
  --skip-ollama     KI-Assistent-Setup (Ollama + Modell) überspringen
  --model=NAME      abweichendes Ollama-Modell statt "llama3" laden
  --browser-only    KEINE native App bauen (kein Rust nötig) — stattdessen
                     nur ForensProto-Browser.app (Browser-Tab-Launcher)
  -h, --help        diese Hilfe anzeigen

Hinweis: Ein Intel-/Universal-Build von einem Apple-Silicon-Mac aus
cross-kompiliert den nativen (Rust-)Teil korrekt. Der mitgebündelte
Node-Server ist architekturneutral bis auf evtl. native node_modules —
für maximale Sicherheit einen Intel-Build direkt auf einem Intel-Mac
erzeugen (siehe BUILD_MACOS_APP_DE.md).
USAGE
}

set_arch() {
  case "$1" in
    intel|x86_64|x86_64-apple-darwin) RUST_TARGET="x86_64-apple-darwin" ;;
    universal|universal-apple-darwin) RUST_TARGET="universal-apple-darwin" ;;
    arm|arm64|aarch64|aarch64-apple-darwin) RUST_TARGET="aarch64-apple-darwin" ;;
    native|host|"") RUST_TARGET="" ;;
    *) echo "Unbekannte Architektur: $1 (erlaubt: intel|universal|arm|native)"; exit 1 ;;
  esac
}

for arg in "$@"; do
  case "$arg" in
    --intel) set_arch intel ;;
    --universal) set_arch universal ;;
    --arch=*) set_arch "${arg#*=}" ;;
    --min-macos=*) MIN_MACOS="${arg#*=}" ;;
    --allow-intel) ALLOW_NON_ARM64=true ;;
    --skip-ollama) SKIP_OLLAMA=true ;;
    --model=*) MODEL="${arg#*=}" ;;
    --browser-only) BROWSER_ONLY=true ;;
    --native) : ;; # veraltet: native ist jetzt Standard, Option ignoriert
    -h|--help) usage; exit 0 ;;
    *) echo "Unbekannte Option: $arg"; usage; exit 1 ;;
  esac
done

# Wer explizit Intel/Universal baut, will das auch auf einem Intel-Host tun
# können — die arm64-Plattformprüfung darf dann nicht hart blocken.
if [ "$RUST_TARGET" = "x86_64-apple-darwin" ] || [ "$RUST_TARGET" = "universal-apple-darwin" ]; then
  ALLOW_NON_ARM64=true
  # Für Intel-/Universal-Ziele ohne explizite Angabe: ältere Intel-Macs
  # unterstützen → Deployment-Ziel auf Catalina.
  [ -z "$MIN_MACOS" ] && MIN_MACOS="10.15"
fi

log()  { printf "\n\033[1;36m→ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[1;32m✓ %s\033[0m\n" "$1"; }
warn() { printf "  \033[1;33m⚠ %s\033[0m\n" "$1"; }
die()  { printf "  \033[1;31m✗ %s\033[0m\n" "$1"; exit 1; }

# ---------------------------------------------------------------------------
# 1) Plattform-Vorabprüfung
# ---------------------------------------------------------------------------
log "Prüfe Plattform"
[[ "$(uname -s)" == "Darwin" ]] || die "Dieses Skript läuft nur auf macOS. Auf dem Mac ausführen, nicht in einer Linux-/CI-Umgebung."
ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]] && ! $ALLOW_NON_ARM64; then
  die "Kein Apple Silicon (arm64) erkannt (gefunden: $ARCH). Dieses Skript ist für M-Chip-Macs gedacht. Mit --allow-intel erzwingen."
fi
ok "Plattform OK ($ARCH)"

# ---------------------------------------------------------------------------
# 2) Kern-Abhängigkeiten über bootstrap.sh (einzige Quelle der Wahrheit —
#    dieselbe Logik nutzt auch die native App beim ersten Start automatisch)
# ---------------------------------------------------------------------------
log "Installiere Kern-Abhängigkeiten (Homebrew, Node, Hashcat, Python, Ollama)"
BOOTSTRAP_ARGS=("--model=$MODEL")
$SKIP_OLLAMA && BOOTSTRAP_ARGS+=("--skip-ollama")
bash "$PROJECT_DIR/packaging/bootstrap.sh" "${BOOTSTRAP_ARGS[@]}"

if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
NODE_VER="$(node -v 2>/dev/null || echo "nicht gefunden")"
HASHCAT_OK=$(command -v hashcat >/dev/null && echo yes || echo no)
OLLAMA_STATE="übersprungen"
if ! $SKIP_OLLAMA; then
  if curl -s -o /dev/null http://127.0.0.1:11434 2>/dev/null; then
    OLLAMA_STATE="läuft"
  else
    OLLAMA_STATE="nicht erreichbar"
  fi
fi

# ---------------------------------------------------------------------------
# 3) ForensProto: Abhängigkeiten + Produktionsbuild
# ---------------------------------------------------------------------------
cd "$PROJECT_DIR"
log "npm install"
npm install
log "npm run build"
npm run build
ok "Produktionsbuild erstellt"

# ---------------------------------------------------------------------------
# 4) .env.local mit sinnvollen Defaults anlegen (falls noch nicht vorhanden)
# ---------------------------------------------------------------------------
if [ ! -f .env.local ]; then
  log "Lege .env.local mit Standardwerten an"
  cat > .env.local <<'ENV'
# ForensProto – lokale Konfiguration (siehe README.md für alle Optionen)
#
# Auth/RBAC ist standardmäßig deaktiviert (Research-Preview-Modus). Für
# Mehrbenutzer-/Netzwerkbetrieb aktivieren:
# FORENSPROTO_AUTH=enabled
# FORENSPROTO_ADMIN_USER=admin
# FORENSPROTO_ADMIN_PASSWORD=einSicheresPasswort

# Recovery-Tuning
# FORENSPROTO_MAX_CONCURRENT=1
# FORENSPROTO_JOB_RETENTION_DAYS=0

# Speicher-Backend (sqlite = Standard, json = erzwungener Fallback)
# FORENSPROTO_DB=sqlite

# Datenordner (Wortlisten, Regeln, Fall-DB, Audit-Log, Evidence-Blobs).
# Standard: derselbe Ordner wie die App. Override z. B. für einen Ordner
# außerhalb des Projektverzeichnisses (Änderung erfordert App-Neustart):
# FORENSPROTO_DATA_DIR=/Users/DEIN_NAME/Library/Application Support/ForensProto
ENV
  ok ".env.local angelegt"
else
  ok ".env.local existiert bereits — unverändert gelassen"
fi

# ---------------------------------------------------------------------------
# 5) App bauen: standardmäßig NATIV (Tauri). Nur mit --browser-only wird
#    stattdessen der alte Browser-Tab-Launcher gebaut.
# ---------------------------------------------------------------------------
APP_KIND=""
APP_PATH=""
DMG_PATH=""

build_browser_launcher() {
  log "Baue ForensProto-Browser.app (Browser-Tab-Launcher, Fallback)"
  bash "$PROJECT_DIR/packaging/build-macos-app.sh"
  APP_KIND="browser"
  APP_PATH="$PROJECT_DIR/ForensProto-Browser.app"
}

if $BROWSER_ONLY; then
  build_browser_launcher
else
  log "Baue native App (Tauri): prüfe Rust-Toolchain"
  if ! command -v cargo &>/dev/null; then
    log "Installiere Rust (rustup, nicht-interaktiv)…"
    if curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable; then
      # shellcheck disable=SC1090
      source "$HOME/.cargo/env"
    fi
  fi

  if command -v cargo &>/dev/null; then
    ok "Rust: $(rustc --version)"

    # Zielarchitektur vorbereiten: bei Cross-Build die passenden rustup-Targets
    # nachinstallieren. Universal braucht BEIDE Einzeltargets.
    TAURI_TARGET_ARGS=()
    TARGET_SUBDIR="release"
    if [ -n "$RUST_TARGET" ]; then
      log "Zielarchitektur: $RUST_TARGET — installiere rustup-Target(s)"
      if [ "$RUST_TARGET" = "universal-apple-darwin" ]; then
        rustup target add x86_64-apple-darwin aarch64-apple-darwin || warn "rustup target add teilweise fehlgeschlagen"
      else
        rustup target add "$RUST_TARGET" || warn "rustup target add $RUST_TARGET fehlgeschlagen"
      fi
      TAURI_TARGET_ARGS=(--target "$RUST_TARGET")
      TARGET_SUBDIR="$RUST_TARGET/release"
      ok "Baue für $RUST_TARGET"
    fi

    # Minimales macOS-Deployment-Ziel setzen (Compiler + Info.plist). Der
    # Compiler-Wert (MACOSX_DEPLOYMENT_TARGET) entscheidet, ab welcher
    # OS-Version der Binary läuft; die plist-Angabe muss dazu passen, damit
    # ältere Systeme die App nicht schon beim Öffnen ablehnen.
    if [ -n "$MIN_MACOS" ]; then
      export MACOSX_DEPLOYMENT_TARGET="$MIN_MACOS"
      perl -0pi -e "s/(\"minimumSystemVersion\"\\s*:\\s*\")[^\"]*(\")/\${1}$MIN_MACOS\${2}/" \
        "$PROJECT_DIR/src-tauri/tauri.conf.json" 2>/dev/null \
        || warn "Konnte minimumSystemVersion in tauri.conf.json nicht anpassen — bitte manuell auf $MIN_MACOS setzen."
      ok "Minimales macOS: >= $MIN_MACOS (Compiler + Info.plist)"
    fi

    log "npm run tauri build ${TAURI_TARGET_ARGS[*]}"
    # Bewusst OHNE 'set -e'-Abbruch bei Fehlschlag: `tauri build` bündelt
    # nacheinander .app UND .dmg. Schlägt NUR die DMG-Erstellung fehl (z.B.
    # bundle_dmg.sh scheitert an einem hängengebliebenen alten Volume unter
    # /Volumes oder fehlender Automation-Berechtigung für Finder/osascript),
    # ist die .app selbst zu diesem Zeitpunkt bereits vollständig und
    # funktionsfähig gebaut — sie darf dann NICHT verworfen werden. Deshalb
    # wird unten die .app unabhängig vom Gesamt-Exit-Code direkt am
    # Dateisystem geprüft, statt sich auf den kombinierten Rückgabewert von
    # `tauri build` zu verlassen.
    npm run tauri build -- "${TAURI_TARGET_ARGS[@]}" > "$PROJECT_DIR/.forensproto/tauri-build.log" 2>&1 || true
    tail -n 40 "$PROJECT_DIR/.forensproto/tauri-build.log"

    # Bundle-Pfad hängt von der Zielarchitektur ab (target/<triple>/release/…).
    BUNDLE_APP="$PROJECT_DIR/src-tauri/target/$TARGET_SUBDIR/bundle/macos/ForensProto.app"
    if [ -x "$BUNDLE_APP/Contents/MacOS/forensproto" ]; then
      # Einzige, eindeutige App im Projekt-Stammverzeichnis bereitstellen —
      # kein zweites, gleichnamiges Browser-Launcher-.app daneben, um genau
      # die Verwechslung zu vermeiden, die vorher aufgetreten ist.
      rm -rf "$PROJECT_DIR/ForensProto.app" "$PROJECT_DIR/ForensProto-Browser.app"
      cp -R "$BUNDLE_APP" "$PROJECT_DIR/ForensProto.app"
      APP_KIND="native"
      APP_PATH="$PROJECT_DIR/ForensProto.app"
      ok "Native App gebaut: $APP_PATH${RUST_TARGET:+ ($RUST_TARGET)}"
      DMG_DIR="$PROJECT_DIR/src-tauri/target/$TARGET_SUBDIR/bundle/dmg"
      DMG_FILE=""
      [ -d "$DMG_DIR" ] && DMG_FILE="$(find "$DMG_DIR" -maxdepth 1 -name '*.dmg' | head -1)"
      if [ -n "$DMG_FILE" ]; then
        cp "$DMG_FILE" "$PROJECT_DIR/ForensProto.dmg"
        DMG_PATH="$PROJECT_DIR/ForensProto.dmg"
        ok "DMG erstellt: $DMG_PATH"
      else
        warn "DMG-Erstellung fehlgeschlagen (Log: .forensproto/tauri-build.log) — die .app selbst ist aber vollständig und startklar. Kein DMG zum Verteilen, App funktioniert trotzdem per Doppelklick."
      fi
    else
      warn "Nativer Build fehlgeschlagen — .app wurde nicht erzeugt (Log: .forensproto/tauri-build.log). Weiche auf Browser-Tab-Launcher aus."
      build_browser_launcher
    fi
  else
    warn "Rust-Installation fehlgeschlagen — weiche auf Browser-Tab-Launcher aus (kein echtes Fenster, siehe Empfehlung unten)."
    build_browser_launcher
  fi
fi

# ---------------------------------------------------------------------------
# Zusammenfassung
# ---------------------------------------------------------------------------
echo ""
echo "=================================================================="
echo " ForensProto ist einsatzbereit."
echo "------------------------------------------------------------------"
if [ "$APP_KIND" = "native" ]; then
  echo "  App (nativ, eigenes Fenster):  $APP_PATH"
  [ -n "$DMG_PATH" ] && echo "  DMG (zum Verteilen/Installieren): $DMG_PATH"
  echo "  Diese App ist source-unabhängig: der Server ist mit eingebaut."
  echo "  Nutzdaten wandern beim ersten Start automatisch nach"
  echo "  ~/Library/Application Support/<Bundle-ID> (bestehende Daten aus"
  echo "  diesem Ordner werden einmalig kopiert, nicht verschoben)."
else
  echo "  App (Browser-Tab-Launcher):    $APP_PATH"
  echo "  Hinweis: Das ist NICHT die native Fenster-App. Für die echte native"
  echo "  App: Rust installieren (https://rustup.rs) und erneut ohne"
  echo "  --browser-only ausführen, oder Fehler aus .forensproto/tauri-build.log prüfen."
fi
echo "  Node:         $NODE_VER"
echo "  Hashcat:      $([ "$HASHCAT_OK" = yes ] && echo installiert || echo 'FEHLT – bitte prüfen')"
echo "  Ollama:       $OLLAMA_STATE $($SKIP_OLLAMA || echo "(Modell: $MODEL)")"
echo "  Setup-Status: .forensproto/setup-state.json"
echo "=================================================================="
echo ""
echo "Nächster Schritt: App per Doppelklick öffnen."
echo "(Unsigniert → beim ersten Start ggf. Rechtsklick → Öffnen wählen.)"
echo "Optional nach /Applications verschieben."
