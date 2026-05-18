# Research Brief: Stephen Wolfram's Ruliad and Computational Irreducibility

## Topic string (paste into --topic)

```
Stephen Wolfram's research programme on the ruliad and computational irreducibility from January 2020 to May 2026, covering the Wolfram Physics Project, the ruliad as the structure of all possible computations, computational irreducibility and observer theory, and the framework's connections to AI and the foundations of physics.
```

Tip: includes the date range as a search anchor.

## Sub-questions for synthesis to address

**The ruliad as a construct**
- How does Wolfram define the ruliad formally, and what is the precise relationship to multiway systems and hypergraph rewriting?
- How has the definition evolved between the 2020 Wolfram Physics Project launch and the later essays (2023–2026)?
- What are the strongest objections from working physicists to treating the ruliad as a useful object rather than a metaphor?

**Computational irreducibility**
- What operational definition does Wolfram use, and where does it differ from classical undecidability and Chaitin-style incompleteness?
- Which empirical or mathematical results since 2020 have either reinforced or undercut the claim?
- How do AI researchers (interpretability, alignment, scaling) invoke computational irreducibility — substantively, or rhetorically as a stopping point?

**Observer theory and the perceiver**
- What is the "computational boundedness of the observer" thesis, and how does it interact with the ruliad?
- How do philosophers of physics and the foundations community frame the observer dependence?
- Are any concrete predictions on offer, or are the claims interpretive?

**Reception, lineage and critique**
- How has the mainstream physics community received the Physics Project — independent replication, peer-reviewed coverage, conference engagement?
- Who are the most credible independent voices building on or critiquing the framework (Jonathan Gorard, Scott Aaronson, Sabine Hossenfelder, others)?
- What is the relationship to adjacent programmes — causal set theory, emergent gravity, digital physics, constructor theory?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/wolfram-ruliad-irreducibility.md" \
  --lanes academic,frontier,blogs,tech \
  --from 2020 \
  --to 2026 \
  --depth standard \
  --lane-model sonnet \
  --folder "wolfram-ruliad-irreducibility"
```

`--lane-model sonnet` is included so the new prompt-cache block (~1167 tokens) actually fires — the default Haiku model at standard depth has a 2048-token cache minimum and would not cache.

## Notes

- Output lands in `~/obsidian/research/wolfram-ruliad-irreducibility/`
- Re-synthesise: `npx ts-node research-sweep.ts --re-synthesise wolfram-ruliad-irreducibility`
- Check batches: `./list-batches.sh`
- Cache proof post-run: `jq '.[-1] | {model, tokens, estimatedCostUSD}' runs/stats.json`
