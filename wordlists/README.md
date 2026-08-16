# Wordlists

This folder is where Hashcat dictionaries live at runtime.

**We do not ship rockyou or any bulk password dump.** Those files are huge, often redistributed illegally, and would blow the GitHub size limit.

## What is in the repo

- `example.txt` — a tiny list so the UI and a smoke-test job have *something* to select. It will not recover a real wallet.

## What you add locally

Drop `.txt` or `.dic` files here. They are gitignored.

Common legal sources:

- lists you generated inside the app (hint / keyboard / Markov)
- Hashcat’s own example dictionaries
- wordlists you have a license to use

Do not open a pull request that adds a multi-megabyte dictionary.
