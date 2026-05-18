# Research Brief: AI Transformation Programmes in Financial Services — Cross-Functional Approach

## Topic string (paste into --topic)

```
End-to-end AI transformation programmes in financial services from January 2024 to May 2026, viewed as a single multi-year change programme spanning all business units and corporate functions, with focus on programme structure and sequencing, cross-functional scope, governance and executive sponsorship, people and change, and measured outcomes — deliberately backgrounding the technology architecture drill-down.
```

## Sub-questions for synthesis to address

**Programme structure and shape**
- What does a credible 2–3 year AI transformation programme look like end to end — phases, gates, value-cases, funding model, programme leadership pattern?
- How are firms sequencing foundation-laying (data, governance, capability) against business-line delivery so that value lands without locking in bad foundations?
- How is the programme structured at the top — single AI transformation programme, portfolio of business-unit initiatives, or embedded into existing digital / data transformation?

**Cross-functional scope across BUs and corporate functions**
- Which business units typically lead, and which lag — retail, wealth, capital markets, insurance, payments, asset management — and why?
- How are corporate functions (HR, finance, legal, audit, risk, compliance, procurement, operations) being treated — as scope, as enablers, or as obstacles?
- What ordering and dependency patterns are working — which combinations create flywheels and which create dead-ends?

**Governance, sponsorship and accountability**
- What governance pattern actually works at programme level — single executive sponsor, exec committee, AI council, separate board oversight?
- How is the CEO / CFO / COO / CRO / CIO accountability split being drawn for an enterprise AI programme as distinct from line-of-business AI?
- Where do programmes acquire decision authority for cross-BU trade-offs, and what happens when they do not?

**People, change and capability**
- What change-management approaches are actually shifting front-line and middle-management behaviour, not just sentiment?
- How are firms building capability at scale — leader-led programmes, role-based academies, embedded coaches, mandatory upskilling, paired-working with vendors?
- How is the firm-level talent strategy being rebalanced — pivot existing employees, hire specialists, partner with consultancies, acquire firms?

**Outcomes, value realisation and lessons**
- Named, multi-BU AI transformation programmes that have published credible outcomes in 2025–2026 — what was delivered, what was promised, what is independent vs vendor-reported?
- The honest failure patterns at programme level — stalled foundations, governance gridlock, vendor-led design, capability mismatch, regulatory back-pressure?
- What pattern of value realisation is emerging — productivity, cost-out, revenue, risk reduction, capability uplift — and what is the credible time-to-value at programme scale?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/ai-transformation-fs-programme.md" \
  --lanes financial,blogs,tech,vc,academic \
  --from 2024 \
  --to 2026 \
  --depth deep \
  --lane-model sonnet \
  --folder "ai-transformation-fs-programme"
```

## Notes

- Output lands in `~/obsidian/research/ai-transformation-fs-programme/`
- Re-synthesise: `npx ts-node research-sweep.ts --re-synthesise ai-transformation-fs-programme`
- Check batches: `./list-batches.sh`
- Deep depth on Sonnet has truncation risk at 25 sources per lane — flagged in CLAUDE.md, accepted for this brief

## Distinction from sister briefs

- `ai-transformation-financial-services` — landscape (who's affected, what's regulated, what's actually in production)
- `ai-transformation-fs-playbook` — playbook (TOM, EA, technology decisions and timing)
- `ai-transformation-fs-programme` (this brief) — programme (cross-functional change as a single multi-year transformation)
