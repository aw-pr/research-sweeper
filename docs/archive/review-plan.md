# Research Sweeper Security and Health Review Plan

## Summary

This repo now standardises API-key-backed runs on the secure helper path, preserves the Codex auth route, adds overwrite protection, and aligns the MCP launcher with the same headless model. The remaining external assumption is that `~/scripts/run-secure-with-op` can run outside restrictive sandbox boundaries and inject provider keys into the child process environment without printing them.

## Implemented changes

### Auth and secret handling

- Added `run-secure-command.sh` as the repo-local wrapper around `~/scripts/run-secure-with-op`.
- Switched `batch-search.sh`, `list-batches.sh`, `resume-batch.sh`, and `run-secure-sweep.sh` to use that wrapper.
- Switched `research-sweeper-mcp` to prefer the same helper-backed path instead of reading `.env.local` directly.
- Kept the Codex auth route intact through `~/.codex/auth.json`.
- Removed the OpenAI API-key fallback that read `OPENAI_API_KEY` from `~/.codex/auth.json`. OpenAI API-key mode now expects helper-injected env only.

### Headless auth verification

- Added `src/auth-check.ts`.
- Added CLI support for `npx ts-node research-sweep.ts --auth-check`.
- Added `npm run auth:check` and `npm run auth:check:secure`.
- The auth check:
  - inspects `.env` for `op://...` references
  - verifies live Anthropic auth when `ANTHROPIC_API_KEY` is present
  - verifies live OpenAI auth when `OPENAI_API_KEY` is present
  - verifies live Codex auth through `codex exec`

### Output safety

- Added `_research-sweeper-stub.md` creation before new runs.
- Added collision detection for `summary-*`, `sources-*`, lane markdown files, and `lanes-*.json`.
- Added `--overwrite` for explicit replacement of existing generated outputs.
- Left re-synthesis overwrite-enabled because regeneration is the purpose of that command.

### Docs and operator flow

- Updated `README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, and `prompts/sweep-template.md`.
- Made lane selection explicit in examples and prompts.
- Documented the secure-helper-first path and the Codex auth route separately.

## Secret surfaces

- Repo `.env`: should contain `op://...` references only.
- `~/scripts/run-secure-with-op`: external helper that resolves secrets and `exec`s the target command.
- External helper token source: local secret surface outside this repo.
- `~/.codex/auth.json`: intentional Codex auth surface.
- Runtime process env: transient materialisation surface for `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.

## Recommendations

### Keep

- Helper-backed API-key injection for Anthropic and OpenAI.
- Codex auth for the OpenAI sync route.
- Both MCP and skill surfaces, with the TypeScript CLI/core as the canonical implementation.

### Prefer

- `./batch-search.sh` for normal API-key-backed batch runs.
- `npx ts-node research-sweep.ts --sync --provider openai ...` for Codex-auth sync runs.
- `npm run auth:check:secure` after helper changes or credential rotation.

### Avoid

- Reintroducing `.env.local` as the normal MCP auth path.
- Reintroducing API-key reads from `~/.codex/auth.json`.
- Printing raw API keys from the helper instead of `exec`ing the target command with env populated.

## Remaining external dependency

The repo now assumes the best-practice model discussed in review:

1. The helper itself runs outside the restrictive sandbox boundary.
2. The helper reads its protected service-account secret non-interactively.
3. The helper runs `op run --env-file .env -- <command>`.
4. The child process receives provider API keys in env.
5. The helper does not print raw API keys.
