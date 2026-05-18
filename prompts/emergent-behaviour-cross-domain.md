# Research Brief: Emergent Behaviour Across Disciplines

## Topic string (paste into --topic)

```
The science of emergent behaviour and self-organisation from 2015–May 2026, connecting reaction-diffusion and cellular-automata models to commercial markets, organisational behaviour and culture, ecology, biology, physics and chaos theory, including foundational algorithms and their cross-domain explanatory power.
```

## Sub-questions for synthesis to address

**Foundational models and algorithms**
- List and characterise the famous emergence/artificial-life algorithms: Conway's Game of Life and other cellular automata (Wolfram's elementary CA, Langton's Ant/Loops), Reynolds' Boids, Turing patterns, L-systems, slime-mould (Physarum) models, agent-based models (Schelling segregation, Sugarscape), ant-colony/stigmergy and particle swarm. For each: origin, rule set, and what emergent phenomenon it demonstrates.
- Explain the Gray–Scott reaction-diffusion model specifically: the governing equations, the feed/kill parameter space, the pattern regimes it produces (spots, stripes, mitosis, solitons), and why it is a canonical demonstration of self-organisation.
- How do these discrete/continuous models relate to one another mathematically — what unifies cellular automata, reaction-diffusion systems and agent-based models as generators of emergence?

**Theoretical underpinnings: chaos, physics, complexity**
- How do chaos theory and nonlinear dynamics (attractors, bifurcation, sensitive dependence) relate to emergence, and where do they differ?
- What role do thermodynamics and statistical physics play — dissipative structures (Prigogine), self-organised criticality (Bak's sandpile), phase transitions, and the edge of chaos?
- What is the current scientific position on "strong" vs "weak" emergence, downward causation, and whether emergence is ontological or epistemic?

**Commercial markets and organisational behaviour (priority theme)**
- Commercial markets as complex adaptive systems: complexity economics (Santa Fe Institute / W. Brian Arthur, Eric Beinhocker), agent-based macro and market microstructure, herding, information cascades, bubbles and flash crashes as emergent phenomena.
- Internal organisational behaviour and culture as emergence: how culture, norms, coordination and informal networks self-organise from local interactions rather than top-down design; Stacey's complexity and management, complex responsive processes, self-organising/teal organisations, agile and team topologies as applied emergence.
- Who are the notable authors, researchers and practitioners writing specifically about emergence in firms and markets (academics, consultants, Substack/independent essayists), and what are their core claims?
- Where has an emergence/complexity lens produced genuine predictive or managerial gains in business versus where it remains descriptive metaphor or buzzword?

**Other cross-domain applications**
- Ecology and biology: morphogenesis, pattern formation in animal coats and shells, flocking/schooling, ecosystem dynamics, evolutionary and developmental emergence.
- Common formal machinery shared across markets, ecosystems and physical systems (networks, feedback, criticality) — and the limits of the analogy.

**Trend and outlook**
- What recent (2015–2026) developments — machine learning for pattern discovery, neural cellular automata, large-scale agent-based simulation — are changing how emergence is studied and applied to organisations and markets?
- Which open problems and critiques are most active in the complexity-science and complexity-economics communities?

## Suggested command

```
./batch-search.sh \
  --brief-file "prompts/emergent-behaviour-cross-domain.md" \
  --lanes academic,blogs,financial \
  --from 2015 \
  --to 2026 \
  --depth deep \
  --folder "emergent-behaviour-cross-domain"
```

## Notes

- Output lands in `~/obsidian/research/emergent-behaviour-cross-domain/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise emergent-behaviour-cross-domain`
- Check batches: `./list-batches.sh`
