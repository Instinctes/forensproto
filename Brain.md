# Brain.md — Projektgedächtnis ForensProto

Letzte Aktualisierung: 2026-08-01

## Recovery Exit 255 (Hashcat Apple Silicon)

[2026-08-01] [Bug] — Recovery brach mit Exit 255 ab. Ursache: Hashcat 7.x auf M3 meldet Metal + OpenCL als Alias-Geräte; Dual-Init skippt Metal und scheitert an OpenCL `clCreateProgramWithBinary/CL_INVALID_VALUE`. Fix in `hashcat-manager.ts`: Default `--backend-ignore-opencl` auf darwin, stderr→lesbare Fehler, Preflight Wortliste/Hash, cwd=Hash-Dir. Override: `FORENSPROTO_HASHCAT_BACKEND=metal|opencl|auto`.

[2026-08-01] [Bug] — Exit 255 kehrte zurück, aber mit ANDEREM Symptom: Hashcat (Mode 11300, Bitcoin) starb bei „Starting self-test" (Beleg: hc_out.txt), NICHT mehr beim Kernelbuild. Der Metal-Default (oben) behebt nur den Kernelbuild-Crash, nicht den Self-Test-Abbruch — auf Apple Silicon Metal ist der Self-Test bei Slow-Hash-Kerneln ein bekanntes False-Negative und beendet den ganzen Job vor dem ersten Versuch. Fix: neue `selfTestArgs()` in `hashcat-manager.ts` fügt standardmäßig `--self-test-disable` hinzu (Start, Resume, Benchmark, Keyspace). Sicher, da echte Treffer ohnehin gegen das Hash-Material verifiziert werden. Override: `FORENSPROTO_HASHCAT_SELFTEST=on`. Metal-Default NICHT entfernen (sonst Rückkehr des Dual-Backend-Crashes).

[2026-08-01] [Entscheidung] — Auto-Blockchain-Abgleich in `advanced-analysis/page.tsx` (feuert nach jeder Wallet-Analyse an blockchain.info) ist ein GEWOLLTES Feature (Single-User-App), bleibt automatisch. Logik in Funktion `syncBlockchainBalances(analyses)` ausgelagert (bekommt Analysen als Parameter statt auf async State zu warten), Verhalten unverändert. Server-Output der nativen App wird jetzt in `<Datenordner>/.forensproto/server.log` geschrieben statt verworfen (`main.rs`, vorher `Stdio::null()`).

## Mock-Bereinigung (2026-08-01)

[2026-08-01] [Fortschritt] — Produkt-Audit: Fake-Fallbacks entfernt/ersetzt.
- Benchmark: kein erfundener M3-Pro-Speed mehr (`success: false` ohne Hashcat).
- Doc-Breaker: kein Fake-Hash-String mehr (`422` + klare Fehlermeldung).
- Nonce-Analyzer: keine Pseudo-TxIDs aus s-Werten; echte TxIDs aus On-Chain-Scan.
- Batch-Recovery: echte SIGHASH-Extraktion (r-matched Input) statt whole-tx double-SHA256.
- API-Keys: serverseitig in `.forensproto/onchain-api-keys.json`, genutzt von Etherscan-Calls.
- GPU-Monitor: keine erfundenen Util/Power/VRAM-Werte.
- Air-Gap-Badge: echter Egress-Probe statt „Gesichert“.
- Memory-Scan: BIP39-EN wieder eingeschlossen.

## Test-Fundament (Vitest)

[2026-08-01] [Fortschritt] — Erstes automatisiertes Testfundament (vorher: null Tests — Ursache, dass der Hashcat-Regressionsbug still durchrutschte). Vitest als devDep, `npm test` (= `vitest run`), `vitest.config.ts` (node-env, `@/*`-Alias). Tests unter `test/` (aus tsconfig+next-Build ausgeschlossen). Suites: `visual-key.test.ts` (secp256k1-Referenzvektoren privkey=1 → kanonische WIF/Pubkeys/Adressen inkl. BIP173 bc1qw508…, CL-1-Determinismus + Range), `shamir.test.ts` (k-of-n Round-Trip + <k schlägt fehl + Serialisierung), `seed-recovery.test.ts` (BIP39-TREZOR-Seed-Vektor, BIP32-Pfad-Ableitung), `hashcat-args.test.ts` (Regressions-Schutz: buildArgs/selfTestArgs enthalten `--self-test-disable`; backendArgs-Overrides), `audit-log.test.ts` (Hashketten-Aufbau + Tamper-Detection über db.append). Erwartungswerte gegen echte Referenzvektoren verifiziert (node --experimental-strip-types / CJS-Harness). CLAUDE.md DoD: Testbefehl eingetragen.

## Architektur (Kurzfassung)

Next.js 16 (output: standalone) als lokaler Server auf Port 38217, gebündelt als Tauri-2-Resource (`src-tauri/resources/app`). Rust-Wrapper (`src-tauri/src/main.rs`) startet Splash, killt Altprozesse auf dem Port, startet `node server.js`, wartet auf `/api/health` und zeigt dann das Hauptfenster (WKWebView → localhost:38217). Datenordner: `~/Library/Application Support/com.forensproto.desktop`.

## Visual Key Generator (CL-1)

[2026-08-01] [Fortschritt] — Feature **Visual Key**: Algorithmus **Chromaspace Lattice v1 (CL-1)** in `src/lib/visual-key.ts`. UI `/visual-key`, APIs `/api/visual-key/generate` + `/check`. Pipeline: Boustrophedon-Raster → Topologie-Features → Rule-90-Lattice-Mix (8 Runden) → HMAC-SHA256 → secp256k1 → P2PKH/P2SH-P2WPKH/P2WPKH. Live-Balance/Kollision via mempool.space. Sidebar-Gruppe Forensik, i18n DE/EN.

[2026-08-01] [Fortschritt] — Visual-Key-Erweiterungen (page.tsx + visual-key.ts + check-API):
- **Rotieren/Invertieren** neben den Presets (rotateCW 90° im Uhrzeigersinn, invertCells mit aktueller Intensität).
- **Eigener HEX-Key-Modus**: Checkbox „Visualize my own HEX private key" → 16×16-Bit-Visualisierung + Adressen direkt aus dem Key (`addressesFromPrivateHex()`, KEIN CL-1), Malen deaktiviert. API akzeptiert `{privateKeyHex}`, keyMeta.features=null (Stats-Panel entsprechend geguarded).
- **Responsive Grid**: aspect-ratio + 1fr-Spalten statt fixer Pixel (kein Overflow bei 16×16).
- **Rasterbeschriftung** Zeilen/Spalten 1…size; **BIN-256-Zeile**; **Explorer-Links** (mempool.space) an Adressen; **unkomprimierte P2PKH** (`addresses.p2pkhUncompressed`, aus pubU) in Lib+API+UI+On-Chain-Check.
- **Toggle-Malen**: Klick auf gefüllte Zelle mit gleicher Intensität leert sie (`toggleAt` für Klick/Tastatur, `applyAt` bleibt fürs Drag-Malen).
- **Explorer-Link öffnet Standardbrowser**: Route `/api/system/open-url` (execFile `open`/`start`/`xdg-open`, Host-Allowlist) — nötig, weil WKWebView `target=_blank` sonst in der App navigieren würde.

[2026-08-01] [Fortschritt] — **Offline-Muster-Scan (Research)**: Button „Algorithmus-Scan" auf `/visual-key`. `src/lib/pattern-scan.ts` generiert N zufällige Muster (Default 100k), leitet je Muster alle Adressformen via CL-1 ab, baut Adress→Muster-Index im RAM (~100 MB) und streamt die vom Nutzer bereitgestellte `btcadresseswithbalance.txt` EINMAL durch (exakt, keine False Positives, beliebige Dateigröße). Datei liegt in `<dataDir>/funded-set/` (Application Support), Treffer → `funded-set/hits/scan-*.jsonl` + Summary. Treffer werden mit vollem Schlüsselmaterial (privHex, WIF compr/uncompr, Pubkey, alle Adressen) gespeichert und angezeigt. API `/api/visual-key/scan` (prepare/start/status/stop/reveal), Modul-globaler Status, chunked+stoppbar. data-dir.ts: `getFundedSetDir/getFundedSetFile/getScanHitsDir`. NUR Research/Dokumentation.

## Gelöste Probleme

[2026-07-08] [Bug] — Weißer Screen beim Start der gebauten App trotz gesundem Server. Zwei Ursachen: (1) `eval("window.location.reload()")` nach fehlgeschlagener Erstnavigation der WKWebView lädt nur die leere Seite neu — die Ziel-URL wird nie wieder angefragt. Fix: explizite Neunavigation (`window.location.replace(URL)` bzw. robuster Rust-seitig `WebviewWindow::navigate()`, main.rs Schritt 4). (2) Parallel installierte App-Kopien (/Applications UND Projektordner) killen sich gegenseitig die Server, da der BUNDLED-Modus Port 38217 exklusiv beansprucht — nur EINE installierte Kopie betreiben.

[2026-07-08] [Entscheidung] — Cargo-Feature `devtools` aktiviert (Web-Inspector im Release-Build), solange WebView-Probleme untersucht werden. Bei Bedarf wieder entfernen (src-tauri/Cargo.toml).

## Bekannte offene Punkte

- Beenden per Cmd+Q löst kein `CloseRequested` für das main-Fenster aus → der Node-Serverprozess kann als Waise weiterlaufen (wird beim nächsten Start per `kill_stale_process_on_port` aufgeräumt, aber sauberer wäre ein Handler für `RunEvent::ExitRequested`).
- Server-Log meldet „node:sqlite nicht verfügbar — JSON-Fallback" trotz Node v26 — Ursache ungeklärt, funktional durch JSON-Fallback abgedeckt.
