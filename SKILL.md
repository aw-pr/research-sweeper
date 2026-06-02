---
name: research-sweep
description: "Runs parallel-lane technology research via the research-sweeper MCP, comparing tools/frameworks/approaches and producing Obsidian-ready markdown notes with synthesis. Use when the user asks to compare technologies, evaluate a tech stack, run a tech sweep, research multiple options, or produce research notes for Obsidian."
---

## Claude.ai Compatibility

- Exported for Claude.ai compatibility.
- See `README.md` in this skill bundle for full portability notes.
- Strict mode enabled.

# Research Sweep

## When to use

Trigger on phrases like: "compare X and Y", "research these options", "tech sweep on…", "evaluate this stack", "produce research notes", "run a sweep on…".

Specifically:
- The user wants parallel research lanes (multiple sources/providers) with a synthesis pass.
- The user wants Obsidian-ready markdown output.
- The user references the `research-sweeper` repo or its MCP.

## Workflow

1. **Confirm scope** — topic, lanes, depth, provider, output folder.
2. **Load brief** — if a markdown brief exists, pass it via `run_sweep`'s `brief_file` argument instead of retyping the topic and sub-questions.
3. **Run sweep** — call `run_sweep` (it runs as a batch and returns a `batchId`). Do NOT shell out to raw `npx ts-node` for secret-backed routes.
4. **Poll** — `check_sweep_status` until the batch completes (omit `batch_id` to list all pending).
5. **Verify outputs exist** — check the output folder before reporting success.
6. **Synthesise** — default synthesis model is `claude-opus-4-8`; override via `synthesis_model`. Use `resynthesize` to rebuild a report from cached lane data without re-fetching.

## MCP tools (preferred surface)

Use the `research-sweeper` MCP. The CLI and shell wrappers are implementation details behind it — fallbacks, not first choice.

| Tool | Purpose | Key arguments |
|---|---|---|
| `run_sweep` | Submit a multi-lane sweep; runs as a **batch**, returns a `batchId`. | `topic` (required); `brief_file`; `depth` (`shallow`=5 / `standard`=10 / `deep`=20 sources); `lanes` (any of `financial, frontier, academic, vc, blogs, tech`; default all six); `provider` (`claude` / `openai` / `gemini`, default `claude`); `from_year` / `to_year`; `folder`; `synthesis_model`; `overwrite`. |
| `check_sweep_status` | Poll a batch; omit `batch_id` to list all pending. | `batch_id` |
| `list_runs` | List completed sweeps, newest first, with token usage and cost. | `limit` (default 20) |
| `resynthesize` | Regenerate the synthesis brief from cached lane data — no re-fetch. | `folder` (required) |

Output lands under `RESEARCH_SWEEPER_OUTPUT_DIR` (default `~/obsidian/research`), one folder per topic slug; summaries include a Mermaid timeline section.

## Shell fallbacks (only when MCP is unavailable)

| Need | Command |
|---|---|
| API-key batch/list/resume | `./batch-search.sh`, `./list-batches.sh`, `./resume-batch.sh` |
| Claude OAuth smoke test | `./run-secure-command.sh env -u ANTHROPIC_API_KEY npx ts-node research-sweep.ts --auth-check claude-oauth` |
| Claude OAuth sync (Max/Pro quota) | `./run-secure-sweep.sh --sync --provider claude --claude-auth claude-oauth ...` |
| OpenAI Codex sync | `./run-secure-sweep.sh --sync --provider openai ...` |
| Gemini API-key sync or batch | `npm run sweep:gemini -- ...` / `npm run sweep:secure:gemini -- ...` |
| Gemini OAuth sync (GCP-billed) | `./run-secure-sweep.sh --sync --provider gemini --gemini-auth gemini-oauth ...` |

## Auth & billing safety

`run-secure-sweep.sh` strips `ANTHROPIC_API_KEY` from the child environment after `op run` hydrates `.env`, and the provider also removes it in-process before importing the Agent SDK. This is what prevents accidental API-key billing during Claude OAuth sync — the protection lives in two places by design.

**Do not** run Claude OAuth sync as raw `npx ts-node research-sweep.ts ...` unless `CLAUDE_CODE_OAUTH_TOKEN` is exported as a real token in that shell. Raw invocations bypass `.env` and `op://` hydration.

For OpenAI: `--sync --provider openai` strips `OPENAI_API_KEY` before invoking `codex exec`.

For Gemini: on `--gemini-auth gemini-oauth`, `run-secure-sweep.sh` injects no Gemini key via `op-fetch`; `GOOGLE_ACCESS_TOKEN` must be present in the caller environment. The provider strips `GEMINI_API_KEY` in-process as a belt-and-suspenders guard. Note: the `gemini-oauth` route is **GCP-billed** — it is not a free or subscription-quota path. Batch mode hard-fails with `gemini-oauth`; use the API-key route for batch.

**Gemini known limitations:** Free-tier keys hit `generate_content` rate limits (~5 RPM flash / ~10 RPM flash-lite) — multi-lane sweeps require a paid-tier key. A GCP trial billing account does not unlock paid-tier limits. The Batch API and `gemini-2.5-pro` both require billing; free-tier returns `400 FAILED_PRECONDITION`. Google Search grounding and native JSON mode are mutually exclusive — the provider uses a tolerant parser. Some lanes may return empty output due to upstream safety/grounding blocks; this is benign. Collect batches via `./run-secure-sweep.sh --resume <id> --provider gemini` to avoid the Claude both-keys guard.

## Quality rules (synthesis pass)

Apply these to every report the synthesis step produces:

1. **Every claim needs a source.** No unsourced assertions in the report body.
2. **Cross-reference.** If only one source supports a claim, flag it as unverified rather than presenting it as fact.
3. **Recency matters.** Prefer sources from the last 12 months unless the topic is intentionally historical. Note publication dates inline where it changes the weight of the claim.
4. **Acknowledge gaps.** If a sub-question returned weak or no evidence, say so in the report rather than padding around it.
5. **No hallucination.** "Insufficient data found" beats a confident guess.
6. **Separate fact from inference.** Label estimates, projections, and opinions explicitly, so they do not sit alongside cited facts unmarked.

## Banned phrases (synthesis pass)

The synthesis output is prose, so the iTone hard rules apply. Delete and rewrite any of these on sight:

- "in today's rapidly evolving landscape" / "rapidly changing world"
- "game-changer", "cutting-edge", "revolutionary"
- "here's why this matters" as a standalone bridge
- AI tell-tales: "delve", "it's worth noting", "in conclusion", "fascinating", "certainly"
- bait questions or rhetorical questions as section headers
- generic AI throat-clearing that delays the point
- closing question added only to juice engagement

British English, no em dashes, to match the rest of the iTone surface.

## Source of truth

- [AGENTS.md](<LOCAL_PATH>)
- [CLAUDE.md](<LOCAL_PATH>)
- [README.md](<LOCAL_PATH>)
