# Research Brief: Enterprise Agentic AI Adoption Criteria

## Topic string (paste into --topic)

```
Enterprise agentic AI adoption in operational processes November 2025–present: procurement criteria, model drift risk, version stability, availability SLAs, and how enterprises manage dependency on AI vendors in production workflows
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor and are less likely to skip recent coverage.

## Sub-questions for synthesis to address

**Procurement and evaluation criteria**
- What criteria do enterprise buyers use when evaluating agentic AI for operational processes (not just chatbots or copilots, but systems embedded in workflows)
- Which factors are most commonly cited as blockers or accelerators: cost, reliability, accuracy, auditability, vendor lock-in, compliance
- How do enterprise procurement processes differ for agentic AI vs traditional SaaS software — what new diligence is required

**Model drift and version stability**
- How are enterprises handling the problem of model behaviour changing between versions — what controls, monitoring, or contractual protections are in place
- What do enterprises do when a new model release changes outputs in ways that break existing workflows or integrations
- Are there published frameworks, standards, or procurement guidelines (e.g. NIST, ISO, EU AI Act) that address model drift in enterprise deployments

**Availability and operational risk**
- How are enterprises factoring API availability and provider outage risk into agentic system design
- What fallback strategies are being adopted: multi-provider routing, on-premises deployment, fine-tuned open-source models
- How do enterprises balance cost optimisation (using best-available model) against operational stability (pinning to a known version)

**Vendor commitment and long-term dependency**
- What commitments are AI providers making (contractually or publicly) about model version stability, deprecation timelines, and enterprise continuity
- How are enterprises structuring contracts to manage the risk that a key model gets deprecated or materially changed
- What do case studies or analyst reports from November 2025–present show about enterprises that have committed to agentic AI in core operations — what has gone well and what has failed

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/enterprise-agentic-ai-adoption.md" \
  --lanes financial,frontier,academic,vc \
  --from 2025-11 \
  --depth standard \
  --folder "enterprise-agentic-ai-adoption"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

## Notes

- Output lands in `~/obsidian/research/enterprise-agentic-ai-adoption/`
- Date window is narrow (Nov 2025–present) — lane agents will anchor searches to recent months
- Re-run synthesis without new searches: `npx ts-node research-sweep.ts --re-synthesise enterprise-agentic-ai-adoption`
