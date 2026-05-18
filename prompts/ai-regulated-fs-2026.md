# Research Brief: AI in regulated financial services — UK, EU, US regulatory landscape

## Topic string (paste into --topic)

```
AI regulation in financial services across the UK, EU and US between May 2025 and May 2026, covering the FCA Mills Review and UK principles-based stance, the EU AI Act in operation, US federal and state patchwork, and how existing FS regulation (SM&CR, Consumer Duty, TCF, KYC/AML, model risk, SR 11-7) covers AI auditability and accountability.
```

Tip: This sweep is feeding a long-form iTone Substack post and a LinkedIn variant tied to a senior FS technology leadership job search. Synthesis should be usable as raw material for a 1,500-2,500 word post, not just a regulator briefing. The author has no prior position on the Mills Review and wants both background and a critical assessment.

## Sub-questions for synthesis to address

**UK regulatory direction and the Mills Review (background and critical assessment)**
- What is the FCA Mills Review: who commissioned it, what was its remit, when did it report, and what are its headline recommendations?
- How specifically does the Mills Review treat agentic AI, GenAI, and model accountability in financial services?
- What is the credible critique of the Mills Review from industry, academia, and consumer groups? Where does it fall short, and where is it strongest?
- How does the UK's principles-based, regulator-led approach (FCA, PRA, Bank of England) differ in practice from a horizontal AI Act, and what does the AI Opportunities Action Plan and Pro-Innovation white paper mean for FS firms in 2025-2026?
- How are SM&CR senior manager accountability rules being applied to AI deployment decisions inside FS firms, and which SMF holder typically owns the risk?

**EU AI Act and EU FS-specific AI regulation**
- Where is the EU AI Act in its phased application timeline as of May 2026, and which provisions are now in force for FS use cases?
- How are high-risk AI system designations affecting credit scoring, insurance pricing, fraud detection, KYC/AML, and customer-facing models?
- What is the interaction between the AI Act, GDPR, DORA, MiFID II, and the EBA / ESMA / EIOPA AI guidance?
- Has the EU approach become the de facto global standard (a "Brussels effect" on AI) or are firms and member states pushing back? Cite evidence either way, including any retreat, delay, or simplification moves in 2025-2026.

**US approach and federal-state dynamics**
- What is the current US federal posture on AI in FS under the 2025-2026 administration (rescinded executive orders, Treasury / OCC / FRB / SEC / CFPB output, NIST AI RMF adoption)?
- How does SR 11-7 model risk management guidance still anchor US bank AI governance, and where has it been extended for GenAI and agentic AI?
- Which US states (NY DFS Circular Letter, Colorado AI Act, California) are setting precedent for FS firms, and is this creating a state-level patchwork problem?
- How do US firms operating in UK and EU markets handle extraterritorial obligations?

**Existing FS regulation already covering AI auditability and accountability**
- How are Consumer Duty (UK), Treating Customers Fairly (TCF legacy and current application), and equivalent EU consumer protection rules being applied to AI-driven decisions?
- What auditability, explainability, and model documentation expectations exist under MaR, MiFID II, IFRS 17, Solvency II, and PRA SS1/23 (model risk management)?
- How are KYC, AML, sanctions screening, and transaction monitoring AI systems being regulated, including the FCA's stance on automated decisioning and the EU AMLR?
- Which existing regulatory tools (model risk frameworks, internal audit, three-lines-of-defence, board reporting) are FS firms repurposing for AI governance rather than building new ones?

**Cross-cutting themes for the post**
- Is regulatory divergence (UK principles vs EU prescriptive vs US patchwork) a genuine commercial risk for FS firms, or is convergence on common controls (model docs, human oversight, monitoring, audit trails) emerging in practice?
- Where is the senior accountability burden landing inside FS firms (CTO, CRO, Chief Compliance Officer, Chief Data Officer, SMF holder), and what does that mean for technology leadership hiring?
- What are the realistic gaps between regulator expectation and current FS practice on GenAI and agentic AI specifically, and where are the next 12 months of enforcement likely to land?

## Suggested command (Claude OAuth route, no API-key billing)

```
./batch-search.sh \
  --claude-auth claude-oauth \
  --brief-file "prompts/ai-regulated-fs-2026.md" \
  --lanes financial,frontier,academic,blogs \
  --from 2025 \
  --to 2026 \
  --depth deep \
  --folder "ai-regulated-fs-2026"
```

### Depth justification

`deep` because: four jurisdictions in scope (UK, EU, US, plus implicit global), competitive/comparative framing required, output is feeding a long-form post for a public audience, and "has the EU AI Act fallen out of favour" is itself a thesis question that needs broad source coverage to defend.

## Notes

- Output lands in the configured research-sweeper Obsidian path.
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise ai-regulated-fs-2026`
- Check batches: `./list-batches.sh`
