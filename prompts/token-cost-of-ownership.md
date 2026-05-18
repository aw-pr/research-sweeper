# Research Brief: Token Cost of Ownership

## Topic string (paste into --topic)

```
AI token pricing vs true total cost of ownership from January 2023 to 19 April 2026, with emphasis on 2025–2026 signals: lab subsidisation strategies, infrastructure economics (compute, energy, data centres, hardware, security, ops), how user-facing prices have evolved, and analyst and researcher projections for token cost trajectories through 2028.
```

## Sub-questions for synthesis to address

**Cost structure and what actually goes into a token**
- What are the primary cost components of serving an LLM token — compute (GPU/TPU), energy, data centre capex, networking, security, and ops overhead?
- How do research and training costs amortise into inference pricing, and how do labs account for this?
- What does frontier model inference actually cost per million tokens at scale in 2025–2026, based on disclosed or estimated figures?

**Subsidisation and pricing strategy**
- How much are frontier labs (OpenAI, Anthropic, Google, Meta) subsidising token prices below cost, and what evidence exists for this?
- How does this mirror early cloud pricing by AWS, Azure, and GCP — and how long did those subsidies last before normalisation?
- What are the commercial motivations for sustained subsidisation (developer lock-in, market share, VC narrative)?

**Price evolution 2023–April 2026**
- How have published API prices changed across major providers from GPT-4 launch (2023) to April 2026?
- Which cost components are falling (hardware efficiency, inference optimisation) vs. rising (energy demand, cooling, compliance, security)?
- What has driven the price drops seen in commodity models vs. frontier models?

**Cost trajectories and 2026–2028 predictions**
- What do credible analysts (SemiAnalysis, Epoch AI, ARK Invest, bank research desks) project for frontier token costs per million through 2028?
- How are compute efficiency gains (Jevons paradox, model distillation, inference optimisation) expected to interact with rising energy and data centre demand?
- Which cost components are most likely to create price floors — and what would prevent prices from continuing to fall?
- Are there published internal or leaked cost estimates from labs that inform extrapolations?

## Suggested command

Manual steps (run in your own terminal if needed):
1. `./batch-search.sh \`
2. `--brief-file "prompts/token-cost-of-ownership.md" \`
3. `--lanes financial,frontier,academic,vc,blogs \`
4. `--from 2023 \`
5. `--depth deep \`
6. `--folder "token-cost-of-ownership"`
