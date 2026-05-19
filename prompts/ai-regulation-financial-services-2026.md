# Research Brief: AI Regulation and the Regulated Enterprise — Trajectory to 2030

## Topic string (paste into --topic)

```
The trajectory of AI regulation across the EU AI Act, the UK's pro-innovation and contextual approach, and the financial-services regulatory regime (FCA, PRA, Bank of England) from January 2023 to May 2026, including the FCA Mills Review, GPAI obligations, model-risk and accountability rules, and what they demand of technology leadership in regulated firms
```

## Sub-questions for synthesis to address

**EU AI Act — obligations and enforcement reality**
- What is the in-force position as of mid-2026: GPAI obligations (live since August 2025), the 2 August 2026 enforcement powers and fines (up to 3% turnover / €15m), and the high-risk timeline to 2027?
- What did the final GPAI Code of Practice (July 2025) actually require on transparency, copyright compliance and systemic-risk management, and how is adoption playing out among major model providers?
- What changed under the "AI omnibus" simplification package (political agreement 7 May 2026), and what does it signal about EU regulatory appetite?
- Extraterritorial reach: how does the Act bind UK and US firms that serve EU customers or place models on the EU market?

**UK approach and the FCA Mills Review**
- What are the five cross-sector principles from the 2023 pro-innovation White Paper, and what is the current "no new AI-specific rules, rely on existing frameworks" stance of the FCA, PRA and Bank of England (including the 1 April 2026 BoE/PRA response)?
- What is the scope of the FCA Mills Review (autonomous and agentic systems, market structure, consumer impact, regulator evolution to 2030), its timeline (recommendations to the FCA Board summer 2026), and likely direction?
- Is a statutory UK AI Bill likely in 2026, and how would it interact with the sectoral-regulator model?
- How is the FCA AI Lab (Supercharged Sandbox, AI Live Testing, AI Spotlight, AI Sprint) shaping safe-innovation expectations for firms?

**The financial-services regime that already binds AI**
- How do existing instruments apply to AI systems: PRA SS1/23 model risk management, Consumer Duty (outcomes and fair value), SMCR individual accountability, and operational resilience / DORA (including third-party model and cloud concentration risk)?
- How do UK GDPR and Article 22 automated-decision rules and the ICO position constrain AI in credit, pricing and advice?
- What do Basel / EBA expectations and the Treasury Committee's work add for prudential and conduct risk?
- Where are the genuine gaps between principles-based rules and agentic or foundation-model behaviour?

**Outlook, divergence, and leadership implications**
- Where are the EU (prescriptive) and UK (contextual) regimes diverging, and what is the compliance cost of straddling both for a cross-border firm?
- What does this regulatory load mean for AI operating models, governance, model inventories and assurance functions in regulated firms?
- What capabilities and accountabilities should a senior technology / AI-transformation leader own to make AI adoption defensible (board reporting, SMCR mapping, model risk, vendor due diligence)?
- What is the credible 2027–2030 outlook that firms should be planning capacity and architecture against now?

## Suggested command

Free-tier sync smoke (no billing, validates the code path):
1. `npx ts-node research-sweep.ts \`
2. `--provider gemini --sync --no-search --test \`
3. `--brief-file "prompts/ai-regulation-financial-services-2026.md" \`
4. `--lanes blogs --from 2023 --to 2026 --depth shallow --min-lanes 0 \`
5. `--folder "gemini-smoke"`

Full grounded batch run (after billing is enabled in Google AI Studio):
1. `./batch-search.sh \`
2. `--brief-file "prompts/ai-regulation-financial-services-2026.md" \`
3. `--lanes financial,frontier,academic,vc,blogs,tech \`
4. `--from 2023 --to 2026 \`
5. `--depth deep \`
6. `--folder "ai-regulation-financial-services-2026"`

## Notes

- Output lands in `$RESEARCH_SWEEPER_OUTPUT_DIR/<folder>/` (default `~/obsidian/research/<folder>/`).
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise ai-regulation-financial-services-2026`
- Check batches: `./list-batches.sh`
- Angle: theme 4 deliberately surfaces the "what a technology leader must own" framing — usable as the Substack thesis and as positioning evidence for AI-transformation-in-regulated-financial-services roles.
