# Research Brief: The SaaS-pocalypse — AI Displacement, Overhiring Hangover, or Multiple Compression?

## Topic string (paste into --topic)

```
The 2026 SaaS sector stress: testing whether weak SaaS revenue growth and stock performance are driven by AI displacing knowledge-work jobs, post-ZIRP overhiring correction, compression of growth-era revenue multiples, or macro tech-capex slowdown — January 2026 through April 2026.
```

## Sub-questions for synthesis to address

**Market performance and fundamentals**
- How have SaaS index constituents (Salesforce, ServiceNow, SAP, Workday, HubSpot, Atlassian, Snowflake, MongoDB) performed on revenue growth, net-new ARR, NRR, and seat counts in Q4 2025 earnings and Q1 2026 guidance?
- How have public SaaS revenue multiples moved vs the 2020–2021 peak, and how do they compare to pre-ZIRP (2015–2019) norms?
- What is the evidence that seat-based pricing is under pressure specifically (vs consumption or platform pricing)?
- Which SaaS segments (horizontal CRM/ERP, dev tools, ITSM, HR, observability, security) are outperforming or underperforming and why?

**AI displacement hypothesis**
- What empirical evidence exists that AI coding tools, agents, or internal build-it-yourself is measurably reducing SaaS seat demand or contract sizes?
- Is there measurable job displacement in SWE, customer support, sales ops, or marketing ops roles that historically drove SaaS seat expansion?
- How are incumbents (Salesforce Agentforce, ServiceNow Now Assist, Microsoft Copilot) monetising AI add-ons — is it additive revenue or cannibalising core seats?
- What does usage data from code-gen tools and agent platforms say about the "replace vs augment" question for enterprise software buyers?

**Overhiring hangover and macro**
- What is the state of tech sector layoffs, hiring freezes, and headcount ratios versus the 2021–2022 peak as of 2026?
- How have corporate IT budgets and software-specific capex trended since 2022, and what do CFO surveys (Gartner, IDC, Morgan Stanley CIO survey) say about 2026 intent?
- How much of SaaS growth deceleration is attributable to customer-side overhiring correction (fewer seats because fewer employees) versus genuine demand destruction?
- What is the relationship between interest rates, enterprise discount rates, and long-duration SaaS contract valuations in this cycle?

**Incumbent response and outlook**
- How are major SaaS vendors repositioning for an AI-native buying environment — pricing model changes, agent-layer products, M&A, R&D as % of revenue?
- What evidence supports or contradicts the view that AI makes incumbents stronger (data moats, distribution, customisation) versus more vulnerable (lower switching costs, easier replacement)?
- Are VCs and analysts (Altimeter, Battery, Bessemer, a16z, Redpoint) calling a floor, a secular decline, or a rotation to AI-native challengers?
- What near-term (12-month) and structural (3-year) scenarios do sell-side analysts lay out for the SaaS sector, and what do they disagree on most?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/saas-pocalypse.md" \
  --lanes financial,academic,vc,blogs \
  --from 2026-01 \
  --depth standard \
  --folder "saas-pocalypse"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

## Notes

- Output lands in `~/obsidian/research/saas-pocalypse/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise saas-pocalypse`
- Check batches: `./list-batches.sh`
