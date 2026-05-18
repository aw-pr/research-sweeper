# AGENTS.md

This file provides guidance to Codex when working in this repository.

## What this repo is

A multi-lane research harness that writes Obsidian-ready outputs. It supports `claude` and `openai`, plus two subscription auth routes: Codex auth for OpenAI sync execution, and Claude Agent SDK OAuth (Max/Pro OAuth) for Claude sync execution.

## Canonical run paths

### API-key-backed runs

Use the secure helper path:

```bash
./batch-search.sh --brief-file "prompts/example.md" --from 2022 --lanes financial,frontier,academic,vc,blogs,tech --depth deep --folder "ai-agent-orchestration"
./list-batches.sh
./resume-batch.sh 1
npm run auth:check:secure
```

- 1Password is optional. Without it, `run-secure-*.sh` detect that `op-fetch` or `op-refs.local.sh` is absent and exec the child directly; the in-process fill-only `.env`/`.env.local` loader (`src/env.ts`) supplies provider keys. See `.env.example`.
- `run-secure-command.sh` sources `op-refs.sh` and calls an `op-fetch` resolver on `PATH`. `op-fetch` resolves only the named refs, then execs the child with a sanitized env (small allowlist + the resolved keys, nothing else).
- `op-refs.sh` (committed) holds placeholder refs and sources a gitignored `op-refs.local.sh` (copy `op-refs.local.sh.example`) with the real vault/item refs. No private `op://` strings appear in the tracked tree.
- `op-fetch` sources `OP_SERVICE_ACCOUNT_TOKEN` from `$OP_SERVICE_ACCOUNT_ENV` (defaults to the standard op service-account env file, chmod 600) per call so it runs headlessly — no 1Password biometric or TCC prompts. Works in tmux, headless sessions, and under MCP parents.

### Codex auth route (OpenAI sync)

OpenAI sync runs can use Codex CLI auth (the standard Codex `auth.json`, created by `codex login`):

```bash
npx ts-node research-sweep.ts --sync --provider openai --brief-file "prompts/example.md" --from 2022 --lanes financial,frontier,academic,vc,blogs,tech --depth standard --folder "..."
```

Do not remove this route.

When OpenAI sync is launched through `./run-secure-sweep.sh --sync --provider openai ...`, the wrapper and provider remove `OPENAI_API_KEY` before `codex exec` runs. This keeps the route on Codex/ChatGPT auth instead of silently using API-key billing.

### Claude Agent SDK OAuth route (Claude sync, Max/Pro quota)

Claude sync runs can consume Max/Pro subscription quota via the Agent SDK. Use the route-aware wrapper so `op-fetch` resolves only the OAuth token into the child process:

```bash
./run-secure-sweep.sh --sync --provider claude --claude-auth claude-oauth --auth-check claude-oauth
./run-secure-sweep.sh --sync --provider claude --claude-auth claude-oauth \
  --brief-file "prompts/example.md" --lanes blogs,tech --depth shallow --folder "..."
```

- Sync-only. Batch mode hard-fails if combined with `--claude-auth claude-oauth` (batch API requires API-key auth).
- Run the smoke test first for expensive sweeps. It passes only if the live Agent SDK call works with `CLAUDE_CODE_OAUTH_TOKEN` set and `ANTHROPIC_API_KEY` absent.
- On `--claude-auth claude-oauth`, `run-secure-sweep.sh` calls `op-fetch CLAUDE_CODE_OAUTH_TOKEN=$OP_REF_CLAUDE_CODE_OAUTH_TOKEN -- ...` only — `ANTHROPIC_API_KEY` is never resolved or set in the child env. The provider also removes `ANTHROPIC_API_KEY` in-process before importing the Agent SDK as a belt-and-suspenders second guard.
- A raw `npx ts-node research-sweep.ts ...` command does not invoke `op-fetch`; it only works if `CLAUDE_CODE_OAUTH_TOKEN` is already exported as a real token in that shell.
- Auto-detect precedence: API key wins when both are present. `claude-oauth` is only selected by explicit flag, or when `ANTHROPIC_API_KEY` is absent and the OAuth token is set. The legacy alias `claude-cli` is still accepted.
- Search divergence: the Agent SDK exposes the built-in `WebSearch` tool, not the API's `web_search_20250305`. Source selection may differ vs. the API-key path. `runs/stats.json` records `authMode` per run so cross-route comparisons stay honest.

## Output behavior

- Normal runs create `_research-sweeper-stub.md` in the target folder before the sweep starts.
- The CLI refuses to overwrite existing `summary-*`, `sources-*`, and lane files unless `--overwrite` is set.
- Re-synthesis is allowed to rewrite existing generated outputs.

Files written to `$RESEARCH_SWEEPER_OUTPUT_DIR/<folder>/` (defaults to `~/obsidian/research/<folder>/`):

- `summary-<slug>.md`
- `sources-<slug>.md`
- `lanes/lane-<name>-<slug>.md`
- `lanes/lanes-<slug>.json`
- `_research-sweeper-stub.md`

## Architecture

Core files:

- `research-sweep.ts` — CLI entrypoint
- `src/providers/claude.ts`
- `src/providers/openai.ts`
- `src/output.ts`
- `src/mcp-server.ts`
- `src/stats.ts`

Flows:

1. CLI resolves config and auth mode.
2. `prepareOutputTarget()` creates the stub and blocks accidental overwrite.
3. Lanes run in parallel or submit as batch jobs. Each lane uses `web_search_20250305` (forced via `tool_choice: any`) and returns `sources`, `narrative`, and `model_context` (structured background knowledge separate from retrieved sources).
4. Synthesis (Opus) combines sourced findings and `model_context`. In batch/resume mode, synthesis is itself submitted as a batch job for 50% cost discount.
5. `appendRunStats()` records run metadata in `runs/stats.json`.

## Lanes and models

Lanes:

- `financial` — enterprise adoption, regulation, market structure
- `frontier` — lab releases, model/research announcements, METR evaluations
- `academic` — papers, benchmarks, empirical results
- `vc` — investment theses, analyst reports, market sizing
- `blogs` — independent analysis (Substack primary, plus Medium, LessWrong, personal blogs); also validates claims from a referenced post
- `tech` — practitioner & methodology sources (DORA, ThoughtWorks Radar, Martin Fowler, InfoQ, IEEE Software, ACM Queue, HBR/MIT Sloan, CNCF) for engineering practice and IT leadership

Model defaults:

- Claude shallow/standard lanes: `claude-haiku-4-5-20251001`
- Claude deep lanes: `claude-sonnet-4-6` (truncation risk at 25 sources)
- Claude synthesis: `claude-opus-4-7` by default (batched for 50% discount)
- OpenAI lanes: `gpt-5.4-mini` with `reasoning.effort=low`
- OpenAI synthesis: `gpt-5.5` with `reasoning.effort=high`

Override Claude lane model per run: `--lane-model haiku` or `--lane-model sonnet`
Override synthesis per run: `--synthesis-model <model>`

## Commands worth knowing

```bash
npm run typecheck
npx ts-node research-sweep.ts --stats
npx ts-node research-sweep.ts --auth-check
npx ts-node research-sweep.ts --re-synthesise <folder>
./research-sweeper-mcp
```

## Notes

- Keep `AGENTS.md`, `CLAUDE.md`, and `README.md` aligned when you change auth, lanes, models, or output behavior.
- `--brief-file` is the path that passes template sub-questions through to both the lanes and synthesis.
- `batch-search.sh`, `list-batches.sh`, `resume-batch.sh`, and `research-sweeper-mcp` should stay on the `op-fetch` path (via `run-secure-command.sh` / `run-secure-sweep.sh`) for API-key execution.
- Do not reintroduce OpenAI API-key reads from `~/.codex/auth.json`.
- `--no-search` disables `web_search` tool and `tool_choice` forcing — use for fast/cheap model-knowledge-only runs.
- `--lane-model haiku|sonnet` overrides the depth-based Claude default lane model for that run.
- `--claude-auth api-key|claude-oauth` picks Claude's credential route. Sync-only; batch mode rejects `claude-oauth`. The legacy alias `claude-cli` is still accepted.
- Auth detection lives in `src/auth/detect.ts` (single source of truth for both providers). Batch guards call `requireApiKeyModeOrThrow()` from the same module. `buildRunStats()` lives in `src/stats.ts` (single copy).

## Skills are canonical here

`SKILL.md` (research-sweep) and `sweeper-prompt-creation/SKILL.md` are the canonical source files and are git-tracked in this repo. `mcp-hub/skills/` only holds symlinks pointing back at these files; `~/.claude/skills/` resolves through mcp-hub to here. Edit the skill files in place — do not "fix" the symlink direction or copy the content into mcp-hub. The single-source-of-truth chain keeps Codex / MCP automatically in sync with no copy step.
