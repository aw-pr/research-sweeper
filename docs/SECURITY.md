# Security

This document describes how `research-sweeper` handles credentials, what is safe to commit, and what to do when keys rotate.

## Secrets architecture

There are two ways to supply credentials; neither stores a secret in the repo.

**`.env` (default, no extra tooling).** Copy `.env.example` to `.env` and set
the provider keys. At startup the process loads `.env.local` then `.env`
*fill-only*: a value is applied only if that variable is currently unset, so it
never overrides a real shell export or a key injected by the 1Password route.
`.env*` is gitignored (except `.env.example`).

**1Password (optional).** When configured, credentials live in 1Password and are
resolved at the moment a child process starts; the repo holds only `op://`
*references*, never values. `op-refs.sh` (committed) carries placeholder defaults
and sources a gitignored `op-refs.local.sh` containing your real vault/item
refs. The secure wrappers (`run-secure-command.sh`, `run-secure-sweep.sh`, and
the scripts that delegate to them) pass the named refs to an `op-fetch`
resolver on `PATH`, which sources `OP_SERVICE_ACCOUNT_TOKEN` (from
`$OP_SERVICE_ACCOUNT_ENV`, defaulting to the standard op service-account env
file), resolves only the named refs, and `exec`s the child with a sanitised env
(small allowlist plus the resolved keys). If `op-fetch` or `op-refs.local.sh`
is absent, the wrappers fall back to running directly with the `.env` keys.

Three auth routes are supported regardless of credential source: (1) **API key**
(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`); (2) **Claude OAuth** (Max/Pro) via
`CLAUDE_CODE_OAUTH_TOKEN` with `ANTHROPIC_API_KEY` explicitly stripped from the
child env; (3) **Codex auth** for OpenAI sync via the Codex CLI auth file, with
`OPENAI_API_KEY` removed before `codex exec` runs.

## What is safe to commit

`op://` references are pointers — they identify *where* a secret lives, not the
secret itself. Only the placeholder `op-refs.sh` and `op-refs.local.sh.example`
are tracked; your real refs go in the gitignored `op-refs.local.sh`.
`runs/stats.json` is tracked — it is the run-history ledger and contains no
secrets.

## What must never be committed

Never commit resolved API keys, OAuth tokens, `.env` / `.env.local`,
`op-refs.local.sh`, the Codex CLI auth file, the 1Password service-account
token, `.claude/settings.local.json`, or any file with raw `sk-…` / `sk-ant-…`
style credentials. `.gitignore` excludes `.env*` (except `.env.example`),
`*.local`, `op-refs.local.sh`, `.claude/settings.local.json`, `logs/`,
`results/`, and `runs/*.json` job-state files. If a secret is committed by
accident, rotate it immediately — do not rely on a `git rm` to remediate.

## Threat model

The design protects against three concrete leak paths. First, key-in-env: the
1Password route builds a sanitised env so unrelated tools the child invokes do
not inherit credentials they should not see, and the OAuth and Codex routes
explicitly drop the corresponding API-key vars to avoid silent fallback to
API-key billing. Second, key-in-git: the tracked tree holds no secret material
(only `op://` placeholders and a gitignored real-refs file). Third,
key-in-`ps aux`: secrets are passed by environment variable, never as CLI
arguments, so they do not appear in the process list. Out of scope: a
compromised local machine, a compromised 1Password service account, secrets a
user places in `.env` on a shared host, or supply-chain compromise of upstream
npm packages.

## Credential rotation

Rotate the key at its source — the 1Password item behind your
`op-refs.local.sh` ref (the `op://` reference does not change), or the value in
`.env`. Verify with `npm run auth:check` (`.env` route) or
`npm run auth:check:secure` (1Password route), which runs a live auth check.
For the Codex route, re-run `codex login` and re-run the verify command.
