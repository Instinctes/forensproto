# ForensProto

**Local-first DFIR and crypto-wallet recovery.** Runs on your machine. Private keys are not uploaded anywhere.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/instinctes/forensproto/ci.yml?branch=main)](https://github.com/instinctes/forensproto/actions)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](https://nodejs.org)

> **Lawful use only.** Recover your own data, run an authorized investigation, or handle an estate case you have the right to access. See [docs/legal.md](docs/legal.md).

---

## 5-minute start

```bash
git clone https://github.com/instinctes/forensproto.git
cd forensproto
npm install
npm run dev
```

Open **http://127.0.0.1:3000** (localhost only).

1. Check the setup strip on the home page (Hashcat / wordlist).
2. Drop a wallet file onto the page — or open **Recovery**.
3. Put real dictionaries in `wordlists/` yourself. The repo only ships [`wordlists/example.txt`](wordlists/example.txt) for a smoke test.

Full walkthrough: [docs/getting-started.md](docs/getting-started.md).

macOS `.app` build: [docs/macos-app.md](docs/macos-app.md).

---

## What it actually does

| Area | Status |
|---|---|
| Bitcoin Core `wallet.dat`, Hashcat jobs, BIP39 / missing-word recovery, ECDSA nonce-reuse, hash-chained audit log, signed case dossier | **Core — real** |
| OSINT, chain tracer, file carver, stego, memory scan | **Lite — local, limited** |
| Visual Key, vanity addresses, pattern scan | **Research** — labelled in the UI |
| Distributed agents, RBAC, Vast.ai listing | **Optional / advanced** |
| AI assistant | **Optional** — local [Ollama](https://ollama.com) |

This is a single-user workbench, not a hosted SaaS and not a court-certified appliance out of the box.

---

## Prerequisites

| Tool | Need it? |
|---|---|
| **Node.js** ≥ 20 (22.5+ recommended) | yes |
| **Hashcat** | yes, for recovery |
| **Python 3.8+** | yes, for hash extraction scripts |
| **Ollama** | optional |
| GPU (NVIDIA / AMD / Apple) | optional, faster Hashcat |

```bash
# macOS
brew install node hashcat python
```

---

## Configuration

```bash
cp .env.example .env.local
```

Auth is **off** until you set `FORENSPROTO_AUTH=enabled`. Jobs, the audit log, and uploads stay under `.forensproto/` (gitignored) unless you set `FORENSPROTO_DATA_DIR`.

Do **not** run `npm audit fix --force` — it can downgrade Next.js to an incompatible major.

---

## Tests

```bash
npm test              # Vitest
npx tsc --noEmit
npm run lint
```

---

## Contribute

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never commit wallets, seeds, potfiles, or bulk wordlists.

---

## License

[MIT](LICENSE) — plus the acceptable-use note in that file and in [docs/legal.md](docs/legal.md).
