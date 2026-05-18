# Plan: Claude Max/Pro auth route for sync sweeps

## Motivation

Anthropic API-key credits and claude.ai subscription quota are two separate buckets. When the user doesn't fully consume their Max/Pro monthly quota it's effectively dead money. A sync sweep (6 lanes + synthesis) is a reasonable consumer of that quota and can be routed through Claude Code's OAuth auth instead of burning API credits.

This plan adds a **`claude_cli`** auth mode to the Claude provider, mirroring the existing `codex_cli` route on the OpenAI side.

## Non-goals

- **Batch mode via Max quota.** The Anthropic batch API (`/v1/messages/batches`) is API-key only. It bills against pay-as-you-go credits and will not accept OAuth session auth. This route is **sync-only**, just like the existing OpenAI Codex route.
- **Replacing the API-key path.** API-key remains the default and the only option for `batch-search.sh`, `resume-batch.sh`, and the MCP server's batch tools. The Codex route is still OpenAI-only.

## Open questions the executing agent must resolve before coding

These shape the architecture. Don't skip them.

1. **Which CLI/SDK is the bridge?**
   - Option A: shell out to the `claude` CLI (`claude --print ...`), parsing stdout. Mirrors the existing `runViaCodexCli()` pattern in `src/providers/openai.ts:114`.
   - Option B: use the `@anthropic-ai/claude-agent-sdk` npm package programmatically with OAuth/session auth.
   - **Decide based on:** which surface supports passing a *custom* tool definition (specifically `web_search_20250305` with `tool_choice: any`), which is critical — that's the tool the lane prompts rely on to anchor searches. If neither CLI nor SDK lets you forward that tool through to the underlying model call, fall back to Claude Code's *built-in* WebSearch tool, which is a different implementation with different mechanics and likely different result quality. **Flag this to the user before implementing** if the behaviour diverges.

2. **Is Sonnet 4.6 / Opus 4.5 reachable via OAuth?**
   - Confirm the OAuth/subscription path exposes `claude-sonnet-4-6` for lanes and `claude-opus-4-5` for synthesis. If only a subset of models is reachable, the `getModels()` function has to branch on auth mode, not just on depth.
   - If models are gated, document the fallback mapping clearly.

3. **Rate limits and quota windows.**
   - Max has rolling 5-hour windows rather than per-request RPM limits the way API keys do. Six parallel lane calls followed by a synthesis call may or may not exhaust the window.
   - Confirm whether lane calls should run **sequentially** on this path rather than in parallel, to avoid burst-rejecting.
   - This differs from the API-key path where `Promise.all` over lanes is fine.

4. **Structured output.**
   - API-key sync/batch both rely on the model returning a JSON blob that `parseLaneResponse()` (`src/parsing.ts`) can extract. The `claude` CLI may wrap output (tool-call narration, metadata) in ways that confuse the parser. Confirm the raw output shape and, if needed, tighten `parseLaneResponse()` to be more tolerant, or extract a specific code fence.

5. **Usage/cost accounting.**
   - The CLI or SDK needs to surface input/output token counts per call so `appendRunStats()` keeps working. If it doesn't expose usage, `RunStats` on this path will show zeros — document that or compute an estimate.

## Architecture

### Auth detection

Mirror the OpenAI provider's `getAuthMode()` pattern (`src/providers/openai.ts:84-95`).

Add to `ClaudeProvider`:

```typescript
type ClaudeAuthMode = "api_key" | "claude_cli";

private getAuthMode(): ClaudeAuthMode {
  if (process.env.ANTHROPIC_API_KEY) return "api_key";
  if (this.hasClaudeCliAuth()) return "claude_cli";
  throw new Error("Error: Claude auth not configured. Provide ANTHROPIC_API_KEY via the secure helper, or login with `claude` CLI (OAuth).");
}
```

`hasClaudeCliAuth()` should check for the presence and freshness of the Claude Code session file. The path is OS-dependent — typically `~/.claude/.credentials.json` on macOS, but the executing agent must verify. Do not read the file contents; existence + last-modified freshness is enough.

**Precedence decision:** If both `ANTHROPIC_API_KEY` and a CLI session are present, default to API key (predictable cost, batch-capable). Let the user opt into CLI explicitly via a new flag: `--claude-auth claude-cli`.

### runLane branching

```typescript
async runLane(config, lane) {
  if (this.getAuthMode() === "api_key") {
    // existing SDK path unchanged
  } else {
    // shell out / SDK call, parse output
  }
}
```

Do **not** add the branching inline — extract the API-key path into `runLaneViaApi()` and the new path into `runLaneViaClaudeCli()` for clarity.

### runSynthesis branching

Same pattern. Synthesis has no tool-use — it's a single text completion, so this path is simpler.

### Batch blocking

`submitBatchLanes`, `getBatchStatus`, `collectBatchResults`, `submitBatchSynthesis`, and `collectBatchSynthesisResult` should throw a clear error in `claude_cli` mode, matching the OpenAI provider's pattern (`src/providers/openai.ts:243-245`).

### CLI flag

Add to `research-sweep.ts` arg parsing:

```
--claude-auth api-key|claude-cli   (default: api-key if env var present, else auto-detect)
```

The flag must be respected by `--sync` mode. In `--batch` mode, passing `--claude-auth claude-cli` should hard-fail with the reason. `batch-search.sh` should *not* forward this flag; it's sync-only.

### Helper scripts

- `batch-search.sh` — no change. Batch path stays API-key.
- `list-batches.sh`, `resume-batch.sh` — no change. Both hit batch API.
- `research-sweeper-mcp` — consider whether the MCP `run_sweep` tool should expose `claude_auth` as a parameter. Probably yes for sync sweeps launched from Claude Desktop, so it can opt into its own quota. Check `src/mcp-server.ts` `run_sweep` schema.

### Auth-check integration

`src/auth-check.ts` should report whichever mode is active for each provider and test it end-to-end with a minimal call. Add a `claude_cli` branch that does a tiny sync call (e.g. `"say hi"`) and verifies the output looks sensible.

## Files to change

| File | Change |
|------|--------|
| `src/providers/claude.ts` | Main implementation. Add auth mode, split `runLane`/`runSynthesis` into API and CLI variants, block batch ops in CLI mode. |
| `src/types.ts` | Extend `SweepConfig` with `claudeAuth?: "api_key" \| "claude_cli"`. Keep optional — undefined means auto-detect. |
| `research-sweep.ts` | Parse `--claude-auth` flag, plumb into `SweepConfig`, hard-fail if combined with `--batch`. |
| `src/auth-check.ts` | Add `claude_cli` probe. |
| `src/mcp-server.ts` | Optionally expose `claude_auth` on the `run_sweep` tool schema (sync-only). |
| `README.md`, `CLAUDE.md`, `AGENTS.md` | Document the new route and its sync-only constraint. |
| `completions.zsh` | Add completions for `--claude-auth` values. |
| `customisation.md` | Add a section explaining the cost tradeoff (API credits vs. Max quota) so future-you remembers *why* both exist. |

## Risks and gotchas

- **Search tool divergence.** If the CLI/SDK path can't pass `web_search_20250305` through, lanes on this path will search with different mechanics. This is a material change to output quality and should be documented loudly. The whole point of this project is anchored, sourced research — if searches behave differently on one auth route, users need to know.
- **Max quota displacement.** Running a deep sweep burns quota that could have gone to interactive Claude Code use later the same day. Worth calling out in docs so future-you doesn't accidentally tank a coding session by launching a large sweep.
- **Token counting fidelity.** If the CLI path doesn't return clean usage numbers, `runs/stats.json` loses accuracy on that path. Either mark those rows as `"tokens_source": "estimated"` or document the limitation.
- **Session expiry.** OAuth sessions can expire or require re-auth. The auth-check should probe this; a sweep that fails mid-flight because the session lapsed is a bad UX.
- **Sequential vs parallel lanes.** If rate limits force sequential execution, the user-facing wall-clock time for a 6-lane deep sweep could be 5–10× longer than the API-key sync path. Not a blocker but worth measuring and documenting.

## Acceptance criteria

1. `--sync --claude-auth claude-cli` completes a full 6-lane deep sweep using OAuth session auth with no `ANTHROPIC_API_KEY` set in the environment.
2. Lane output quality is comparable to the API-key path (same source-count-per-lane, similar narrative depth). Document any divergence in `customisation.md`.
3. `--batch` combined with `--claude-auth claude-cli` fails fast with a clear error.
4. `npm run typecheck` passes.
5. `research-sweep.ts --auth-check` reports the active Claude auth mode and probes it successfully.
6. `runs/stats.json` records the auth mode on each run so cost reporting can distinguish.
7. README/CLAUDE.md/AGENTS.md reflect the new route alongside the existing Codex-for-OpenAI route.

## Reference: existing Codex route as the template

The OpenAI provider (`src/providers/openai.ts`) already solves the analogous problem for OpenAI:

- `CODEX_AUTH_FILE = ~/.codex/auth.json` — existence + chatgpt mode triggers CLI route.
- `runViaCodexCli()` — spawns `codex exec --json`, parses stdout JSONL for `turn.completed` events to get usage.
- `getAuthMode()` — detects mode, caches result.
- Batch methods throw when mode isn't `api_key`.
- `runLane` / `runSynthesis` branch on mode.

This plan is deliberately modelled on that same shape. Before writing new code, read `src/providers/openai.ts` end-to-end — most of the design decisions are already made there.

## Out of scope for this plan

- Automatic failover between auth modes mid-run.
- Exposing OAuth auth to the OpenAI provider (ChatGPT Plus subscription → OpenAI Responses API). Different product, different constraints.
- Any change to the batch path.
- Changes to `web_search_20250305` tool usage on the API-key path.
