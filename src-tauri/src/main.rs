// ForensProto – natives Fenster (Tauri) mit unsichtbarem First-Run-Setup
// =======================================================================
// ForensProto ist eine Next.js-Server-App (Hashcat-Prozesse, node:sqlite,
// Dateizugriffe) und lässt sich daher nicht als reine statische SPA
// bündeln. Dieser native Wrapper:
//
//   1. zeigt sofort ein schlankes Splash-Fenster,
//   2. führt beim ersten Start (Marker fehlt) das Bootstrap-Skript aus,
//      das fehlende Laufzeit-Abhängigkeiten (Node, Hashcat, Python,
//      Ollama + Modell) im Hintergrund installiert,
//   3. startet den lokalen Produktionsserver,
//   4. wartet, bis er auf dem Port antwortet,
//   5. blendet das echte Anwendungsfenster (WKWebView → localhost) ein und
//      schließt das Splash-Fenster.
//
// Läuft auf dem dedizierten Port (siehe PORT unten) bereits ein echter
// ForensProto-Server (z.B. weil parallel `PORT=38217 npm run dev` offen
// ist), wird kein zweiter Serverprozess gestartet und beim Schließen auch
// nicht terminiert (nur selbst gestartete Prozesse).
//
// ZWEI BETRIEBSMODI (source-unabhängig vs. Entwicklung)
// ------------------------------------------------------
// Damit die fertig gebaute/verteilte App nicht mehr auf den Source-/
// Projektordner angewiesen ist, bringt sie ihren Server als Next.js-
// "standalone"-Build mit (siehe packaging/prepare-bundle.sh,
// src-tauri/tauri.conf.json → bundle.resources). Zur Laufzeit wird
// geprüft, ob dieser gebündelte Server existiert:
//
//   • BUNDLED (Regelfall für die gebaute .app):
//       - Server: `node server.js` aus dem Ressourcenordner der App
//         (Tauri resource_dir()), NICHT aus PROJECT_DIR.
//       - Datenordner (Wortlisten, Fall-DB, Audit-Log, …): der
//         empfohlene macOS-App-Datenordner (~/Library/Application
//         Support/<Bundle-ID>), NICHT der (evtl. gar nicht mehr
//         vorhandene) Source-Ordner. Wird explizit per
//         FORENSPROTO_DATA_DIR an Server + Bootstrap-Skript
//         durchgereicht (siehe src/lib/data-dir.ts).
//       - Bootstrap-Skript: die mitgebündelte Kopie
//         (resources/app/bootstrap.sh), nicht packaging/bootstrap.sh
//         aus dem Source-Ordner.
//   • DEV (z.B. `cargo tauri dev` direkt aus dem Repo heraus, oder eine
//     alte, ohne Bundle gebaute .app): fällt auf das bisherige Verhalten
//     zurück — `npm run start` in PROJECT_DIR, Datenordner = PROJECT_DIR
//     (unverändert gegenüber dem Stand vor diesem Umbau).
//
// Restrisiko: Dieser Rust-Code wurde in einer Linux-Sandbox ohne
// Cargo/Rustc geschrieben und konnte dort nicht kompiliert werden (siehe
// BUILD_MACOS_APP_DE.md). Insbesondere die genaue Pfadstruktur, unter der
// Tauri deklarierte `bundle.resources`-Ordner im fertigen .app ablegt,
// war nicht gegen einen echten Build verifizierbar — deshalb prüft
// `resolve_bundle_dir()` mehrere plausible Kandidatenpfade, statt sich
// auf einen einzigen ungetesteten Pfad zu verlassen.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, WindowEvent};

/// Projektverzeichnis, zur Compile-Zeit von build.rs eingebettet
/// (Elternordner von src-tauri/, siehe dortige build.rs). Nur noch für
/// den DEV-Fallback relevant (siehe Moduskommentar oben) — die gebündelte
/// App braucht diesen Pfad zur Laufzeit nicht mehr.
const PROJECT_DIR: &str = env!("FORENSPROTO_PROJECT_DIR");

/// Frühere Bundle-ID (bis einschließlich Build ohne diesen Fix). Endete auf
/// ".app" — Tauri warnt davor ausdrücklich ("ends with .app, not
/// recommended"), weil macOS/Finder Ordner mit dieser Endung fälschlich als
/// Programmpaket behandelt (kein normales Reinnavigieren per Doppelklick).
/// Der daraus abgeleitete App-Datenordner
/// (~/Library/Application Support/com.forensproto.app) kann bei
/// Bestandsinstallationen bereits echte Falldaten enthalten. Nur zum
/// einmaligen, additiven Nachziehen dieser Altdaten in den neuen,
/// korrekt benannten Datenordner verwendet — siehe
/// `migrate_legacy_data_if_present()`.
const OLD_BUNDLE_IDENTIFIER: &str = "com.forensproto.app";
/// Bewusst NICHT 3000 (der Next.js-Standardport): 3000 ist der mit Abstand
/// häufigste lokale Dev-Server-Port. Liefe ForensProto dort, könnte der
/// Nutzer währenddessen kein anderes Projekt parallel auf 3000 betreiben,
/// ohne dass sich beide in die Quere kommen (ForensProto hielte den Port
/// besetzt, oder umgekehrt würde ForensProto beim Start fälschlich
/// annehmen, ein fremder Dienst auf 3000 sei bereits die eigene Instanz).
/// Ein dedizierter, unüblicher Port löst das vollständig: Port 3000 bleibt
/// für alles andere frei.
const PORT: u16 = 38217;
/// Großzügiges Timeout: der allererste Start kann Modell-Download (~4,7 GB)
/// und npm-Build umfassen. Nach Ablauf wird das Fenster trotzdem gezeigt,
/// damit die App nie „hängend" wirkt.
const STARTUP_TIMEOUT_SECS: u64 = 1800; // 30 Minuten Obergrenze
const SERVER_WAIT_AFTER_BOOTSTRAP_SECS: u64 = 120;

/// Hält den von uns gestarteten Serverprozess, damit er beim Beenden der
/// App sauber terminiert werden kann.
struct ServerProcess(Mutex<Option<Child>>);

/// Prüft nicht nur, ob *irgendein* Dienst auf PORT antwortet (ein reiner
/// TCP-Connect würde auch bei einem völlig fremden, zufällig denselben
/// Port belegenden Prozess anschlagen), sondern ob es wirklich unser
/// eigener ForensProto-Server ist: ruft `/api/health` auf und sucht im
/// Antwort-Body nach dem Erkennungsmarker `"app":"forensproto"`
/// (siehe src/lib/monitoring.ts). Bewusst ohne HTTP-Client-Abhängigkeit
/// (kein reqwest) implementiert — nur std::net, um keine neue
/// Cargo-Abhängigkeit einzuführen.
///
/// Hinweis: das erkennt nicht, ob ein bereits laufender Server einen
/// VERALTETEN Build bedient (z.B. nach `npm run build` ohne vorherigen
/// Neustart) — nur, dass es überhaupt unser Server ist. Bei Unklarheiten
/// hilft `lsof -ti:38217` gefolgt von `kill -9`, siehe README.
fn check_health(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));

    let request =
        format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    // Mehrere kurze Reads statt read_to_end/read_to_string: manche
    // Next.js-Antworten halten die Verbindung trotz "Connection: close"
    // offen (Keep-Alive-Verhalten des Servers), ein Warten auf EOF würde
    // dann unnötig bis zum Timeout blockieren. Ein einzelner Chunk reicht
    // für die kleine JSON-Antwort von /api/health in aller Regel ohnehin.
    let mut buf = [0u8; 4096];
    let mut received = Vec::new();
    for _ in 0..5 {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                received.extend_from_slice(&buf[..n]);
                if String::from_utf8_lossy(&received).contains("\"app\":\"forensproto\"") {
                    return true;
                }
            }
            Err(_) => break,
        }
    }
    false
}

/// PATH inklusive Homebrew-Pfaden (Apple Silicon: /opt/homebrew/bin), damit
/// node/npm/hashcat/ollama auch beim Finder-Start gefunden werden (Finder-
/// Prozesse erben nicht die Shell-PATH-Konfiguration).
fn path_with_homebrew() -> String {
    let existing = std::env::var("PATH").unwrap_or_default();
    format!("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{existing}")
}

/// Sucht den gebündelten Standalone-Server im Ressourcenordner der App
/// (siehe Moduskommentar oben). Gibt `None` zurück, wenn keiner existiert
/// (DEV-Fallback greift dann). Prüft mehrere Kandidatenpfade, weil das
/// exakte Ablageschema von `bundle.resources` in dieser Umgebung nicht
/// gegen einen echten Tauri-Build verifiziert werden konnte.
fn resolve_bundle_dir(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    for candidate in ["resources/app", "app", "resources"] {
        let dir = resource_dir.join(candidate);
        if dir.join("server.js").exists() {
            return Some(dir);
        }
    }
    None
}

/// Datenordner (Wortlisten, Fall-DB, Audit-Log, Evidence-Blobs, Regeln,
/// Uploads — siehe src/lib/data-dir.ts) für diesen Start. BUNDLED: der
/// empfohlene macOS-App-Datenordner. DEV: PROJECT_DIR, exakt wie vor
/// diesem Umbau, damit bestehende lokale Entwicklungs-Setups unverändert
/// weiterlaufen.
fn resolve_data_dir(app: &AppHandle, bundled: bool) -> PathBuf {
    if bundled {
        if let Ok(dir) = app.path().app_data_dir() {
            return dir;
        }
        eprintln!("[ForensProto] Konnte app_data_dir() nicht ermitteln — falle auf PROJECT_DIR zurück.");
    }
    PathBuf::from(PROJECT_DIR)
}

fn setup_marker(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join(".forensproto").join("setup-state.json")
}

/// Kopiert additiv (nur fehlende Unterordner, nie überschreiben, nie
/// löschen/verschieben) die bekannten Nutzdaten-Unterordner von `src_dir`
/// nach `data_dir`. Gemeinsame Hilfsfunktion für beide Migrationsquellen
/// (alter Source-Ordner UND alter, falsch benannter App-Datenordner).
fn migrate_known_subdirs(src_dir: &std::path::Path, data_dir: &std::path::Path, quelle: &str) {
    for name in ["wordlists", "rules", ".forensproto"] {
        let src = src_dir.join(name);
        let dst = data_dir.join(name);
        if src.exists() && !dst.exists() {
            eprintln!(
                "[ForensProto] Übernehme bestehende Daten aus {quelle}: {} → {}",
                src.display(),
                dst.display()
            );
            if let Err(e) = copy_dir_recursive(&src, &dst) {
                eprintln!("[ForensProto] Übernahme von '{name}' aus {quelle} fehlgeschlagen: {e}");
            }
        }
    }
}

/// Einmalige, additive Übernahme bestehender Nutzdaten aus zwei möglichen
/// Alt-Standorten in den neuen App-Datenordner — nur im BUNDLED-Modus
/// (siehe Aufrufer). Kopiert (verschiebt/löscht nie), damit die
/// Alt-Standorte in jedem Fall unangetastet bleiben:
///
///   1. PROJECT_DIR/{wordlists,rules,.forensproto} — Source-Ordner-Layout
///      aus der Zeit vor der Source-Unabhängigkeit.
///   2. ~/Library/Application Support/com.forensproto.app — der App-
///      Datenordner unter der FRÜHEREN Bundle-ID (endete auf ".app", was
///      Finder fälschlich als Programmpaket behandelt hat, siehe
///      OLD_BUNDLE_IDENTIFIER). Betrifft Bestandsinstallationen, die
///      bereits vor der Umbenennung der Bundle-ID gelaufen sind.
fn migrate_legacy_data_if_present(app: &AppHandle, data_dir: &std::path::Path) {
    let legacy_dir = PathBuf::from(PROJECT_DIR);
    if legacy_dir.exists() && legacy_dir != data_dir {
        migrate_known_subdirs(&legacy_dir, data_dir, "dem Source-Ordner");
    }

    if let Ok(base) = app.path().data_dir() {
        let old_app_data_dir = base.join(OLD_BUNDLE_IDENTIFIER);
        if old_app_data_dir.exists() && old_app_data_dir != data_dir {
            migrate_known_subdirs(
                &old_app_data_dir,
                data_dir,
                "dem alten App-Datenordner (frühere Bundle-ID)",
            );
        }
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Führt beim ersten Start das Bootstrap-Skript aus (idempotent). Blockiert,
/// bis das Skript fertig ist. Ausgabe landet in `<data_dir>/.forensproto/bootstrap.log`.
/// Schlägt der Aufruf fehl, wird trotzdem fortgefahren — viele Funktionen
/// laufen auch ohne Hashcat/Ollama, und der Nutzer sieht die App statt eines
/// leeren Bildschirms.
fn run_bootstrap_if_needed(bundle_dir: Option<&PathBuf>, data_dir: &std::path::Path) {
    if setup_marker(data_dir).exists() {
        eprintln!("[ForensProto] Setup-Marker vorhanden — überspringe Ersteinrichtung.");
        return;
    }

    // BUNDLED: die mitgebündelte Kopie (kein Source-Ordner-Zugriff nötig).
    // DEV: das Skript direkt aus packaging/ im Repo.
    let script = match bundle_dir {
        Some(dir) => dir.join("bootstrap.sh"),
        None => PathBuf::from(PROJECT_DIR).join("packaging").join("bootstrap.sh"),
    };
    if !script.exists() {
        eprintln!("[ForensProto] bootstrap.sh nicht gefunden ({}), überspringe.", script.display());
        return;
    }

    eprintln!("[ForensProto] Starte Ersteinrichtung (bootstrap.sh)…");
    let status = Command::new("bash")
        .arg(&script)
        .arg("--from-app")
        .current_dir(script.parent().unwrap_or(std::path::Path::new(".")))
        .env("PATH", path_with_homebrew())
        // Dieselbe Variable, die auch der Next.js-Server nutzt (siehe
        // src/lib/data-dir.ts) — Bootstrap-Zustand (setup-state.json,
        // bootstrap.log) landet damit garantiert im selben Datenordner,
        // nie schreibend im (potenziell read-only) App-Bundle selbst.
        .env("FORENSPROTO_DATA_DIR", data_dir.to_string_lossy().to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    match status {
        Ok(s) if s.success() => eprintln!("[ForensProto] Ersteinrichtung abgeschlossen."),
        Ok(s) => eprintln!("[ForensProto] bootstrap.sh endete mit Status {s} — fahre trotzdem fort."),
        Err(e) => eprintln!("[ForensProto] Konnte bootstrap.sh nicht starten: {e}"),
    }
}

/// Öffnet (append) `<data_dir>/.forensproto/server.log` für den kompletten
/// stdout/stderr-Output des Node-Serverprozesses. Vorher landete das komplett
/// im Leeren (`Stdio::null()`) — damit waren z.B. Hashcat-Fehlermeldungen aus
/// hashcat-manager.ts (console.log/console.error) für Nutzer der gebauten
/// App nirgendwo einsehbar, auch nicht per Terminal-Start, weil main.rs den
/// Kind-Prozess-Output selbst verwirft. Schlägt das Öffnen fehl (z.B. Ordner
/// nicht beschreibbar), läuft der Server trotzdem weiter — nur ohne Log.
fn open_server_log(data_dir: &std::path::Path) -> Option<std::fs::File> {
    let log_dir = data_dir.join(".forensproto");
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        eprintln!("[ForensProto] Konnte Log-Ordner für Server-Log nicht anlegen: {e}");
        return None;
    }
    let log_path = log_dir.join("server.log");
    match std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(mut f) => {
            let _ = writeln!(f, "\n[ForensProto] ── Serverstart {} ──", unix_now());
            eprintln!("[ForensProto] Server-Log: {}", log_path.display());
            Some(f)
        }
        Err(e) => {
            eprintln!("[ForensProto] Konnte Server-Log nicht öffnen ({}): {e}", log_path.display());
            None
        }
    }
}

/// Minimaler Zeitstempel ohne zusätzliche Abhängigkeit (keine `chrono`-Crate):
/// Sekunden seit Unix-Epoche reichen für „welcher Start war das" beim
/// Log-Durchsuchen völlig aus.
fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Beendet einen evtl. noch lauschenden Prozess auf `port` (per PID via
/// `lsof`, dann `kill -9`) und wartet kurz, bis der Port wirklich frei ist.
/// Nutzt bewusst die vorhandenen macOS-Bordmittel lsof/kill statt einer
/// neuen Cargo-Abhängigkeit.
///
/// Hintergrund: `pkill -f forensproto` (siehe README/Troubleshooting)
/// erwischt NUR Prozesse, deren Kommandozeile wörtlich "forensproto"
/// enthält — der eigene native Binary-Name. Ein manuell oder aus einem
/// früheren Test gestarteter `next start`/`npm run dev`-Prozess hat diese
/// Zeichenkette für gewöhnlich NICHT im argv und überlebt daher jeden
/// `pkill`. So kann sich unbemerkt eine uralte Serverinstanz auf dem
/// dedizierten Port festsetzen, die dann bei jedem App-Start fälschlich
/// als "läuft schon, alles gut" durchgeht — während in Wahrheit jeder neue
/// Build wirkungslos bleibt, weil nie der frische Server befragt wird.
/// lsof/kill identifizieren stattdessen über den PORT, nicht über den
/// Prozessnamen, und erwischen daher auch solche Karteileichen zuverlässig.
fn kill_stale_process_on_port(port: u16) {
    let Ok(output) = Command::new("lsof").args(["-ti", &format!(":{port}")]).output() else {
        eprintln!("[ForensProto] Konnte lsof nicht ausführen — überspringe Kill-Versuch.");
        return;
    };
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let pids: Vec<&str> = stdout.split_whitespace().collect();
    if pids.is_empty() {
        return;
    }
    for pid in &pids {
        eprintln!("[ForensProto] Beende hängengebliebenen Prozess auf Port {port} (PID {pid}).");
        let _ = Command::new("kill").args(["-9", pid]).status();
    }
    // Kurz warten, bis der Kernel den Port tatsächlich freigibt (nicht
    // zwingend synchron mit dem kill-Aufruf). Auf port_in_use warten, NICHT
    // auf check_health: ein hängengebliebener, „ungesunder" Prozess antwortet
    // ohnehin nicht auf /api/health, würde die Schleife also sofort verlassen,
    // obwohl der Port noch belegt ist.
    for _ in 0..15 {
        if !port_in_use(port) {
            break;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

/// Prüft rein netzwerkseitig, ob überhaupt IRGENDETWAS auf dem Port lauscht —
/// unabhängig davon, ob es ein gesunder ForensProto-Server ist. Genau dieser
/// Fall (Port belegt, aber KEIN gültiger Health-Marker) verursachte den
/// Endlos-Splash: check_health() war false, der Port aber besetzt, sodass der
/// frische `node server.js`-Start an EADDRINUSE scheiterte.
fn port_in_use(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok()
}

/// Startet den Server, falls er nicht schon läuft — BUNDLED: `node
/// server.js` aus dem App-Bundle; DEV: `npm run start` in PROJECT_DIR.
fn spawn_server_if_needed(bundle_dir: Option<&PathBuf>, data_dir: &std::path::Path) -> Option<Child> {
    if bundle_dir.is_some() {
        // BUNDLED: der dedizierte Port gehört exklusiv dieser App. Alles,
        // was dort bereits lauscht — egal ob gesunder Alt-Server ODER ein
        // hängengebliebener, nicht mehr antwortender Prozess — ist eine
        // Karteileiche aus einem früheren Start und wird kompromisslos
        // beendet. Bewusst über port_in_use() (reiner TCP-Connect) statt
        // check_health(): sonst würde genau der Loop-Fall (Port belegt, aber
        // KEIN Health-Marker) übersehen und der frische Start an EADDRINUSE
        // scheitern → Endlos-Splash.
        if port_in_use(PORT) {
            eprintln!(
                "[ForensProto] Prozess auf Port {PORT} erkannt — wird beendet (BUNDLED-Modus reserviert diesen Port exklusiv)."
            );
            kill_stale_process_on_port(PORT);
        }
    } else if check_health(PORT) {
        // DEV: absichtlich tolerant — typischer Workflow ist ein parallel
        // laufendes `PORT=38217 npm run dev` in einem eigenen Terminal.
        eprintln!("[ForensProto] Server läuft bereits auf Port {PORT} — starte keinen zweiten.");
        return None;
    }

    let (mut cmd, launch_mode) = match bundle_dir {
        Some(dir) => {
            eprintln!("[ForensProto] Starte gebündelten Server aus {}", dir.display());
            let mut c = Command::new("node");
            c.arg("server.js").current_dir(dir);
            (c, "bundled")
        }
        None => {
            eprintln!("[ForensProto] Kein gebündelter Server gefunden — Entwicklungsmodus (Source-Ordner {PROJECT_DIR}).");
            let mut c = Command::new("npm");
            c.args(["run", "start"]).current_dir(PROJECT_DIR);
            (c, "dev")
        }
    };

    // stdout UND stderr des Serverprozesses (u.a. console.log/console.error
    // aus hashcat-manager.ts sowie Hashcat's eigene Fehlerausgabe) in
    // dieselbe Log-Datei umleiten, statt sie zu verwerfen — siehe
    // open_server_log(). Zwei geklonte Handles auf dieselbe Datei, damit
    // beide Streams chronologisch in eine gemeinsame Datei interleaven.
    let log_file = open_server_log(data_dir);
    let (stdout_target, stderr_target) = match &log_file {
        Some(f) => {
            let out = f.try_clone().map(Stdio::from).unwrap_or_else(|_| Stdio::null());
            let err = f.try_clone().map(Stdio::from).unwrap_or_else(|_| Stdio::null());
            (out, err)
        }
        None => (Stdio::null(), Stdio::null()),
    };

    match cmd
        .env("PATH", path_with_homebrew())
        // Next.js liest PORT selbst aus; ohne diese Variable würde der
        // Server auf den Default 3000 binden statt auf unseren
        // dedizierten Port — genau das, was den Port-Konflikt mit
        // anderen lokalen Projekten verursachen würde.
        .env("PORT", PORT.to_string())
        .env("FORENSPROTO_DATA_DIR", data_dir.to_string_lossy().to_string())
        // Rein diagnostisch (siehe /api/system/data-dir + Einstellungen →
        // Speicherort in der App): damit sich "läuft ein alter/DEV-Server
        // statt des frisch gebauten BUNDLED-Servers" künftig direkt in der
        // UI erkennen lässt, statt jedes Mal Console.app/Terminal zu
        // bemühen (dieses Muster ist bereits zweimal aufgetreten).
        .env("FORENSPROTO_LAUNCH_MODE", launch_mode)
        .stdout(stdout_target)
        .stderr(stderr_target)
        .spawn()
    {
        Ok(child) => {
            eprintln!("[ForensProto] Serverprozess gestartet (PID {}).", child.id());
            Some(child)
        }
        Err(err) => {
            eprintln!("[ForensProto] Konnte den Server nicht starten: {err}");
            None
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            // Gesamter Startablauf läuft in einem Hintergrund-Thread, damit der
            // Tauri-Event-Loop (und damit das Splash-Fenster) reaktiv bleibt.
            thread::spawn(move || {
                // 0) Modus bestimmen: gebündelter Server vorhanden (Regelfall
                //    für die gebaute App) oder DEV-Fallback auf PROJECT_DIR.
                let bundle_dir = resolve_bundle_dir(&handle);
                let data_dir = resolve_data_dir(&handle, bundle_dir.is_some());
                eprintln!(
                    "[ForensProto] Modus: {} — Datenordner: {}",
                    if bundle_dir.is_some() { "BUNDLED" } else { "DEV (Source-Ordner)" },
                    data_dir.display()
                );

                // 0b) Nur im BUNDLED-Modus relevant: bestehende Daten aus einer
                //     früheren, source-gebundenen Installation einmalig und
                //     additiv übernehmen (Quelle bleibt unangetastet).
                if bundle_dir.is_some() {
                    migrate_legacy_data_if_present(&handle, &data_dir);
                }

                // 1) Ersteinrichtung (nur beim ersten Start, sonst No-op)
                run_bootstrap_if_needed(bundle_dir.as_ref(), &data_dir);

                // 2) Server starten (falls nicht bereits laufend)
                let child = spawn_server_if_needed(bundle_dir.as_ref(), &data_dir);
                if let Some(state) = handle.try_state::<ServerProcess>() {
                    *state.0.lock().unwrap() = child;
                }

                // 3) Auf Server-Bereitschaft warten
                let mut waited = 0u64;
                // Nach einem Bootstrap gibt es zusätzlichen Puffer für den
                // ersten npm-Build/Serverstart.
                let deadline = STARTUP_TIMEOUT_SECS + SERVER_WAIT_AFTER_BOOTSTRAP_SECS;
                eprintln!(
                    "[ForensProto] Warte auf Server-Bereitschaft auf Port {} (Timeout: {}s)...",
                    PORT, deadline
                );
                let mut healthy = false;
                while waited < deadline {
                    if check_health(PORT) {
                        healthy = true;
                        break;
                    }
                    thread::sleep(Duration::from_secs(1));
                    waited += 1;
                }
                if healthy {
                    eprintln!(
                        "[ForensProto] Server antwortet nach {}s auf Port {} — zeige Hauptfenster.",
                        waited, PORT
                    );
                } else {
                    eprintln!(
                        "[ForensProto] WARNUNG: Server hat nach {}s nicht geantwortet (Timeout) — zeige Fenster trotzdem (kann leer/fehlerhaft sein).",
                        deadline
                    );
                }

                // 4) Hauptfenster zeigen, Splash schließen
                //
                // WICHTIG — Reload vor dem Anzeigen:
                // Tauri erzeugt das "main"-Fenster (inkl. WKWebView) bereits beim
                // App-Start gemäß tauri.conf.json (url: http://localhost:38217),
                // nur eben unsichtbar (visible: false). Die WebView versucht also
                // sofort zu laden — zu diesem Zeitpunkt läuft der Server aber
                // noch nicht (Bootstrap/Serverstart kann Sekunden bis Minuten
                // dauern). Der erste Ladeversuch schlägt fehl (Connection
                // Refused) und WKWebView zeigt danach dauerhaft eine leere/weiße
                // Seite — auch wenn der Server Sekunden später online geht, wird
                // NICHT automatisch neu geladen. `.show()` allein schaltet nur
                // die Sichtbarkeit um und behebt das nicht.
                //
                // Fix: unmittelbar bevor wir sichtbar schalten, die WebView
                // explizit auf die Ziel-URL NEUnavigieren — nicht bloß
                // `window.location.reload()`. Grund (in der Praxis als
                // Weißbild-Bug bestätigt): Nach einer FEHLGESCHLAGENEN
                // Erstnavigation (Connection Refused, weil der Server beim
                // Fenster-Erzeugen noch nicht lief bzw. gerade per
                // kill_stale_process_on_port() ersetzt wurde) steht die
                // WKWebView auf einer leeren Seite (about:blank-Kontext).
                // Ein reload() lädt dort nur die LEERE Seite neu — die
                // Ziel-URL wird nie wieder angefragt, das Fenster bleibt
                // dauerhaft weiß, obwohl der Server längst gesund ist.
                // `window.location.replace(<URL>)` funktioniert dagegen auch
                // aus dem leeren Kontext heraus und ist idempotent: War die
                // Seite doch schon korrekt geladen, entspricht es schlicht
                // einem frischen Laden derselben URL (ohne History-Eintrag).
                // Zusätzlich robust gegen den Fall, dass nach der
                // fehlgeschlagenen Erstnavigation gar KEIN Web-Content-
                // Prozess mehr existiert (dann verpufft auch jedes eval()
                // mangels JS-Kontext): die Navigation Rust-seitig über
                // WKWebView selbst anstoßen (WebviewWindow::navigate) —
                // das funktioniert unabhängig davon, ob die WebView je
                // eine Seite geladen hat.
                if let Some(main) = handle.get_webview_window("main") {
                    let url = format!("http://localhost:{PORT}/");
                    match url.parse::<tauri::Url>() {
                        Ok(parsed) => {
                            if let Err(e) = main.navigate(parsed) {
                                eprintln!("[ForensProto] navigate() fehlgeschlagen ({e}) — Fallback auf JS-Redirect.");
                                let _ = main.eval(&format!("window.location.replace('{url}');"));
                            }
                        }
                        Err(e) => {
                            eprintln!("[ForensProto] URL-Parse-Fehler ({e}) — Fallback auf JS-Redirect.");
                            let _ = main.eval(&format!("window.location.replace('{url}');"));
                        }
                    }
                    let _ = main.show();
                    let _ = main.set_focus();
                }
                if let Some(splash) = handle.get_webview_window("splash") {
                    let _ = splash.close();
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                eprintln!("[ForensProto] CloseRequested für Fenster '{}'.", window.label());
                // WICHTIG: Wir schließen das "splash"-Fenster selbst,
                // programmatisch, sobald der Server erfolgreich hochgefahren
                // ist (siehe setup() oben, splash.close()). Auch ein
                // programmatischer close() durchläuft denselben
                // CloseRequested-Event wie ein Klick auf den roten
                // Schließen-Button. Ohne diesen Label-Check würde also JEDER
                // erfolgreiche Start den frisch gestarteten Serverprozess
                // sofort wieder killen (Bug: leeres/weißes Hauptfenster,
                // weil der Server im selben Moment stirbt, in dem er als
                // bereit erkannt wird). Der Serverprozess darf daher nur
                // beendet werden, wenn tatsächlich das Hauptfenster
                // geschlossen wird (Nutzer beendet die App).
                if window.label() != "main" {
                    return;
                }
                // Nur einen selbst gestarteten Serverprozess auch selbst beenden.
                if let Some(state) = window.try_state::<ServerProcess>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        eprintln!("[ForensProto] Beende Serverprozess (PID {}).", child.id());
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten von ForensProto");
}
