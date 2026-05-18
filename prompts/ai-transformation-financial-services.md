# Research Brief: AI Transformation in Financial Services and Fintech

## Topic string (paste into --topic)

```
AI transformation in financial services and fintech from May 2025 to May 2026, covering departmental impact (front office, risk, compliance, operations, technology), regulatory and compliance posture, target operating model and business architecture, key technology and platform decisions, and what credible adoption and execution looks like for incumbents and challengers.
```

## Sub-questions for synthesis to address

**Departmental impact and responsibilities**
- Which functions inside a bank or fintech are most materially changed by GenAI today — front office, middle office, risk, compliance, operations, engineering, legal?
- Where does accountability for AI outcomes sit — CDO, CIO, CRO, COO, business lines? What governance patterns are emerging?
- What is the realistic FTE / role-mix change being reported, and where is it speculative?

**Compliance, regulation and risk**
- What is the current state of regulation for AI in FS across UK (FCA, PRA), EU (AI Act, DORA, EBA), US (OCC, SEC), Singapore (MAS)?
- How are firms handling model risk management for LLMs under SR 11-7 / SS1/23 — explainability, validation, monitoring, drift?
- What controls are firms putting around customer-facing AI (suitability, fair-treatment, consumer duty, fairness / bias)?

**Technology and architectural decisions**
- Build vs buy vs partner — when does each pattern win, and who is doing what (Anthropic / OpenAI / Mistral / open-weights)?
- Reference architectures for retrieval, agents, evals and human-in-the-loop in a regulated context
- Data architecture decisions — feature stores, vector stores, model gateways, RAG vs fine-tune vs context engineering at scale
- Identity, audit and lineage for agentic systems — what does "audit trail for an agent" look like in practice?

**Operating model and target architecture**
- How are leading firms structuring AI delivery — centre of excellence, federated, platform team, embedded squads? Which patterns scale?
- How is the CIO/CTO/CDO triangle being redrawn? Where does product-engineering AI capability live vs business-unit experimentation?
- Talent model — pivoting existing engineers vs hiring specialists vs partnerships with vendors and consultancies?

**Success stories, lessons, and reality check**
- Named, credible production deployments at scale in 2025–2026 — what is actually live in customer-facing or P&L-impacting workflows, not lab demos?
- The most-cited failures and lessons — what is the honest base rate of pilot-to-production?
- Where are the measurable productivity and revenue numbers, and which are vendor-reported vs independently audited?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/ai-transformation-financial-services.md" \
  --lanes financial,frontier,vc,blogs,tech \
  --from 2025 \
  --to 2026 \
  --depth standard \
  --lane-model sonnet \
  --folder "ai-transformation-financial-services"
```

## Notes

- Output lands in `~/obsidian/research/ai-transformation-financial-services/`
- Re-synthesise: `npx ts-node research-sweep.ts --re-synthesise ai-transformation-financial-services`
- Check batches: `./list-batches.sh`
- Cache proof post-run: `jq '.[-1] | {model: .laneModel, tokens, cost: .estimatedCostUSD}' runs/stats.json`
