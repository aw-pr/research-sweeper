# Auth Route Guards

This note records the April 2026 guardrails added after a Claude OAuth sync run appeared to have access to API-key credentials in the same process.

## Problem

`op run --env-file ...` hydrates every `op://...` reference in the env file and exposes all resolved values to the child process.

That means a mixed env file can produce a process with both:

- subscription/OAuth credentials, such as `CLAUDE_CODE_OAUTH_TOKEN` or Codex ChatGPT auth
- API-key credentials, such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

Some SDKs and CLIs can prefer API keys when both are present. For subscription-funded routes, that can silently burn API credits.

## Current Guards

### research-sweeper

Key hydration:

- if `op-fetch`/`op-refs.local.sh` is absent, it execs the child directly and keys come from the fill-only `.env` loader
- otherwise it sources `op-refs.sh` and calls `op-fetch`, which sources `OP_SERVICE_ACCOUNT_TOKEN` from `$OP_SERVICE_ACCOUNT_ENV`, resolves only the named refs, and execs the child with a sanitised env

Route guard:

- `run-secure-sweep.sh --sync --provider claude --claude-auth claude-oauth ...`
  strips `ANTHROPIC_API_KEY` after `op run` hydration.
- `src/providers/claude.ts` also deletes `process.env.ANTHROPIC_API_KEY` before importing/running the Agent SDK.
- `run-secure-sweep.sh --sync --provider openai ...`
  strips `OPENAI_API_KEY` after `op run` hydration.
- `src/providers/openai.ts` also deletes `OPENAI_API_KEY` before spawning `codex exec`.

Smoke test:

```bash
./run-secure-command.sh env -u ANTHROPIC_API_KEY npx ts-node research-sweep.ts --auth-check claude-oauth
```

This passes only if the live Agent SDK call works with `CLAUDE_CODE_OAUTH_TOKEN` set and `ANTHROPIC_API_KEY` absent.

#### Gemini routes

Two Gemini routes exist, selected via `--gemini-auth api-key|gemini-oauth`.

**API-key route** (default; supports batch and sync):

- `GEMINI_API_KEY` is injected by `op-fetch` using `OP_REF_GEMINI_API_KEY`, or read from `.env`/`.env.local` on the fallback path.
- No stripping required: this is purely API-key-billed and carries no subscription risk.
- SDK: `@google/genai` (unified Google GenAI SDK; the legacy `@google/generative-ai` is deprecated and must not be used).

**gemini-oauth route** (sync-only; GCP-billed):

- Uses a Google OAuth access token (`GOOGLE_ACCESS_TOKEN`) passed as a Bearer header via `@google/genai` `httpOptions`.
- **This is GCP-billed.** It is not a consumer-subscription route equivalent to Claude Max/Pro OAuth or Codex auth. Expect standard Gemini API pricing against your GCP project.
- `run-secure-sweep.sh` injects no Gemini key when this route is active; `GOOGLE_ACCESS_TOKEN` must be present in the caller environment (e.g. from `gcloud auth print-access-token`).
- `src/providers/gemini.ts` deletes `process.env.GEMINI_API_KEY` in-process before initialising the SDK as a belt-and-suspenders guard against accidental API-key billing.
- Batch mode hard-fails if `--gemini-auth gemini-oauth` is set; the Gemini batch path requires the API key.

**Search behaviour:**

Gemini lanes use Google Search grounding (`tools: [{ googleSearch: {} }]`). Unlike the Anthropic/OpenAI paths, grounding cannot be forced — the model decides whether to invoke it. Under `--no-search` the grounding tool is omitted. Source selection may therefore diverge from claude/openai lanes; `runs/stats.json` records `authMode` per run.

### explainer-batch

Key hydration:

- `scripts/run-batch-tmux.sh` sources `OP_SERVICE_ACCOUNT_TOKEN`
- it then runs `op run --env-file "$ENV_FILE" -- ...`

Route guard:

- Claude sync requires `CLAUDE_CODE_OAUTH_TOKEN`; it refuses to use Claude sync with API-key-only auth.
- `scripts/run-batch-tmux.sh` strips `ANTHROPIC_API_KEY` after `op run` hydration for `PROVIDER=claude EXTRA_ARGS=--sync`.
- The Claude provider deletes `ANTHROPIC_API_KEY` before importing/running the Agent SDK.
- `scripts/run-batch-tmux.sh` strips `OPENAI_API_KEY` after `op run` hydration for `PROVIDER=openai EXTRA_ARGS=--sync`, keeping the route on Codex CLI auth.

### contract-crawler

Key hydration:

- `run.sh` calls `~/scripts/run-secure-with-op --env-file .env -- .venv/bin/contract-crawler run ...`

Route guard:

- the default `SCORER=openai_codex` path removes `OPENAI_API_KEY` from the `codex exec` child process environment.
- explicit `SCORER=openai_api` still uses `OPENAI_API_KEY`.
- explicit `SCORER=claude` still uses `ANTHROPIC_API_KEY`.

### ai-schedules

No change was needed. It already strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `OPENAI_API_KEY` by default while preserving `CLAUDE_CODE_OAUTH_TOKEN`. API billing requires explicit opt-in.

## Long-Term Plan

The current guards protect mixed env files. The cleaner long-term model is route-specific env files plus fail-closed wrappers.

Recommended files:

```text
.env.claude-api
.env.claude-oauth
.env.openai-api
.env.openai-codex
.env.gemini-api
.env.gemini-oauth
```

Rules:

- API-key routes load only the relevant API key.
- OAuth/Codex routes load only the subscription credential and any non-provider configuration.
- OAuth/Codex wrappers still strip conflicting API-key variables after hydration as a belt-and-braces check.
- Smoke tests run before expensive OAuth/Codex sweeps.

Suggested implementation:

1. Add provider-specific env file selection to each wrapper.
2. Add example env templates for each route.
3. Make OAuth/Codex wrappers fail if the corresponding API key is present after stripping.
4. Add `auth:check:*` commands for each protected route.
5. Update skills/docs so agents never call raw `op run --env-file ...` for subscription-funded paths.

Estimated effort:

- `research-sweeper`: 1-2 hours
- `explainer-batch`: 1-2 hours
- `contract-crawler`: 30-45 minutes
- docs and smoke command polish: 30-60 minutes

The current code already guards the dangerous mixed-env case; provider-specific env files would mainly reduce cognitive load and make intent obvious.
