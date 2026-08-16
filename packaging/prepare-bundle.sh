#!/usr/bin/env bash
#
# prepare-bundle.sh — Bündelt den Next.js-Standalone-Server als Tauri-Resource
# ==============================================================================
# Macht die native App vollständig unabhängig vom Source-/Projektordner:
# Statt bei jedem Start `npm run start` im Projektordner auszuführen, trägt
# die .app-Datei ihren eigenen, fertig kompilierten Server bei sich.
#
# Voraussetzung: `npm run build` wurde bereits ausgeführt — next.config.ts
# hat `output: "standalone"` gesetzt, wodurch zusätzlich zum normalen
# `.next`-Ordner ein Ordner `.next/standalone/` entsteht.
#
# WICHTIG — Allowlist statt Blindkopie:
# In der Praxis wurde beobachtet, dass `.next/standalone/` (vermutlich durch
# zu breites Output-File-Tracing, z.B. Turbopack in Next.js 16) weit mehr
# enthalten kann als nur den Server — bis hin zum kompletten Projektordner
# inkl. NUTZDATEN (wordlists/, .forensproto/ — Fall-Datenbank, Audit-Log,
# Evidence-Blobs!). Ein blindes `cp -R .next/standalone/. dest/` würde das
# 1:1 in die redistributable App/DMG übernehmen — ein echtes
# Datenschutzproblem, kein kosmetischer Bug. Deshalb wird hier explizit nur
# eine Allowlist bekannter, tatsächlich benötigter Einträge kopiert, und am
# Ende zusätzlich eine Sicherheitsprüfung durchgeführt, die bekannte
# Nutzdaten-Ordner aus dem Bundle entfernt, falls sie doch durchgerutscht
# sein sollten.
#
# Ergebnis: src-tauri/resources/app/ enthält
#   server.js       — Next-Standalone-Entrypoint (node server.js)
#   node_modules/    — pruned, nur was server.js wirklich braucht
#   package.json     — von Next automatisch mitkopiert
#   .next/           — Next-interne Server-Manifeste (aus .next/standalone/.next)
#   .next/static/    — statische Assets (von Next NICHT automatisch in
#                      standalone enthalten, offizieller Extra-Schritt lt.
#                      Next.js-Doku, hier separat aus dem normalen .next/ kopiert)
#   public/          — Bilder etc.
#   scripts/         — Python-Hilfsskripte (bitcoin2john.py, dump_wallet.py,
#                      extract_wallet_data.py) — von der App über
#                      process.cwd()+"scripts" referenziert, siehe
#                      src/app/api/analyze/route.ts und forensics/extract.
#   bootstrap.sh     — Kopie von packaging/bootstrap.sh, damit die
#                      Ersteinrichtung (Homebrew/Hashcat/Ollama) auch ohne
#                      Source-Ordner funktioniert (siehe src-tauri/src/main.rs).
#
# Aufruf: bash packaging/prepare-bundle.sh
# (wird von install-forensproto-macos.sh automatisch nach `npm run build`
# und vor `npm run tauri build` aufgerufen)
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_DIR="$PROJECT_DIR/.next/standalone"
DEST="$PROJECT_DIR/src-tauri/resources/app"

log()  { printf "\n\033[1;36m→ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[1;32m✓ %s\033[0m\n" "$1"; }
warn() { printf "  \033[1;33m⚠ %s\033[0m\n" "$1"; }
die()  { printf "  \033[1;31m✗ %s\033[0m\n" "$1"; exit 1; }

[ -d "$STANDALONE_DIR" ] || die "Kein .next/standalone gefunden. Vorher 'npm run build' ausführen (next.config.ts muss output: \"standalone\" gesetzt haben — sollte bereits der Fall sein)."

log "Räume alten Bundle-Inhalt weg"
rm -rf "$DEST"
mkdir -p "$DEST"
ok "$DEST vorbereitet"

log "Kopiere Standalone-Server (Allowlist: server.js, package.json, .next, node_modules)"
for item in server.js package.json .next node_modules; do
  if [ -e "$STANDALONE_DIR/$item" ]; then
    cp -R "$STANDALONE_DIR/$item" "$DEST/$item"
  else
    warn "'$item' fehlt in .next/standalone — übersprungen (kann je nach Next-Version normal sein, außer bei server.js)."
  fi
done
[ -f "$DEST/server.js" ] || die "server.js fehlt nach dem Kopieren — .next/standalone unerwartet leer/unvollständig."
ok "Standalone-Server kopiert (nur Allowlist-Einträge, kein Blindkopieren)"

log "Kopiere statische Assets (.next/static)"
mkdir -p "$DEST/.next/static"
cp -R "$PROJECT_DIR/.next/static/." "$DEST/.next/static/"
ok "Static Assets kopiert"

if [ -d "$PROJECT_DIR/public" ]; then
  log "Kopiere public/"
  rm -rf "$DEST/public"
  cp -R "$PROJECT_DIR/public" "$DEST/public"
  ok "public/ kopiert"
fi

if [ -d "$PROJECT_DIR/scripts" ]; then
  log "Kopiere scripts/ (Python-Hilfsskripte)"
  rm -rf "$DEST/scripts"
  cp -R "$PROJECT_DIR/scripts" "$DEST/scripts"
  ok "scripts/ kopiert"
fi

log "Kopiere bootstrap.sh (Ersteinrichtung ohne Source-Ordner)"
cp "$PROJECT_DIR/packaging/bootstrap.sh" "$DEST/bootstrap.sh"
chmod +x "$DEST/bootstrap.sh"
ok "bootstrap.sh kopiert"

# ---------------------------------------------------------------------------
# Sicherheitsnetz: bekannte Nutzdaten-/Repo-Ordner dürfen NIEMALS im
# redistributable Bundle landen. Auch wenn die Allowlist oben das im
# Normalfall bereits verhindert, hier zusätzlich explizit prüfen und im
# Zweifel entfernen — lieber einmal zu viel geprüft, bei forensischen
# Falldaten gibt es hier keinen Spielraum.
# ---------------------------------------------------------------------------
log "Sicherheitsprüfung: keine Nutzdaten/Repo-Interna im Bundle"
FORBIDDEN=(".forensproto" "wordlists" "rules" "uploads" ".git" "src-tauri" "ForensProto.app" "ForensProto.dmg")
FOUND_ANY=false
for name in "${FORBIDDEN[@]}"; do
  if [ -e "$DEST/$name" ]; then
    warn "Unerwartet im Bundle gefunden und entfernt: $name"
    rm -rf "${DEST:?}/$name"
    FOUND_ANY=true
  fi
done
if $FOUND_ANY; then
  warn "Es wurden Nutzdaten/Repo-Interna im .next/standalone-Output gefunden und entfernt."
  warn "Falls du bereits eine ForensProto.app/.dmg aus einem VORHERIGEN Build weitergegeben hast: bitte nicht mehr verteilen, neu bauen und ersetzen."
else
  ok "Keine unerwarteten Nutzdaten im Bundle."
fi

SIZE="$(du -sh "$DEST" 2>/dev/null | cut -f1)"
echo ""
echo "✓ Bundle bereit: $DEST ($SIZE)"
echo "  Wird über src-tauri/tauri.conf.json (bundle.resources) automatisch"
echo "  in die .app eingebettet, sobald 'npm run tauri build' läuft."
