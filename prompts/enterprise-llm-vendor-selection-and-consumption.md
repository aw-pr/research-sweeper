# Research Brief: Enterprise LLM Vendor Selection and Consumption Models

## Topic string (paste into --topic)

```
Enterprise LLM vendor selection and consumption patterns (April 2025–present): how companies choose between OpenAI, Anthropic, Google, hyperscaler-hosted model access, and direct API relationships; what decision metrics they use across availability, quality, price, governance, and SLAs; and how adoption differs by company size, workload criticality, and realtime versus offline use cases
```

## Sub-questions for synthesis to address

**Decision criteria and evaluation metrics**
- What metrics do enterprises use when selecting LLM vendors: benchmark quality, task accuracy, latency, uptime, price per token, context window, multimodality, tool use, compliance, regional availability, and operational support
- Which metrics matter most by workload type: customer-facing realtime systems, internal copilots, batch/offline analysis, regulated workflows, and agentic automation
- How do buyers weigh frontier model quality against availability, price predictability, portability, and governance risk
- What evidence exists on how procurement teams convert technical model performance into commercial selection criteria

**Consumption models: direct vs cloud platform**
- How often do enterprises consume models directly from providers versus through cloud platforms such as Azure, AWS, and Google Cloud
- What are the main reasons for choosing cloud-mediated access: existing enterprise agreements, procurement simplification, security posture, regional hosting, consolidated billing, or integration convenience
- What are the main reasons for choosing direct provider relationships: faster access to new models, fuller feature access, better economics, closer support, or product-specific capabilities
- How does this split vary by company size, industry, and technical maturity

**Contracting, SLAs, and operating model**
- What SLAs or commercial commitments do enterprises seek for mission-critical LLM workloads: uptime, latency, throughput, support response times, incident handling, indemnity, and data handling terms
- How do vendors and cloud channels differ in SLA structure, enterprise support tiers, reserved capacity, and commercial flexibility
- What architectures do buyers use to manage reliability risk: multi-model routing, provider failover, fallback tiers, workload segmentation, and cache/batch strategies
- Where are formal contracts and hard SLAs common versus where teams accept best-effort APIs and operational mitigations instead

**Comparative positioning and market structure**
- How are OpenAI, Anthropic, Google, and hyperscaler channels positioned in current enterprise buying narratives
- What patterns are visible in analyst, investor, and practitioner commentary about vendor lock-in, bargaining power, and platform dependence
- Which segments appear to favor "best model" selection versus "best platform" selection
- What strategic vendor-selection frameworks are emerging for CIOs, CTOs, and AI platform teams

**Trend and outlook**
- How is enterprise buying behavior shifting as model quality converges or differentiates across vendors
- Are companies moving toward single-vendor standardization, dual-sourcing, or workload-based portfolio strategies
- What near-term developments are most likely to change vendor selection criteria: model quality shifts, pricing changes, enterprise controls, SLA offerings, or cloud marketplace packaging
- What unresolved risks should a buyer monitor over the next 12–24 months

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/enterprise-llm-vendor-selection-and-consumption.md" \
  --lanes financial,frontier,academic,vc,blogs,tech \
  --from 2025-04 \
  --depth standard \
  --folder "enterprise-llm-vendor-selection-2026-04"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

## Notes

- Output lands in `~/obsidian/research/enterprise-llm-vendor-selection-2026-04/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise enterprise-llm-vendor-selection-2026-04`
- Check batches: `./list-batches.sh`
