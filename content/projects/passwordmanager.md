---
title: PasswordManager — zero-knowledge password manager in Rust
project: passwordmanager
url: https://github.com/MikkoNumminen/PasswordManager
---

# PasswordManager

**A local-first, zero-knowledge password manager where crypto exists in exactly one place.**

The core design rule: one Rust crypto implementation shared by every client. The `core` crate is the only place cryptography exists — it compiles natively and to wasm32, so the CLI, the sync server, the browser client, and the Chrome extension all run the same audited code path. There is no second implementation to drift.

## Architecture

A Rust workspace of five crates: `core` (AEAD, KDF, storage traits), `cli`, `server`, `web`, and `vaultctl`. On top of it, four clients:

- **CLI** — the daily driver: an offline-first vault stored in local SQLite
- **Sync server** — Tokio-based; stores ciphertext and metadata only, never keys or plaintext
- **Browser client** — WebAssembly via wasm-bindgen; decryption happens in the browser
- **Chrome extension** — Manifest V3 with autofill and save-on-login; domain matching uses eTLD+1 via the Public Suffix List, and a version badge turns amber when the server has a newer build

Public access to the sync server is opt-in, via Tailscale Funnel with oauth2-proxy (Google email allowlist) or a Cloudflare Tunnel.

## Cryptography

- **KDF**: Argon2id at 256 MiB and 3 passes — roughly 430 ms per unlock, deliberately expensive
- **AEAD**: XChaCha20-Poly1305 with a fresh nonce per entry; the AEAD is bound to the entry's UUID and timestamp, so a ciphertext cannot be swapped between records undetected
- **Hygiene**: RustCrypto crates throughout (`argon2`, `chacha20poly1305`, `zeroize`, `secrecy`, `subtle`); keys are zeroized after use; no plaintext in logs

Zero-knowledge means the master password never reaches the server and the server database is useless without a client-side unlock.

## Threat model

Documented explicitly: what the design protects against (a stolen disk, a server breach, leaked backups) and what it does not (a keylogger on the client, memory scraping, a weak master password). Every security decision — KDF parameters, AEAD design, sync conflict handling, identity separation — is an architecture decision record in `docs/adr/`.

## Testing and CI

Vault and sync tests include known-answer crypto vectors, tamper detection, zero-knowledge verification against a real database file, and a two-device sync over HTTP. The extension has its own JavaScript unit tests. GitHub Actions runs a secret/database-file guard, format check, clippy, the full workspace test suite, and the wasm build; the release profile ships with LTO.

## Status

Actively developed and in daily use as of July 2026. Recent work: extension autofill and the extension update badge.

[GitHub](https://github.com/MikkoNumminen/PasswordManager)
