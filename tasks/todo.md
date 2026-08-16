# tasks/todo.md — Master-Plan

## Open Source / GitHub (instinctes/forensproto) — 2026-08-16

- [x] `.gitignore` härten (Wallets, `.forensproto`, Uploads, große Wortlisten)
- [x] Junk + interne Phasen-/Bewertungsdocs + 301-MB-`wordlists/wordlist.txt` entfernt
- [x] `LICENSE` (MIT + Acceptable Use), `SECURITY.md`, `CONTRIBUTING.md`, CoC
- [x] README EN-first, `docs/getting-started.md`, `docs/legal.md`, `docs/macos-app.md`
- [x] `package.json` → `forensproto`, Scripts auf `127.0.0.1`
- [x] Setup-Banner + ehrlicher Health-Chip, neutrales Profil
- [x] i18n DE↔EN Restlücken (PHRASES + hartes Englisch in Quelle)
- [x] Repo angelegt und gepusht: https://github.com/Instinctes/forensproto

### Review
`tmp_bwa/*.dat` und `.env.local` bewusst nicht gelöscht — nur ausgeschlossen. Nächster Schritt: kuratiertes Initial-Commit, kein `git add .` der alten Working Copy ohne Status-Check.

## Visual Key Generator (CL-1) — 2026-08-01

- [x] Algorithmus **Chromaspace Lattice v1 (CL-1)** in `src/lib/visual-key.ts`
- [x] API `POST /api/visual-key/generate`
- [x] API `POST /api/visual-key/check` (mempool.space Balance + Tx = Kollision)
- [x] UI `/visual-key` (Canvas, Presets, Salt, On-Chain-Verdict)
- [x] Sidebar + i18n (DE/EN)
- [x] `tsc --noEmit` sauber, ESLint auf neuen Dateien sauber
- [x] Smoke-Test: Determinismus, Salt-Bindung, Adressformate

### Review
- Feature ist research-only (Warnbanner + Entropie-Heuristik).
- On-Chain-Check nutzt mempool.space (öffentlich, rate-limited).
- Keine neuen npm-Dependencies.

### Nächste optionale Ausbauten
- [ ] ETH-Adresse aus gleichem Skalar (keccak) + Etherscan-Check
- [ ] Batch-Scan von Preset-Bibliotheken
- [ ] Pattern-Export/Import (JSON + Fingerprint)

## Mock-Audit & Ersatz — 2026-08-01

- [x] Audit aller Sidebar-Features (REAL / PARTIAL / MOCK)
- [x] Benchmark-Fake-Fallback entfernt
- [x] Doc-Breaker Fake-Hash entfernt
- [x] Nonce Pseudo-TxIDs + Batch echte SIGHASH
- [x] On-Chain-API-Keys serverseitig verdrahtet
- [x] GPU/Air-Gap ehrlich
- [x] Memory-Scan BIP39-EN Fix
- [x] tsc/eslint sauber

### Review
Kern-Mocks, die Erfolg vortäuschten, sind ersetzt. Verbleibend absichtlich: Distributed-Selbsttest (labeled), allowSimulated Batch-Opt-in (labeled). OSINT/Tracer/File-Carver sind echte Lite-Implementierungen, keine Mocks — Scope vs. Marketing, nicht Fake-Daten.
