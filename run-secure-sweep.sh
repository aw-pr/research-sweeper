#!/usr/bin/env bash
# Launch research-sweep.ts through op-fetch, fetching only the credentials the
# selected route actually needs. Route-specific isolation prevents accidental
# API-key billing on subscription/OAuth routes.
#
# Routes:
#   --claude-auth claude-oauth      → fetch CLAUDE_CODE_OAUTH_TOKEN only
#                                     (ANTHROPIC_API_KEY MUST be absent so the
#                                     Agent SDK cannot fall back to API billing)
#   --provider openai --sync        → fetch nothing op-based; the Codex CLI uses
#                                     ~/.codex/auth.json. Keeps OPENAI_API_KEY
#                                     out of the child env.
#   default (API-key path, batch)   → fetch ANTHROPIC_API_KEY + OPENAI_API_KEY
set -euo pipefail

cd "$(dirname "$0")"

claude_oauth=0
openai_sync=0
for ((i = 1; i <= $#; i++)); do
  if [[ "${!i}" == "--claude-auth" ]]; then
    next=$((i + 1))
    if [[ $next -le $# ]]; then
      case "${!next}" in
        claude-oauth|claude_oauth|agent-sdk|agent_sdk|claude-cli|claude_cli)
          claude_oauth=1
          ;;
      esac
    fi
  fi
  if [[ "${!i}" == "--provider" ]]; then
    next=$((i + 1))
    if [[ $next -le $# && "${!next}" == "openai" ]]; then
      openai_sync=1
    fi
  fi
done

# Graceful fallback: with no op-fetch resolver on PATH or no private refs file,
# 1Password is not configured here. Run the sweep directly; the in-process
# .env loader supplies provider keys instead.
if ! command -v op-fetch >/dev/null 2>&1 || [[ ! -f "./op-refs.local.sh" ]]; then
  echo "[run-secure-sweep] op-fetch/1Password not configured — running with .env (see .env.example)" >&2
  exec npx ts-node research-sweep.ts "$@"
fi

# shellcheck disable=SC1091
source ./op-refs.sh

if [[ "$claude_oauth" == "1" ]]; then
  exec op-fetch \
    CLAUDE_CODE_OAUTH_TOKEN="$OP_REF_CLAUDE_CODE_OAUTH_TOKEN" \
    -- npx ts-node research-sweep.ts "$@"
fi

if [[ "$openai_sync" == "1" && " $* " == *" --sync "* ]]; then
  # Codex auth route: no op refs needed. Still go through op-fetch with no pairs
  # so we get the same sanitized child env (no inherited OPENAI_API_KEY etc.).
  exec op-fetch -- npx ts-node research-sweep.ts "$@"
fi

# Default API-key route (sync or batch). Fetch both provider keys.
exec op-fetch \
  ANTHROPIC_API_KEY="$OP_REF_ANTHROPIC_API_KEY" \
  OPENAI_API_KEY="$OP_REF_OPENAI_API_KEY" \
  -- npx ts-node research-sweep.ts "$@"
