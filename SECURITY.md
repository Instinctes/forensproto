# Security Policy

## What this project is

ForensProto is a **local** forensics and wallet-recovery workbench. Private keys, seeds, and job results are meant to stay on the machine that runs it. The default `npm` scripts bind the server to `127.0.0.1` only.

## Supported versions

Security fixes are accepted against the default branch (`main`). There is no LTS line yet.

## Reporting a vulnerability

Please **do not** open a public issue for vulnerabilities that could leak keys, bypass auth, or expose the local API.

Use [GitHub Security Advisories](https://github.com/instinctes/forensproto/security/advisories/new) on this repository.

Include:

- affected version / commit
- what an attacker would need (local process, same machine, network, …)
- steps to reproduce
- impact (key disclosure, job takeover, remote reachability, …)

We will acknowledge reports and work on a fix before any public write-up.

## Please do not report

- “Hashcat is slow on my GPU”
- missing wordlists
- features that are documented as research / lite

## Hard rules for contributors

- Never commit `.dat` wallets, seeds, private keys, potfiles, or real wordlists.
- Never commit `.env.local`, `.forensproto/`, or `uploads/`.
- Do not add exploit payloads or live attack scripts against third-party systems.
