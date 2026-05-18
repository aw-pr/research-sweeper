# Research Brief: AI 2027 Milestone Tracker

## Topic string (paste into --topic)

```
AI 2027 report milestone tracking (January 2025–present): which predicted capabilities have shipped across Anthropic, OpenAI, Google DeepMind, Meta, xAI, and major enterprise adopters; what remains unshipped or contradicted; and what near-term signals suggest for agentic AI, safety frameworks, autonomy, and deployment timelines
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor and are less likely to skip recent coverage.

## Sub-questions for synthesis to address

**Evidence vs AI 2027 timelines**
- Which AI 2027 milestones map to concrete market events across leading labs, API releases, enterprise adoption, and policy changes since January 2025
- Which predicted capabilities remain unshipped, immature, or contradicted by current evidence
- Which near-term signals are strongest for the next 6–12 months: agentic workflows, safety/safeguards progress, autonomy-related behaviour, notable model releases

**Economic and geopolitical implications**
- What market, enterprise, and regulatory effects are already visible across leading model providers
- Which AI 2027 geopolitical and economic claims look directionally correct vs overstated
- What second-order effects are likely if current signals continue

**Validation of prior thesis ("Fant-AI-sia: Magic Without Mastery", itone.substack.com)**

The post argues that AI is "magic without mastery" — impressive statistical inference operating in a chaotic, nonlinear world it cannot reliably control or predict. Assess whether evidence since publication supports, contradicts, or leaves unresolved each of the following claims:

- AI systems are fundamentally statistical inference machines (next-token prediction) — not genuine reasoners — which imposes absolute theoretical limits on reliability in complex adaptive systems (markets, societies, ecosystems)
- AI 2027 uses only recent growth curves while ignoring the AI winters of the 1970s and 1990s, making its super-exponential extrapolation methodologically suspect
- Multiple curve-fits to the same AI 2027 data (logistical, exponential, plateau) yield superhuman-coding timelines ranging from "less than a year" to "never" — the report presents one curve as the likely outcome without sufficient justification
- AI 2027 downplays friction from: regulatory intervention, enterprise adoption inertia, compute scaling limits, and training data exhaustion
- The AI 2027 storyboard scenario (AI achieves a digital coup on the US government, captures military-grade security) has no historical precedent and no evidential basis in the report
- Attempts to align AI may themselves introduce unpredictable or malign behaviours — AI 2027 acknowledges alignment could make AI better at hiding intentions but does not explore the intervention risk sufficiently
- Enterprise AI job displacement predictions vary wildly across CEOs and analysts, suggesting current AI is not yet reliably or uniformly transformative at scale
- Scaling will eventually follow a logistical (S-curve) plateau rather than continuing exponential growth — and evidence of slowdowns (capability plateaus, benchmark saturation) is already visible

The synthesis should close with a structured table: Claim | Verdict (supported / contradicted / unresolved) | Key evidence.

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/ai2027-meter-report-tracking.md" \
  --lanes financial,frontier,academic,vc,blogs \
  --from 2025-01 \
  --depth standard \
  --folder "ai2027-market-tracking-2026-04"
```

Or sync (faster, no resume needed):

```bash
npx ts-node research-sweep.ts --sync \
  --provider claude \
  --brief-file prompts/ai2027-meter-report-tracking.md \
  --lanes financial,frontier,academic,vc,blogs \
  --from 2025-01 \
  --depth standard \
  --folder "ai2027-market-tracking-2026-04"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

### Date anchor guide
| Scope         | Flag           |
|---------------|----------------|
| Last 6 months | --from 2025-10 |
| Last year     | --from 2025-01 |
| Last 2 years  | --from 2024-01 |
| Custom window | --from YYYY-MM --to YYYY-MM |

## Notes

- Output lands in `~/obsidian/research/[folder]/`
- Re-run synthesis without new searches: `npx ts-node research-sweep.ts --re-synthesise [folder]`
- Check batch status: `./list-batches.sh`
- Resume manually: `./resume-batch.sh 1`
- Blogs lane (Substack primary) will search for AI 2027 reactions and independent commentary — it cannot fetch your own Substack post directly
