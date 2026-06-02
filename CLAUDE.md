# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What this repo is

A multi-lane research harness that writes Obsidian-ready outputs. It supports `claude`, `openai`, and `gemini`, plus subscription/OAuth auth routes: Codex auth for OpenAI sync execution, Claude Agent SDK OAuth (Max/Pro OAuth) for Claude sync execution, and Google OAuth access token for Gemini sync execution (GCP-billed).

## Publishing

Private work → public mirror. Remotes: `origin` = private working remote
(messy history fine), `aw-pr` = public mirror. Work on `wip/*` topic branches,
squash-merge into the **`publish`** branch, run `git publish` (never hand-push
to `aw-pr`; the fail-closed pre-push gate blocks it). Every `publish` commit
goes public; never rewrite commits already on the public remote. Full model +
setup: `docs/PUBLISH-WORKFLOW.md`. Gate config lives in local `git config`
(`publishguard.*`) and personal block patterns in the gitignored
`.publish-guard.local` — neither is committed.

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

### Gemini auth routes

Two credential routes are supported via `--gemini-auth api-key|gemini-oauth`. The CLI flag is Gemini-specific and has no effect on other providers.

#### API-key route (default, supports batch)

```bash
npm run sweep:gemini -- --brief-file "prompts/example.md" --from 2023 \
  --lanes financial,frontier,academic,vc,blogs,tech --depth standard --folder "..."
npm run sweep:gemini:deep -- --brief-file "prompts/example.md" --folder "..."
npm run sweep:secure:gemini -- --brief-file "prompts/example.md" --folder "..."
```

- `GEMINI_API_KEY` is injected by `op-fetch` (op-ref: `OP_REF_GEMINI_API_KEY`) on the secure path, or read from `.env`/`.env.local` on the fallback path.
- Supports both sync and batch modes. Batch requires the API key; `gemini-oauth` hard-fails in batch mode.

#### gemini-oauth route (sync-only, GCP-billed)

```bash
./run-secure-sweep.sh --sync --provider gemini --gemini-auth gemini-oauth \
  --brief-file "prompts/example.md" --lanes blogs,tech --depth shallow --folder "..."
```

- Uses a Google OAuth access token (`GOOGLE_ACCESS_TOKEN`) passed as a Bearer header via `@google/genai` `httpOptions`. **This is GCP-billed, not a consumer-subscription equivalent of the Claude Max/Pro or Codex routes.**
- Sync-only. Batch mode hard-fails if `--gemini-auth gemini-oauth` is set.
- On `gemini-oauth`, `run-secure-sweep.sh` injects no Gemini key via `op-fetch`; `GOOGLE_ACCESS_TOKEN` must already be present in the caller environment (e.g. from `gcloud auth print-access-token`). `GEMINI_API_KEY` is stripped in-process by the provider as a belt-and-suspenders guard.
- Auto-detect precedence: `GEMINI_API_KEY` wins when both are present. `gemini-oauth` is only selected by explicit flag, or when `GEMINI_API_KEY` is absent and `GOOGLE_ACCESS_TOKEN` is set.

#### Gemini search

Gemini lanes use Google Search grounding via `@google/genai` (`tools: [{ googleSearch: {} }]`). Grounding **cannot be forced** — the model decides whether to invoke it. This differs from the Anthropic/OpenAI paths where `tool_choice: any` forces a search call. Under `--no-search`, grounding is omitted entirely. Source selection may therefore diverge from claude/openai lanes; `runs/stats.json` records `authMode` per run so cross-provider comparisons stay honest.

#### Gemini provider — known limitations

**Free-tier rate limits.** The free tier of Google AI Studio enforces `generate_content` rate limits of approximately 5 RPM for `gemini-2.5-flash` and 10 RPM for `gemini-2.5-flash-lite` (as of May 2026). Multi-lane grounded sweeps run several parallel requests and will hit these limits. A GCP trial billing account does **not** grant paid-tier rate limits — only a billing-enabled project with prepaid credits or a GCP project with active billing attached to a real payment method does. `gemini-2.5-pro` is a paid-tier model and is rejected on free-tier keys.

**Batch API requires paid tier.** The Gemini Batch API (used for async lane and synthesis submission) is gated behind billing. Free-tier keys return `400 FAILED_PRECONDITION` or `429 RESOURCE_EXHAUSTED` on batch create calls. The provider surfaces a clear actionable error when this gate fires. Enable prepaid billing in Google AI Studio, or use a billing-attached GCP project via `--gemini-auth gemini-oauth`.

**Google Search grounding vs JSON mode.** Google Search grounding and native JSON structured output (`responseMimeType: application/json`) are mutually exclusive in the Gemini API. The provider therefore does not request structured output; instead it relies on the tolerant `parseLaneResponse()` parser to extract the JSON payload from the text response. This means some responses may fall back to the plain-text `fallbackLaneResult()` path when the model returns incomplete or non-JSON output.

**Empty-lane output.** Some lanes can return 0 sources and 0 output tokens with `finishReason` other than `STOP`. This is benign upstream behaviour: Gemini's content-safety or grounding filters blocked the generation. It is not a provider bug. The lane is recorded with an empty result; the synthesis step proceeds with whatever lanes did return content.

**Batch collection and the Claude both-keys guard.** Collecting pending Gemini batch jobs via the all-keys helper (`run-secure-command.sh`) loads all `OP_REF_*` variables and may trip the Claude both-keys auth guard (which prevents a process holding both `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`). Collect Gemini, Claude, and OpenAI batch results via the route-aware wrapper:

```bash
./run-secure-sweep.sh --resume <batch-id> --provider gemini
./run-secure-sweep.sh --resume <batch-id> --provider claude --claude-auth api-key
./run-secure-sweep.sh --resume <batch-id> --provider openai
```

## Output behavior

- Normal runs create `_research-sweeper-stub.md` in the target folder before the sweep starts.
- The CLI refuses to overwrite existing `summary-*`, `sources-*`, and lane files unless `--overwrite` is set.
- Re-synthesis is allowed to rewrite existing generated outputs.
- Deep and standard summaries include a `## Timeline` near the top: a Mermaid `timeline` of concept-level milestones (not a paper list). Granularity scales to the span — quarters (≤3yr), half-years (>3yr), whole years (≥10yr) — with flat `H1 2023`-style period labels and no `section`. Shallow summaries omit it, as do sweeps with fewer than three datable events. Defined per depth in `config/depths.json` (`synthGuide`); rendered as standard Mermaid in Obsidian and as a custom chevron layout by the downstream publishing site.

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
- `src/providers/gemini.ts`
- `src/output.ts`
- `src/mcp-server.ts`
- `src/stats.ts`

Flows:

1. CLI resolves config and auth mode.
2. `prepareOutputTarget()` creates the stub and blocks accidental overwrite.
3. Lanes run in parallel or submit as batch jobs. Each lane uses `web_search_20250305` (forced via `tool_choice: any`) for claude/openai, and Google Search grounding (model-decided, not forced) for gemini. Each lane returns `sources`, `narrative`, and `model_context` (structured background knowledge separate from retrieved sources).
4. Synthesis (Opus / gemini-2.5-pro) combines sourced findings and `model_context`. In batch/resume mode, synthesis is itself submitted as a batch job for 50% cost discount (Gemini batch requires API-key auth).
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
- Claude synthesis: `claude-opus-4-8` by default (batched for 50% discount)
- OpenAI lanes: `gpt-5.4-mini` with `reasoning.effort=low`
- OpenAI synthesis: `gpt-5.5` with `reasoning.effort=high`
- Gemini shallow/standard lanes: `gemini-2.5-flash-lite` ($0.10/$0.40 per 1M tokens)
- Gemini deep lanes: `gemini-2.5-flash` ($0.30/$2.50 per 1M tokens)
- Gemini synthesis: `gemini-2.5-pro` ($1.25/$10.00 per 1M tokens)

Override Claude lane model per run: `--lane-model haiku` or `--lane-model sonnet`
`--lane-model` does NOT apply to Gemini; Gemini uses depth-based model selection like OpenAI.
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

- Keep `CLAUDE.md`, `AGENTS.md`, and `README.md` aligned when you change auth, lanes, models, or output behavior.
- `--brief-file` is the path that passes template sub-questions through to both the lanes and synthesis.
- `batch-search.sh`, `list-batches.sh`, `resume-batch.sh`, and `research-sweeper-mcp` should stay on the `op-fetch` path (via `run-secure-command.sh` / `run-secure-sweep.sh`) for API-key execution.
- Do not reintroduce OpenAI API-key reads from `~/.codex/auth.json`.
- `--no-search` disables `web_search` tool and `tool_choice` forcing for claude/openai; for gemini it omits the grounding tool entirely — use for fast/cheap model-knowledge-only runs.
- `--lane-model haiku|sonnet` overrides the depth-based Claude default lane model for that run. Has no effect on Gemini or OpenAI.
- `--claude-auth api-key|claude-oauth` picks Claude's credential route. Sync-only; batch mode rejects `claude-oauth`. The legacy alias `claude-cli` is still accepted.
- `--gemini-auth api-key|gemini-oauth` picks Gemini's credential route. `gemini-oauth` is sync-only and GCP-billed (not a consumer-subscription quota). Batch mode rejects `gemini-oauth`.
- `--openai-auth api-key|codex` picks OpenAI's credential route. `codex` is sync-only; batch mode rejects it. All three detectors are now symmetric: when both routes' credentials are present and no explicit flag is given, detection throws ("Refusing to guess") rather than silently billing API credits.
- Auth detection lives in `src/auth/detect.ts` (single source of truth for all providers). Batch guards call `requireApiKeyModeOrThrow()` from the same module. `buildRunStats()` lives in `src/stats.ts` (single copy).
- `--re-synthesise <folder>` honours `--claude-auth` / `--gemini-auth` / `--openai-auth` overrides, so a run captured under one route (e.g. `claude-oauth`) can be re-synthesised on the API-key route when only that credential is present.

## Skills are canonical here

`SKILL.md` (research-sweep) and `sweeper-prompt-creation/SKILL.md` are the canonical source files and are git-tracked in this repo. `mcp-hub/skills/` only holds symlinks pointing back at these files; `~/.claude/skills/` resolves through mcp-hub to here. Edit the skill files in place — do not "fix" the symlink direction or copy the content into mcp-hub. The single-source-of-truth chain keeps Claude Code / MCP automatically in sync with no copy step.
