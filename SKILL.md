---
name: research-sweep
description: "Runs parallel-lane research via the research-sweeper CLI, comparing tools/frameworks/approaches/topics and producing Obsidian-ready markdown notes with synthesis. Use when the user asks to compare technologies, evaluate a stack, run a research sweep, research multiple options, or produce research notes for Obsidian."
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
- The user references the `research-sweeper` repo or its CLI.

## Workflow

1. **Confirm scope** — topic, lanes, depth, provider, output folder.
2. **Load brief** — if a markdown brief exists, pass it via `--brief-file <path>` instead of retyping the topic and sub-questions. It feeds both the lanes and synthesis.
3. **Run sweep** — drive the secure CLI wrapper (see Command surface). Default mode is **batch** (submits and prints a `batchId`); add `--sync` for an immediate single-shot result. Always pass `--topic` — without it the CLI drops to an interactive prompt and stalls in a non-interactive shell; redirect `< /dev/null` as a guard.
4. **Poll / collect** — for batch runs, list with `./list-batches.sh` and collect a finished batch with `./run-secure-sweep.sh --resume <id> --provider <p>`.
5. **Verify outputs exist** — check the output folder before reporting success.
6. **Synthesise** — default synthesis model is `claude-opus-4-8`; override via `--synthesis-model`. Rebuild a report from cached lane data without re-fetching via `--re-synthesise <folder>`.

## Command surface

> The in-process MCP server was **retired on 2026-06-08** — it launched with an empty environment, never called `op-fetch`, and could not authenticate any provider. The secure CLI wrappers below are the only supported surface. Do not reintroduce the MCP.

Run from the `research-sweeper` repo root. The secure wrappers resolve API keys headlessly via the 1Password service account (see Auth & billing safety).

**Provider routes:**

| Provider | Command |
|---|---|
| Claude (default) / OpenAI | `npm run sweep:secure -- [--provider openai] ...` |
| Gemini | `npm run sweep:secure:gemini -- ...` |

**Common flags** (these map 1:1 to the old tool arguments):

`--topic "<string>"` (required) · `--brief-file <path>` · `--depth shallow|standard|deep` (5 / 10 / 20 sources) · `--lanes financial,frontier,academic,vc,blogs,tech` (default all six) · `--from <year>` / `--to <year>` · `--folder <name>` · `--synthesis-model <model>` · `--overwrite` · `--sync` (single-shot; omit for batch).

Example — deep Claude batch:

```bash
npm run sweep:secure -- --topic "…" --brief-file prompts/x.md \
  --depth deep --lanes financial,academic,blogs --from 2014 \
  --folder my-topic < /dev/null
```

**Manage runs:**

| Need | Command |
|---|---|
| List / poll batches | `./list-batches.sh` |
| Collect a finished batch | `./run-secure-sweep.sh --resume <id> --provider <claude\|openai\|gemini>` |
| List completed sweeps + token cost | `npx ts-node research-sweep.ts --stats` |
| Re-synthesise from cached lanes (no re-fetch) | `npx ts-node research-sweep.ts --re-synthesise <folder>` |
| Auth check | `npm run auth:check` (or `npm run auth:check:secure`) |

**Auth-route overrides** (subscription / OAuth / GCP-billed variants):

| Route | Command |
|---|---|
| Claude Max/Pro OAuth sync | `./run-secure-sweep.sh --sync --provider claude --claude-auth claude-oauth ...` |
| OpenAI Codex sync | `./run-secure-sweep.sh --sync --provider openai --openai-auth codex ...` |
| Gemini OAuth sync (GCP-billed) | `./run-secure-sweep.sh --sync --provider gemini --gemini-auth gemini-oauth ...` |
| Gemini API-key batch | `npm run sweep:gemini -- ...` (needs paid-tier billing) |

Output lands under `RESEARCH_SWEEPER_OUTPUT_DIR` (default `~/obsidian/research`), one folder per topic slug; deep and standard summaries include a Mermaid timeline section.

## Auth & billing safety

### Headless auth (service account — no biometrics)

The secure wrappers resolve every `op://` ref through `op-fetch`, which sources a 1Password **service-account token** from `$OP_SERVICE_ACCOUNT_ENV` (default `~/.config/op/service-account.env`, chmod 600). This means the secure routes run **unattended — no `op signin`, no biometric prompt**. An empty `op whoami` (the interactive *user-account* session) does NOT block them; the service account is a separate credential. If a secure route fails with `OP_SERVICE_ACCOUNT_TOKEN not set and <file> not readable`, that token file is the thing to restore — not a desktop unlock.

### Why the CLI, not the MCP

The retired MCP server was launched with an empty environment and never called `op-fetch`, so it had no working auth for **any** provider — Gemini, Claude and OpenAI sweeps through it all failed with `<provider> auth not configured`. Every secret-backed sweep goes through the secure wrapper, which resolves keys headlessly via the service account above: `npm run sweep:secure -- ...` (Claude/OpenAI) or `npm run sweep:secure:gemini -- ...`.

### Billing-route guards

`run-secure-sweep.sh` strips `ANTHROPIC_API_KEY` from the child environment after `op run` hydrates `.env`, and the provider also removes it in-process before importing the Agent SDK. This is what prevents accidental API-key billing during Claude OAuth sync — the protection lives in two places by design.

**Do not** run Claude OAuth sync as raw `npx ts-node research-sweep.ts ...` unless `CLAUDE_CODE_OAUTH_TOKEN` is exported as a real token in that shell. Raw invocations bypass `.env` and `op://` hydration.

For OpenAI: `--sync --provider openai` strips `OPENAI_API_KEY` before invoking `codex exec`.

For Gemini: on `--gemini-auth gemini-oauth`, `run-secure-sweep.sh` injects no Gemini key via `op-fetch`; `GOOGLE_ACCESS_TOKEN` must be present in the caller environment. The provider strips `GEMINI_API_KEY` in-process as a belt-and-suspenders guard. Note: the `gemini-oauth` route is **GCP-billed** — it is not a free or subscription-quota path. Batch mode hard-fails with `gemini-oauth`; use the API-key route for batch.

**Reading a Gemini `429`:** two distinct causes, do not conflate them. `RESOURCE_EXHAUSTED` with *"Your prepayment credits are depleted"* means a **paid prepay project with a zero balance** — auth and billing are correctly wired, just top up credits in AI Studio; it is not a free-tier or auth fault. A `429` quoting an RPM/RPD quota is the **free-tier rate limit** below. If lanes retry 3× then all fail `RESOURCE_EXHAUSTED`, check the message before assuming the key is wrong.

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
