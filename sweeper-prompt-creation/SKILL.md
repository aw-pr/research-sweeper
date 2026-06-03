---
name: sweeper-prompt-creation
description: "Draft a well-formed research brief for research-sweeper from a plain-English description, then optionally launch the sweep."
---

# Sweeper Prompt Creation Skill

Turn a plain-English research description into a well-formed `prompts/*.md` brief, then offer to launch the sweep.

## Why this matters

A well-formed brief is the highest-leverage input to the sweep. Lane agents use the topic string as a search anchor and the sub-questions to focus evidence collection. Vague prompts produce shallow coverage; specific prompts with a date anchor and grouped sub-questions produce tight, usable output.

## Workflow

### Step 1 — Gather intent

Ask the user one focused question if anything is ambiguous:
- What is the core research question?
- What time window? (default: `--from` = one year before today, `--to` = current year from today's date)
- Which lanes? (default: financial, frontier, academic, vc — add blogs for independent/thesis commentary, add tech for engineering methodology & IT leadership)
- What depth? (default: standard)
- What folder name? (kebab-case slug for Obsidian output)

**Date handling:** Always use today's actual date (available via `currentDate` in system context) to derive both dates. Extract the year for `--to` (e.g. today is 19 April 2026 → `--to 2026`). Default `--from` to one year prior (e.g. `--from 2025`), but adjust based on the research topic — longer historical topics should go further back. Always include both `--from` and `--to` explicitly in every command so the CLI never prompts interactively. Write the date range in the topic string as calendar month + year (e.g. "April 2025–April 2026") — never use bare "present".

Only ask what you genuinely need. If the description is sufficient, proceed directly to drafting.

### Step 2 — Draft the brief

Write the brief using this exact structure:

```
# Research Brief: [Title]

## Topic string (paste into --topic)

```
[Single sentence including date range, 2–4 dimensions, no URLs]
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor.

## Sub-questions for synthesis to address

**[Theme 1]**
- [Specific, answerable question]
- [Specific, answerable question]
- [Specific, answerable question]

**[Theme 2]**
- ...

**[Theme 3]**
- ...

## Suggested command

Manual steps (run in your own terminal if needed):
1. `./batch-search.sh \`
2. `--brief-file "prompts/[filename].md" \`
3. `--lanes [lanes] \`
4. `--from [YYYY] \`
5. `--to [YYYY] \`
6. `--depth [shallow|standard|deep] \`
7. `--folder "[folder-slug]"`

Add `--wait` to auto-resume when the batch finishes. Default provider is `claude`; for a different provider append e.g. `--provider openai --openai-auth api-key` (batch needs the API key, not the subscription — see Provider & auth below). For a fast, model-knowledge-only run with no web search, add `--no-search`.


### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

## Notes

- Output lands in `$RESEARCH_SWEEPER_OUTPUT_DIR/[folder-slug]/` (defaults to `~/obsidian/research/[folder-slug]/`)
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise [folder-slug]`
- Check batches: `./list-batches.sh`; resume a finished batch with `./resume-batch.sh`
```

### Brief quality rules

**Topic string:**
- One sentence, must include an explicit date range with both start and end as calendar month + year (e.g. "June 2025–April 2026") — never use bare "present"; models anchor on literal dates
- Name 2–4 specific dimensions (not just the topic area)
- Seed 3–6 named tools, vendors, standards, or competitors when the topic has them (e.g. "Serena, SCIP, KuzuDB") — concrete names give lane agents search anchors and surface comparisons a generic phrasing would miss
- No URLs

**Sub-questions:**
- Group into 3–4 named themes — each theme is a bold heading
- 3–4 bullets per theme, each specific and answerable
- Questions direct evidence collection — avoid restating the topic
- Include at least one evidence-quality question that forces skepticism (e.g. "Where is the evidence thin, anecdotal, or vendor-driven rather than independently measured?") — keeps synthesis from laundering marketing claims as findings
- For competitive/comparative topics: include a "Comparative positioning" theme
- For trend topics: include a "Trend and outlook" theme

**Lanes:**
- `financial` — enterprise adoption, regulation, market structure
- `frontier` — model releases, API changes, lab announcements
- `academic` — papers, benchmarks, empirical findings
- `vc` — investment narratives, analyst views
- `blogs` — independent analysis (Substack primary, plus Medium, LessWrong, personal blogs); use for thesis-style commentary or to validate a referenced post
- `tech` — authoritative practitioner and methodology sources (DORA, ThoughtWorks Radar, Martin Fowler, InfoQ, IEEE Software, ACM Queue, HBR/MIT Sloan, CNCF) — use for engineering practice, architecture, IT leadership topics

**Depth:**
- `shallow` — narrow topic, quick orientation, low cost
- `standard` — most topics, balanced coverage (default)
- `deep` — broad competitive landscape or historical analysis

**Provider & auth (load-bearing):**
- `--provider claude|openai|gemini` selects which provider runs the lanes + synthesis. Default is `claude`.
- **Batch mode requires API-key auth.** The subscription / OAuth routes are sync-only and hard-fail in batch: `--openai-auth codex`, `--claude-auth claude-oauth`, `--gemini-auth gemini-oauth`. So "run it as a batch on provider X" always means provider X's API key (metered billing), never the subscription.
- When both a provider's API key and its OAuth/subscription credential are present and no auth flag is given, the tool refuses to guess and throws — pass the auth flag explicitly.
- **Comparing providers is not a clean model comparison.** Lane search differs by route: Claude API forces `web_search_20250305` (`tool_choice: any`), the Claude Agent-SDK route uses a different `WebSearch` tool, and Gemini grounding cannot be forced. Source selection therefore diverges. The run records `authMode` in `runs/stats.json` so comparisons stay honest — flag this confound to the user before they read provider A vs B as quality.

### Step 3 — Show the draft

Present the full draft to the user before writing anything. Ask for changes.

### Step 4 — Write the file

Once approved, write the brief to `prompts/[folder-slug].md` in the research-sweeper repo (the `--brief-file` path the lanes and synthesis read from).

Confirm the file path to the user.

### Step 5 — Offer to launch

Ask: "Ready to launch? I can start it as a batch run in a tmux session."

If yes:
Manual steps (run in your own terminal if needed):
1. `tmux new-session -d -s sweep-[slug] \`
2. `'./batch-search.sh --brief-file "prompts/[filename].md" \`
3. `--from [from] --to [to] --lanes [lanes] --depth [depth] --folder "[folder]"'`


Confirm with `tmux ls`. Remind user to check `./list-batches.sh` to monitor.

## Reference

- Tool behaviour, auth routes, lane models, and cost defaults: research-sweeper `CLAUDE.md`.
- Existing briefs to mirror for format: `prompts/*.md` in the repo.
