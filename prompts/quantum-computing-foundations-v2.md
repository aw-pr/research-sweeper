# Research Brief: Quantum Computing Foundations — A Briefing Note with Sources

## Topic string (paste into --topic)

```
Quantum computing fundamentals briefing — error correction, hardware architectures, computational advantage, and where the field stands — key papers, expert commentary, and lab progress from January 2023 to April 2026
```

## Sub-questions for synthesis to address

**Why quantum computers can outperform classical for specific problems**
- What recent papers or expert explainers best describe the theoretical basis for quantum speedup — which problem classes benefit and which provably do not?
- What do researchers say is the most honest current assessment of quantum advantage claims — where has genuine advantage been demonstrated versus where is it still theoretical?
- What are the best accessible explanations of why certain algorithms (Shor, Grover, VQE) work, from researchers or practitioners writing for a technical but non-specialist audience?

**Error correction — the hard problem**
- What are the leading published explanations of how surface codes and stabiliser codes work, and what physical-to-logical qubit ratios do current experiments achieve?
- What does recent lab work (Google, IBM, Microsoft, IonQ) show about progress toward fault-tolerant logical qubits — what milestones have been hit or missed?
- What do researchers and independent commentators say about the timeline and feasibility of fault-tolerant quantum computing — where is the honest disagreement?

**Hardware architectures — trade-offs and state of play**
- What recent reviews or comparisons cover the main qubit modalities (superconducting, trapped ion, photonic, neutral atom, topological) with honest trade-off analysis?
- What is the current state of topological qubits — what did Microsoft actually demonstrate, and how has the community received it?
- Which hardware approaches do independent researchers (not lab press releases) consider most credible paths to useful scale?

**Current state and realistic timelines**
- What do credible recent assessments (McKinsey Quantum, Nature reviews, independent researchers) say about realistic timelines to quantum utility or advantage at useful scale?
- What are the strongest published critiques of quantum computing hype — what do sceptical researchers argue?
- What should a technically literate non-specialist read to get an honest, sourced foundation — which papers, posts, or talks are most cited as good entry points?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/quantum-computing-foundations-v2.md" \
  --lanes academic,frontier,blogs \
  --from 2023 \
  --depth deep \
  --folder "quantum-computing-foundations-2026"
```

## Notes

- Output lands in `~/obsidian/research/quantum-computing-foundations-2026/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise quantum-computing-foundations-2026`
- Check batches: `./list-batches.sh`
- Previous attempt used wrong lanes (included financial/vc) and shallow/standard depth — this version uses academic,frontier,blogs at deep
