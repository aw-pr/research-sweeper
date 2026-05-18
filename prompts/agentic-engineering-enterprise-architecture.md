# Research Brief: From vibes to Engineering, how vibe coding has transformed into Agentic engineering from May 2025 to 2026

## Topic string (paste into --topic)

```text
Agentic engineering after Andrej Karpathy's vibe coding meme, April 2025-April 2026: how AI coding agents are changing enterprise software engineering across security, testability, reliability, maintainability, availability, resilience, observability, operability, cost, recovery, and engineering governance.
```

## Sub-questions for synthesis to address

**Origins and framing**
- What did Karpathy mean by "vibe coding", and how did the phrase evolve into "agentic coding" or "agentic engineering"?
- What problem does "agentic engineering" name that "vibe coding" does not adequately capture?
- How are serious practitioners distinguishing toy AI coding, demo apps, and prototypes from production-grade agent-assisted engineering?
- Is agentic engineering genuinely a new discipline, or a forcing function that makes existing engineering disciplines non-optional?

**The enterprise "-ability" suite**
- How should agentic engineering preserve or improve security, testability, reliability, maintainability, scalability, availability, observability, operability, portability, interoperability, extensibility, usability, accessibility, and compliance?
- Which of these qualities become harder to protect when code is produced or modified by agents?
- Which architectural practices become more important: modularity, bounded contexts, contracts, dependency management, interface stability, migration strategy, and architectural decision records?
- How should teams express non-functional requirements so agents can actually work against them rather than merely generating plausible code?

**Resilience, recovery, and silent failure**
- What new failure modes emerge from agent-generated or agent-modified systems, especially silent failures, partial failures, brittle integrations, shallow tests, hidden coupling, and degraded-but-not-broken behaviour?
- How should availability, failover, rollback, disaster recovery, incident response, and post-incident learning change in an agentic engineering workflow?
- What role should observability, tracing, logs, metrics, synthetic checks, SLOs, error budgets, chaos testing, and production verification play?
- How can teams detect when an agent has introduced behaviour that passes tests but violates intent, policy, security, data quality, or operational expectations?

**Cost, governance, and delivery economics**
- How does agentic engineering affect total cost of ownership across development, review, testing, infrastructure, cloud spend, incident cost, maintenance, vendor lock-in, and technical debt?
- Where do coding agents shift bottlenecks: implementation, review, QA, integration, architecture, documentation, deployment, or incident recovery?
- What governance is needed for regulated or enterprise environments: audit trails, approval gates, policy-as-code, provenance, model/tool access, and change-management evidence?
- What is the difference between individual developer productivity gains and measurable organisation-level improvements in throughput, quality, resilience, and cost?

**Evidence and outlook**
- What empirical evidence exists from benchmarks, enterprise case studies, academic work, tool vendors, platform companies, and independent practitioner reports?
- Which claims about agentic engineering are evidence-backed, and which are mostly meme, hype, or investor narrative?
- What lessons can be borrowed from DevOps, SRE, platform engineering, secure SDLC, threat modelling, quality engineering, and enterprise architecture?
- Over the next 12-24 months, what practices are likely to become standard for teams using coding agents seriously?

## Suggested command

Manual steps (run in your own terminal if needed):
1. `./batch-search.sh \`
2. `--brief-file "prompts/agentic-engineering-enterprise-architecture.md" \`
3. `--lanes frontier,academic,vc,blogs,tech,financial \`
4. `--from 2025 \`
5. `--to 2026 \`
6. `--depth deep \`
7. `--folder "agentic-engineering-enterprise-architecture"`

### Depth guide

| Depth    | Rounds | Sources/lane | Synthesis length | Best for |
|----------|--------|--------------|------------------|----------|
| shallow  | 2      | 5            | 300-400 words    | Quick orientation, narrow topics |
| standard | 3      | 10           | 700-900 words    | Most research briefs |
| deep     | 5      | 25           | 1800-2400 words  | Broad or competitive topics |

## Notes

- Output lands in `~/obsidian/research/agentic-engineering-enterprise-architecture/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise agentic-engineering-enterprise-architecture`
- Check batches: `./list-batches.sh`
