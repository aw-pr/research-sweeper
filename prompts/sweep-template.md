# Research Brief: [SHORT TITLE]

## Topic string (paste into --topic)

```
[ONE SENTENCE: topic + date range + key dimensions to investigate]
```

Example structure:
> "[Subject] trends [Month YYYY]–present: [dimension 1], [dimension 2], and [dimension 3]"

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor and are less likely to skip recent coverage.

## Lane directive

Optional. Free-form direction for the six lane agents: the role they should adopt, how deep to go, what to label or record, what to treat sceptically. Passed through verbatim in the cached lane system prefix, so it costs one cache write per sweep no matter how many lanes run. Omit the section entirely if you don't need it.

> Example: "Act as an infrastructure architect. Retrieve figures, not adjectives. Label every hardware claim SHIPPED, ANNOUNCED, or RUMOURED with its source class."

## Synthesis directive

Optional. Free-form direction for the synthesis pass: the role, the audience, the register. Replaces the default "senior technology research analyst" persona. Use it when the lanes should dig at one altitude and the report should land at another.

> Example: "Write as a technology strategist for senior decision-makers. Strategic in altitude, technical in evidence: every strategic claim rests on a named source from the lanes."

## Sub-questions for synthesis to address

When you run with `--brief-file`, these are passed through to both the lane prompts and the synthesis prompt. Use them to shape what evidence gets collected and what the final report must answer.

**[Theme 1]**
- Sub-question
- Sub-question

**[Theme 2]**
- Sub-question
- Sub-question

**[Theme 3]**
- Sub-question
- Sub-question

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/[this-brief].md" \
  --lanes financial,frontier,academic,vc,blogs,tech \
  --from YYYY-MM \
  --depth [shallow|standard|deep] \
  --folder "[kebab-case-folder-name]"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 20           | 1800–2400 words, 5 sections | Broad or competitive topics    |

### Date anchor guide
| Scope         | Flag           |
|---------------|----------------|
| Last 6 months | --from 2025-10 |
| Last year     | --from 2025-01 |
| Last 2 years  | --from 2024-01 |
| Custom window | --from YYYY-MM --to YYYY-MM |

## Notes

- Output lands in `~/obsidian/research/[folder]/`
- `--brief-file` reads four sections and ignores the rest: topic string, sub-questions, lane directive, synthesis directive. Anything under another `##` heading is reported at submit time and reaches no model
- A `_research-sweeper-stub.md` note is created before the sweep starts
- Existing `summary-*`, `sources-*`, and lane files are protected unless you pass `--overwrite`
- Re-run synthesis without new searches: `npx ts-node research-sweep.ts --re-synthesise [folder]`
- Check batch status: `./list-batches.sh`
- Resume manually: `./resume-batch.sh 1`
