#!/usr/bin/env bash
#
# build-macos-app.sh — erzeugt ForensProto-Browser.app (Fallback-Launcher)
# ==========================================================================
# ACHTUNG: Das ist NICHT die native Fenster-App. Dieses Skript baut nur
# einen dünnen Launcher, der den lokalen Produktionsserver hochfährt und
# das Standard-Browser-Fenster auf localhost öffnet — kein eigenes
# App-Fenster, kein eigenständiger Prozess ohne Browser.
#
# Für die echte native App (eigenes Fenster, als .app/.dmg installierbar,
# kein Browser-Tab) siehe stattdessen:
#     bash packaging/install-forensproto-macos.sh
# (baut standardmäßig über Tauri/src-tauri/ die native App).
#
# Dieses Skript hier ist nur der Fallback für --browser-only oder wenn der
# native Build fehlschlägt.
#
# Aufruf (einmalig, im Projekt-Stammverzeichnis):
#     bash packaging/build-macos-app.sh
#
# Ergebnis:  ./ForensProto-Browser.app   (per Doppelklick startbar; nach
#            /Applications verschiebbar)
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$PROJECT_DIR/ForensProto-Browser.app"
echo "→ Projekt: $PROJECT_DIR"

# 1) Abhängigkeiten + Produktionsbuild sicherstellen
cd "$PROJECT_DIR"
if [ ! -d node_modules ]; then echo "→ npm install"; npm install; fi
if [ ! -d .next ]; then echo "→ npm run build"; npm run build; fi

# 2) App-Bundle-Struktur anlegen
echo "→ Erstelle Bundle $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# 3) Info.plist
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>ForensProto (Browser)</string>
  <key>CFBundleDisplayName</key><string>ForensProto (Browser)</string>
  <key>CFBundleIdentifier</key><string>com.forensproto.app.browser</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>ForensProto</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><false/>
</dict>
</plist>
PLIST

# 4) Launcher-Executable (Projektpfad fest eingebacken)
cat > "$APP/Contents/MacOS/ForensProto" <<LAUNCHER
#!/usr/bin/env bash
# ForensProto-Launcher
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"
PROJECT_DIR="$PROJECT_DIR"
# Dedizierter Port (nicht 3000!), damit parallel andere lokale Projekte auf
# localhost:3000 laufen können, ohne mit ForensProto zu kollidieren —
# derselbe Port wie bei der nativen Tauri-App (src-tauri/src/main.rs).
export PORT=38217
URL="http://localhost:\$PORT"
HEALTH_URL="\$URL/api/health"
LOG="\$PROJECT_DIR/.forensproto/server.log"
mkdir -p "\$PROJECT_DIR/.forensproto"

# Prüft nicht nur "antwortet irgendwas", sondern ob es wirklich ForensProto
# ist (Marker "app":"forensproto" in /api/health, siehe src/lib/monitoring.ts).
is_forensproto_up() {
  curl -s --max-time 2 "\$HEALTH_URL" 2>/dev/null | grep -q '"app":"forensproto"'
}

# --- Abhängigkeits-Selbstcheck (nicht blockierend) --------------------
# Fehlt eine Kernabhängigkeit, startet die App trotzdem (viele Funktionen
# brauchen weder Hashcat noch Ollama), aber der Nutzer wird per nativem
# Dialog auf den Installer hingewiesen statt eine stille Fehlfunktion zu
# erleben.
MISSING_LIST=""
command -v hashcat >/dev/null 2>&1 || MISSING_LIST="Hashcat (Recovery-Engine)"
if ! curl -s -o /dev/null http://127.0.0.1:11434 2>/dev/null; then
  if [ -n "\$MISSING_LIST" ]; then
    MISSING_LIST="\$MISSING_LIST, Ollama (KI-Assistent)"
  else
    MISSING_LIST="Ollama (KI-Assistent)"
  fi
fi
if [ -n "\$MISSING_LIST" ]; then
  echo "[ForensProto] Fehlende Abhängigkeiten: \$MISSING_LIST" >> "\$LOG"
  ALERT_MSG="Fehlende Komponenten: \$MISSING_LIST. Bitte einmalig ausführen: bash packaging/install-forensproto-macos.sh — die App startet trotzdem, betroffene Funktionen bleiben bis dahin eingeschränkt."
  osascript -e "display alert \"ForensProto – fehlende Abhängigkeiten\" message \"\$ALERT_MSG\" as warning" >/dev/null 2>&1 &
fi

# Läuft der Server schon (wirklich ForensProto, nicht nur irgendein Dienst
# auf diesem Port)?
if ! is_forensproto_up; then
  cd "\$PROJECT_DIR" || exit 1
  [ -d .next ] || npm run build >> "\$LOG" 2>&1
  nohup npm run start >> "\$LOG" 2>&1 &
  # auf Server warten (max. 40s)
  for i in \$(seq 1 40); do
    sleep 1
    is_forensproto_up && break
  done
fi
open "\$URL"
LAUNCHER

chmod +x "$APP/Contents/MacOS/ForensProto"

echo "✓ Fertig: $APP"
echo "  Doppelklick startet den Server (Log: .forensproto/server.log) und öffnet http://localhost:38217 im Browser."
echo "  Hinweis: Das ist der Browser-Tab-Fallback, keine native Fenster-App."
echo "  Port 38217 ist dediziert für ForensProto — localhost:3000 bleibt für andere Projekte frei."
echo "  Optional nach /Applications verschieben:  mv \"$APP\" /Applications/"
