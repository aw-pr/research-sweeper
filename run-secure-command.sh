#!/usr/bin/env bash
# Resolves only this repo's named 1Password refs (from op-refs.sh) via op-fetch
# and execs the child with a sanitized environment containing exactly those
# keys plus a small allowlist of pass-through vars (PATH, HOME, etc.).
#
# 1Password is optional: if op-fetch or op-refs.local.sh is absent this falls
# back to running the child directly (keys then come from the fill-only .env
# loader). When present, op-fetch sources OP_SERVICE_ACCOUNT_TOKEN from
# $OP_SERVICE_ACCOUNT_ENV per call so it runs headlessly under MCP parents.
set -euo pipefail

cd "$(dirname "$0")"

# Re-entry guard: nested invocations exec straight through with the already-
# sanitized environment so we don't fetch refs twice.
if [[ "${RESEARCH_SWEEPER_HELPER_ACTIVE:-}" == "1" ]]; then
  exec "$@"
fi

# Graceful fallback: with no op-fetch resolver on PATH or no private refs file,
# 1Password is not configured here. Run the child directly; the in-process
# .env loader supplies provider keys instead.
if ! command -v op-fetch >/dev/null 2>&1 || [[ ! -f "./op-refs.local.sh" ]]; then
  echo "[run-secure-command] op-fetch/1Password not configured — running with .env (see .env.example)" >&2
  exec "$@"
fi

# shellcheck disable=SC1091
source ./op-refs.sh

# Generic helper: fetch all three refs so commands like `--auth-check` can see
# every credential. Route-specific wrappers (run-secure-sweep.sh) fetch a
# narrower set when the route demands isolation.
export RESEARCH_SWEEPER_HELPER_ACTIVE=1
exec op-fetch \
  --pass RESEARCH_SWEEPER_HELPER_ACTIVE \
  ANTHROPIC_API_KEY="$OP_REF_ANTHROPIC_API_KEY" \
  OPENAI_API_KEY="$OP_REF_OPENAI_API_KEY" \
  CLAUDE_CODE_OAUTH_TOKEN="$OP_REF_CLAUDE_CODE_OAUTH_TOKEN" \
  GEMINI_API_KEY="$OP_REF_GEMINI_API_KEY" \
  -- "$@"
