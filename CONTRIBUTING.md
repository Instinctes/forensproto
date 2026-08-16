# Contributing

Thanks for helping. ForensProto is a local DFIR / wallet-recovery tool — keep that scope.

## Before you start

1. Read [docs/legal.md](docs/legal.md). We only accept work that supports lawful, authorized use.
2. Use your own test material. **Never** open a PR that contains a real `wallet.dat`, seed, potfile, or a bulk password list.

## Dev setup

```bash
git clone https://github.com/instinctes/forensproto.git
cd forensproto
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://127.0.0.1:3000
```

Optional local hook (typecheck + lint + tests on every commit):

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

## Checks we expect to stay green

```bash
npm test
npx tsc --noEmit
npm run lint
```

CI runs the same three commands on `main`.

## What we will merge

- bug fixes with a regression test when the logic is testable
- clearer empty states, i18n (DE/EN), docs
- real coverage for wallet formats, recovery, or audit integrity
- honest labels when a feature is lite or research-only

## What we will not merge

- rockyou / commercial wordlists
- sample evidence that looks like someone else’s money
- new cloud services that ship keys off-box
- drive-by refactors unrelated to the PR
- “make it crack faster” changes that skip verification of hits

## PR shape

- One problem per PR.
- Describe *what* and *how you proved it* (test output is enough).
- Match the surrounding comment language (German or English is fine; don’t mix in one file without reason).
