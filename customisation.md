# Research Sweep — Lane Customisation Reference

This file documents how to extend or modify the shared lane and depth configuration.

## Adding a new lane

In `config/lanes.json`, add an entry:

```json
{
  "trade": {
    "label": "Industry Trade Press",
    "outlets": ["The Information", "TechCrunch", "Wired", "MIT Technology Review"],
    "searchFocus": "product launches, startup activity, technical explainers, industry commentary",
    "systemPrompt": "You are a research agent specialising in technology trade press..."
  }
}
```

Then add `"trade"` to the `Lane` type union in [`src/types.ts`](src/types.ts).

## Adjusting depth

Edit `config/depths.json` to change source targets:

```json
{
  "shallow": { "searchRounds": 2, "sourcesPerLane": 5 },
  "standard": { "searchRounds": 3, "sourcesPerLane": 10 },
  "deep": { "searchRounds": 5, "sourcesPerLane": 25 }
}
```

`searchRounds` is passed into the lane prompt as the search budget ("run up to N targeted searches"). The lane agent always fires at least one search — `tool_choice: any` is set on every lane call so the web search tool cannot be skipped. Add `--no-search` to disable this entirely.

## Modifying synthesis style

The synthesis prompt in [`src/prompts.ts`](src/prompts.ts) controls the final document structure. Depth-specific synthesis guidance comes from `config/depths.json`. The style rules at the bottom of the prompt enforce:
- No bullet points in prose sections
- No em dashes
- Specific over vague language
- Dry analytical tone

These match Tony's Substack style rules. Adjust if you want a different output register.

## Output frontmatter

The YAML frontmatter written to each file:

```yaml
---
provider: claude
topic: "AI agent orchestration"
date: 2026-04-02
from: 2019
to: 2026
lanes: [financial, frontier, academic, vc]
depth: standard
tags: [research-sweep, ai-agent-orchestration]
---
```

This is Obsidian-compatible and will index correctly in Dataview queries.

## API credits vs Max/Pro quota (Claude)

Sync Claude runs can consume Max/Pro subscription quota instead of API credits via `--claude-auth claude-oauth`. Prefer the secure wrapper so the OAuth token is resolved (via 1Password if configured) into the child process; otherwise set `CLAUDE_CODE_OAUTH_TOKEN` in `.env`.

```bash
./run-secure-command.sh env -u ANTHROPIC_API_KEY npx ts-node research-sweep.ts --auth-check claude-oauth
./run-secure-sweep.sh --sync --provider claude --claude-auth claude-oauth \
  --topic "MCP protocol adoption" --lanes frontier,academic --depth shallow \
  --folder "mcp-adoption-maxq"
```

Caveats:
- Sync-only. Batch mode hard-fails on `--claude-auth claude-oauth` because the batch API requires API-key auth.
- Run the smoke test first for expensive sweeps. It passes only if the live Agent SDK call works with `CLAUDE_CODE_OAUTH_TOKEN` set and `ANTHROPIC_API_KEY` absent.
- On explicit `--claude-auth claude-oauth`, `run-secure-sweep.sh` removes `ANTHROPIC_API_KEY` from the child environment after `op run` hydrates `.env`, and the provider also removes it in-process before importing the Agent SDK. This prevents accidental API-key billing.
- A raw `npx ts-node research-sweep.ts ...` command does not invoke `op-fetch`; it reads `.env`/`.env.local` (fill-only) and otherwise relies on whatever is already exported in that shell, e.g. a real `CLAUDE_CODE_OAUTH_TOKEN`.
- The Agent SDK uses the built-in `WebSearch` tool, not `web_search_20250305` + `tool_choice: any`. Source selection may differ vs. the API-key route. `runs/stats.json` records `authMode` per run so the difference is traceable.
- Auto-detect precedence: API key wins when both are present. Pass `--claude-auth claude-oauth` explicitly to force subscription quota. The legacy alias `claude-cli` is still accepted.
- Claude synthesis defaults to `claude-opus-4-8`; override with `--synthesis-model <id>` (e.g. a cheaper model) when a run does not warrant the cost.

## Running two lanes only (faster)

```bash
npx ts-node research-sweep.ts \
  --provider openai \
  --topic "MCP protocol adoption" \
  --lanes frontier,academic \
  --depth shallow \
  --folder "mcp-adoption"
```

Useful for quick orientation before a longer deep sweep.
