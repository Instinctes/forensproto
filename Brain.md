# Brain.md — Projektgedächtnis ForensProto

Letzte Aktualisierung: 2026-08-16

## Open-Source-Aufräumen (instinctes/forensproto)

[2026-08-16] [Entscheidung] — Repo für GitHub `instinctes/forensproto` vorbereitet. MIT + Acceptable-Use. Server-Scripts binden `127.0.0.1`. UI-Default-Locale EN. 301-MB-Wortliste und interne Bewertungs-/Phasen-Docs entfernt. `tmp_bwa/*.dat` bleiben lokal und sind gitignored.

[2026-08-16] [Fortschritt] — i18n-Lücken geschlossen: hartes Englisch in DE-Quelle (Settings, Seed, AI-Rules, Extensions, Advanced-Analysis, Recovery-Fehler) auf Deutsch umgestellt; AutoTranslate-PHRASES/PATTERNS um die restlichen DE→EN-Treffer ergänzt. DE-Tagline „Passwort-Wiederherstellung“.

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

## Wertsteigerung: Forensik-Tests, Attestierung, Fall-Dossier

[2026-08-04] [Fortschritt] — Drei Werttreiber (schließen die im Asset-Valuation genannten Deckel):
- **Forensik-Tests ausgeweitet** (test/): nonce-recovery (ECDSA-Nonce-Reuse rekonstruiert privaten Schlüssel gegen exakten Vektor), multisig (2-of-3 P2SH `33hG2q…`/P2WSH `bc1qztp0…`, Parsing, assessMultisigRecovery), descriptor (wpkh/pkh/sh), ec-engine (Generator on-curve, modInverse, getOppositeS=n−s), signature-analyzer (Low-S/Malleability, validRange). Alle Erwartungswerte via node gegen echte Modul-Ausgabe verifiziert. Gesamt jetzt 12 Test-Suiten.
- **Ergebnis-Attestierung** (`src/lib/attestation.ts`, API `/api/recovery/attest`): gefundenes Passwort wird via `dumpEncryptedWallet` (mkey→AES-CBC→secp256k1-Abgleich) geprüft, Ergebnis Ed25519-signiert. Geheimnis NICHT gespeichert (nur SHA-256-Commitment). `verifyAttestation` erkennt Manipulation. Verifiziert.
- **Signiertes Fall-Dossier** (`src/lib/dossier.ts`, API `/api/cases/[caseId]/dossier`, Button auf /cases): bündelt Fall-Metadaten + Asservat-Integrität + Chain-of-Custody + Audit-Hashketten-Verifikation + Attestierungen in ein Ed25519-signiertes, unabhängig prüfbares Bundle (JSON + Textbericht). GET (?format=text) + POST {verify}. Sign/Verify-Kern identisch zur verifizierten Attestierung.
- Roadmap: `tasks/WERT_ROADMAP_DE.md`.

## Visual-Key Balance-Check: Offline statt Live-API

[2026-08-04] [Entscheidung] — Live-Balance-Prüfung gegen mempool.space (Rate-Limit) durch OFFLINE-Prüfung gegen die lokale `funded-set/btcadresseswithbalance.txt` ersetzt (`src/lib/funded-lookup.ts`: ein Streaming-Durchlauf, Early-Exit sobald alle wenigen Adressen gefunden; Satoshi-Ganzzahl → BTC). `/api/visual-key/check` hat jetzt `checkBalance`-Flag: Default `false` = nur Schlüsselableitung, rein lokal, KEIN Netzwerk (Live-Anzeige ohne Rate-Limit); `true` = Offline-Datei-Abgleich. Frontend: Live-Effekt setzt keine Balance mehr, neuer Button „Offline gegen Adressdatei prüfen" löst den Abgleich aus. mempool-Explorer-LINKS bleiben (sind nur Links, keine API). Verdict-Texte auf Listen-Semantik umgestellt (Treffer/nicht in Liste). i18n DE/EN aktualisiert. Logik gegen synthetische Datei verifiziert.

## Build-Architekturen (Intel/Universal)

[2026-08-04] [Fortschritt] — `install-forensproto-macos.sh` unterstützt jetzt Zielarchitekturen: `--intel` (x86_64-apple-darwin), `--universal` (universal-apple-darwin), `--arch=intel|universal|arm|native`. Installiert die nötigen rustup-Targets (universal = beide), reicht `--target` an `tauri build` durch und liest die .app/.dmg aus `src-tauri/target/<triple>/release/bundle/…`. Bei intel/universal wird die arm64-Plattformprüfung automatisch entsperrt. Restrisiko: der Rust-Teil cross-kompiliert korrekt, aber die mitgebündelten Node-`node_modules` tragen Host-Arch-native-Bits (z. B. sharp) — für einen garantiert korrekten Intel-Build direkt auf einem Intel-Mac bauen.

[2026-08-04] [Bug] — Splash-Endlos-Loop behoben: `main.rs` beendete einen belegten Port nur bei GESUNDEM Alt-Server (check_health true). Der eigentliche Fall (Port belegt, aber kein Health-Marker → neuer node-Start scheitert an EADDRINUSE → Health nie grün) blieb hängen. Fix: neue `port_in_use()` (reiner TCP-Connect); im BUNDLED-Modus wird der dedizierte Port jetzt unabhängig von „gesund" geräumt; Kill-Warteschleife wartet auf port_in_use==false.

## Vanity-Adress-Generator (/vanity)

[2026-08-04] [Fortschritt] — Neues Feature in der Forensik-Gruppe (neben Visual Key): Bitcoin-Wunschadressen mit wählbarem Präfix. `src/lib/vanity.ts` erzeugt Schlüssel ausschließlich per `crypto.randomBytes` (CSPRNG — NIE Math.random) mit Skalar-Range-Prüfung [1,n-1], leitet nur den gesuchten Adresstyp ab (p2pkh/p2sh-p2wpkh/p2wpkh via encodeSegwitAddress+hash160) und läuft als stoppbarer Hintergrund-Job mit Fortschritt (Modul-global, Muster wie pattern-scan). `validatePrefix()` prüft festen Anfang (1/3/bc1q), Base58-Verbotszeichen (0,O,I,l) bzw. Bech32-Charset und schätzt den Aufwand (58^n bzw. 32^n; case-insensitive ≈33^n). API `/api/vanity` (validate/start/status/stop), UI `/vanity` mit vollem Schlüsselmaterial (privHex, WIF compr/uncompr, Pubkey) + Backup-Warnung. i18n DE/EN, Sidebar-Eintrag. Verifiziert: echter Suchlauf fand `1AFsMM…`, privkey→Adresse und WIF unabhängig gegengeprüft; alle Validierungs-Vektoren OK. Test: `test/vanity.test.ts`.

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
