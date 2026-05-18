# Research Brief: Agentic RAG — Evolution, Challenges, and Decision Criteria

## Audience and tone

Senior engineering and AI leaders evaluating RAG architectures for production. Dry, analytical, specific. Written for publication on iTone (consistently curious). British English. Short paragraphs (2–4 sentences). No corporate-deck adjectives, no hedging, no AI-tell vocabulary.

## Topic string (paste into --topic)

```
Agentic RAG between November 2025 and May 2026: how retrieval-augmented generation is shifting toward agent-driven architectures, the operational problems (token burn, context management, latency, reliability), information-organisation patterns such as context catalogues and semantic categorisation, parallels with traditional data warehousing (dimensions, measures, star schemas), the evolving RAG tooling landscape, and decision criteria for switching to pure agentic workflows.
```

## Sub-questions for synthesis to address

**RAG foundations and the shift to agentic patterns**

- What is the standard RAG pipeline (chunking, embedding, retrieval, generation) and which use cases does it address well?
- How does agentic RAG differ architecturally — where do agents replace or wrap static retrieval steps?
- Which deployment patterns (multi-hop retrieval, iterative refinement, tool-augmented agents, query planning) are gaining traction since November 2025?
- What real-world use cases have driven the move from static RAG to agentic RAG?

**Operational problems with agentic RAG**

- How does agentic RAG drive token burn, and what cost multipliers are practitioners reporting versus static RAG?
- What context-management failure modes emerge at scale (context overflow, retrieval noise, lost-in-the-middle degradation)?
- How do latency, reliability, and observability challenges differ between agentic and static RAG pipelines?
- What failure rates and hallucination patterns are specific to agentic retrieval loops?

**Information organisation patterns — context catalogues and categorisation**

- What is a context catalogue and how is it being used to manage retrievable knowledge in agentic systems?
- How are practitioners categorising and tagging information (semantic layers, ontologies, metadata schemas) to make retrieval agent-friendly?
- How closely do these patterns map to traditional data warehousing concepts (fact tables, dimensions, measures, star schemas)? Where do the analogies break down?
- Are there emerging standards or frameworks for information architecture in agentic RAG that parallel dimensional modelling?

**RAG tooling landscape and evolution**

- Which frameworks (LangChain, LlamaIndex, Haystack, DSPy, others) dominate RAG deployments and how are they evolving for agentic use?
- What vector database and retrieval infrastructure (Pinecone, Weaviate, pgvector, Qdrant) is seeing the most enterprise adoption?
- How are evaluation and observability tools (Ragas, LangSmith, Arize, Weights & Biases) maturing to handle agentic retrieval loops?
- What does the vendor and investment landscape look like — which RAG tooling companies are scaling and which are being displaced?

**When to switch to pure agentic workflows**

- For which use cases is static RAG clearly superior to agentic RAG (cost, latency, predictability)?
- What signals or thresholds (query complexity, knowledge graph depth, tool diversity) indicate a system should move to a pure agentic workflow?
- What are the switching costs and risks of migrating a production RAG system to an agent-first architecture?
- Where does evidence show pure agentic workflows outperforming RAG on accuracy, completeness, or user value?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/agentic-rag-evolution.md" \
  --lanes academic,frontier,tech,blogs,vc \
  --from 2025 --to 2026 \
  --depth deep \
  --folder "agentic-rag-evolution"
```

### Depth rationale

`deep` — five themes, broad tooling landscape, comparative angle (data warehousing analogies). 25 sources per lane, 1800–2400 word synthesis.

### Lane rationale

- `academic` — RAG papers, benchmarks, agentic retrieval empirics
- `frontier` — model and API changes affecting retrieval (context windows, native tool use, native RAG features)
- `tech` — practitioner architecture patterns, ThoughtWorks Radar, InfoQ, Martin Fowler
- `blogs` — Substack and LessWrong independent analysis, thesis-level commentary
- `vc` — RAG tooling investment narratives, market sizing

## Notes

- Output lands in `~/obsidian/research/agentic-rag-evolution/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise agentic-rag-evolution`
- Check batches: `./list-batches.sh`
