# PPToken Open Source Release Guide

PPToken is intended to be released as an Apache-2.0 project derived from the
public AiMaMi repository. This checklist keeps the release clean, reproducible,
and legally attributable.

## Scope

The repository may include:

- Code originally present in the public AiMaMi repository under Apache-2.0.
- PPToken-owned changes and independently implemented features.
- Build scripts, GitHub Actions workflows, icons, screenshots, and docs that
  PPToken has the right to publish.

The repository must not include:

- Private AiMaMi source code that was not published under Apache-2.0.
- Decompiled or reverse-engineered code from AiMaMi release binaries.
- User data from `~/.codex`, API keys, account snapshots, relay secrets, logs,
  local SQLite databases, or machine-specific config.
- Apple signing identities, Tauri updater private keys, or `.env` files.

## Required Files

- `LICENSE` with Apache-2.0 terms and both upstream and PPToken copyright lines.
- `NOTICE` preserving upstream attribution.
- `README.md` and `README-en.md` describing the real open-source feature set.
- `.gitignore` that excludes generated bundles, local state, logs, keys, and
  environment files.
- GitHub Actions workflow for clean builds from a fresh checkout.

## Preflight

Run these checks before publishing or tagging a release:

```bash
git status --short
pnpm exec tsc --noEmit
cd src-tauri
cargo fmt --check
cargo check
cd ..
pnpm run build
pnpm tauri build
```

Then scan for secrets and local paths:

```bash
rg -n "OPENAI_API_KEY|PPTOKEN_RELAY|sk-|session_token|refresh_token|client_secret|PRIVATE KEY|TAURI_PRIVATE_KEY|/Users/" .
```

Expected local paths in docs or source comments should be reviewed manually.
Anything containing real account data, tokens, or machine-specific state must be
removed before pushing.

## GitHub Publication

1. Create or reuse `https://github.com/xiaokelongxia/PPToken`.
2. Keep the default branch as `main`.
3. Push source only:

```bash
git remote -v
git push origin main
```

4. Add repository settings:

- Description: `Independent Codex control panel with accounts, sessions, routing, MCP, skills, custom instructions, and analytics.`
- License: Apache-2.0.
- Topics: `tauri`, `codex`, `desktop-app`, `react`, `rust`, `mcp`, `skills`.
- Disable Issues only if there is no support capacity; otherwise add issue
  templates before public release.

5. Create a release tag after CI passes:

```bash
git tag v0.1.1
git push origin v0.1.1
```

## Large Feature Backlog

The following AiMaMi release-binary capabilities are not copied into PPToken.
They should be rewritten in PPToken-owned code if needed:

- Local relay proxy server with passthrough audit and official-route blocking.
- Codex thread visibility migration/rollback for router-created threads.
- Voice sidecar with microphone capture, speech recognition, audio level events,
  and prompt sounds.
- Server-backed remote device sync beyond the local device id and pairing key.
- Rich plugin registry distribution beyond local manifest/catalog scanning and
  local plugin configuration overrides.

Each item should land as a separate PR with tests and a migration note.
