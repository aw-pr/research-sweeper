# Research Brief: AI Transformation in Financial Services — Approaches, Operating Model and Architecture

## Topic string (paste into --topic)

```
End-to-end AI transformation approaches in financial services from May 2025 to May 2026, focused on how transformation sequences across departments and functions, how operating models and enterprise architecture evolve, what people-and-change work is required, and which technology and platform decisions are needed and when.
```

## Sub-questions for synthesis to address

**End-to-end transformation approach**
- What does a credible 18–36 month FS AI transformation programme actually look like, phase by phase — discovery, foundations, productionisation, scaling?
- How do leading firms sequence work across functions so that early wins do not lock in bad foundations later?
- What are the dependencies between platform readiness, regulatory engagement, capability building and business-line delivery — and where do transformations stall?

**Operating model evolution**
- How is the target operating model (TOM) for AI being defined — federated, hub-and-spoke, platform team, embedded product squads, centre of excellence?
- How is accountability divided across CIO, CTO, CDO, CRO, COO and business-line owners? Where is the AI function being permanently parked?
- What governance forums, decision rights and escalation paths are emerging — model review boards, AI risk committees, ethics committees? Which are theatre and which actually decide anything?

**Enterprise architecture decisions**
- What does a defensible target enterprise architecture for an AI-mature FS firm look like in 2026 — model gateways, agent frameworks, RAG / feature / vector layers, audit and lineage planes, identity for agents?
- How are firms handling integration with legacy core banking, mainframe, and incumbent data estates without rebuilding everything?
- Where is the line between platform-team-owned capability and product-team-owned application, and how is that line moving?

**Technology decisions and timing**
- Which platform commitments must be made early (model gateway, observability, eval harness, data contracts) and which can be deferred?
- Build vs buy vs partner — when does each pattern win for foundation models, agent frameworks, RAG infrastructure, evals, governance tooling?
- What is the realistic sequence for moving from individual copilots to multi-step agents to genuinely agentic workflows? Where do organisations get stuck and why?

**People, change and capability**
- What change-management approaches are actually shifting behaviour, beyond mandatory training and town halls?
- How are firms reshaping engineering, risk, compliance and operations roles — pivot-and-retrain vs hire-fresh vs vendor-augment?
- What capability frameworks are emerging for AI-literate leaders, AI engineers, prompt / eval specialists, and AI risk and compliance specialists?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/ai-transformation-fs-playbook.md" \
  --lanes financial,tech,blogs,vc,frontier \
  --from 2025 \
  --to 2026 \
  --depth standard \
  --lane-model sonnet \
  --folder "ai-transformation-fs-playbook"
```

## Notes

- Output lands in `~/obsidian/research/ai-transformation-fs-playbook/`
- Re-synthesise: `npx ts-node research-sweep.ts --re-synthesise ai-transformation-fs-playbook`
- Check batches: `./list-batches.sh`
- Cache proof post-run: `jq '.[-1] | {model: .laneModel, tokens, cost: .estimatedCostUSD}' runs/stats.json`

## Distinction from sister brief

- `ai-transformation-financial-services` — landscape view (who's affected, what's regulated, what's actually working)
- `ai-transformation-fs-playbook` (this brief) — playbook view (how to sequence transformation, what TOM/EA target state should be, decision timing)
