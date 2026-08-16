# Getting started

## 1. Install prerequisites

| Tool | Required | Why |
|---|---|---|
| Node.js 20+ (22.5+ recommended) | yes | App runtime. 22.5+ enables built-in `node:sqlite`; older Node falls back to JSON files. |
| Hashcat | for recovery jobs | Actual password search, keyspace, benchmark. |
| Python 3.8+ | for hash extraction | `scripts/bitcoin2john.py` and wallet dumps. |
| Ollama | optional | Local AI assistant. |
| GPU | optional | Faster Hashcat. |

macOS:

```bash
brew install node hashcat python
# optional: brew install ollama && ollama pull llama3
```

## 2. Run

```bash
git clone https://github.com/instinctes/forensproto.git
cd forensproto
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server listens on localhost only.

Production:

```bash
npm run build
npm run start
```

## 3. First recovery

1. Confirm the setup strip on the home page (Hashcat + a wordlist).
2. Drop a `wallet.dat` or keystore onto the home page.
3. Follow the recovery hub. Pick `wordlists/example.txt` only to smoke-test the pipeline — it is not a real attack dictionary.

Put larger lists (e.g. Hashcat’s) into the `wordlists/` folder yourself. They are gitignored on purpose. See [wordlists/README.md](../wordlists/README.md).

## 4. Optional config

Copy [`.env.example`](../.env.example) to `.env.local`. Auth stays **off** until you set `FORENSPROTO_AUTH=enabled`.

Data (jobs, audit log, uploads) lives in `.forensproto/` unless you set `FORENSPROTO_DATA_DIR`.

## Native macOS app

See [macos-app.md](macos-app.md).
