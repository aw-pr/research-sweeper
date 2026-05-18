# Research Brief: Compounding Waves — How Each Tech Era Built the Substrate, and the Skills, for the Next

## Topic string (paste into --topic)

```
The compounding economic logic of three successive technology waves from January 1995 to May 2026 — internet disintermediation of distribution, software-defined platforms and cloud infrastructure, and the current AI/agentic systems wave — examining the technical, economic and human-skills dependencies that make each wave a precondition for the next, the new categories of work each wave created, and whether the relationship is best understood as cumulative compounding or as externalised costs harvested by later layers.
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor.

## Sub-questions for synthesis to address

**The technical dependency chain**
- What specific artefacts from the internet/disintermediation wave (1995-2005) became preconditions for the software/cloud wave — payment rails, web standards, API conventions, classifieds disruption?
- What specific artefacts from the software/cloud wave (2005-2015) are preconditions for the current AI wave — hyperscale compute, CUDA/PyTorch, Kubernetes, distributed storage, the API economy?
- Trace one concrete end-to-end dependency chain (e.g. an LLM coding assistant) through all three waves to make the compounding chain explicit.
- Which "waves" of the same period did NOT compound into infrastructure (mobile, IoT, blockchain, VR) and why — what distinguishes substrate-becoming from application-staying?

**Training data as the load-bearing dependency**
- What share of frontier model training corpora derives from open-web sources created during wave one (Common Crawl, Wikipedia, Stack Overflow, GitHub, Reddit)?
- How are wave-one data sources being walled off in 2023-2026 (NYT v OpenAI, Reddit API monetisation, Cloudflare anti-bot, robots.txt enforcement, content licensing deals)?
- What is the empirical status of synthetic data, RLHF and licensed corpora as substitutes — and is wave three the last wave that consumes wave one's externality for free?

**People and emerging skills**
- Which categories of role were *invented* during each wave (webmaster, e-commerce merchandiser, cloud engineer, SRE, data scientist, ML engineer, prompt engineer, AI product manager) and what is the evidence on their growth rates and pay?
- What does the empirical labour-economics literature (Autor, Acemoglu, Brynjolfsson, Susskind, Frey & Osborne) show on net job creation vs displacement across the three waves?
- How did workers transition between waves in practice — retraining, lateral moves, generational replacement?
- What categories of new role are emerging in the AI wave (agent designers, evaluation engineers, AI safety researchers, model auditors, AI ops), and how do their growth trajectories compare to the early days of waves one and two?
- Where is the labour-economics consensus on whether wave three will follow the same role-creation pattern, or whether "this time is different" — what specific evidence cuts each way?

**Compounding vs externalised harvest**
- Where does the value actually accrue across the three waves — to original creators (publishers, open-source maintainers, enterprise IT), to platform owners, or to current-wave AI labs?
- Is "compounding dividend" or "externalised harvest" the more empirically defensible frame for the relationship between waves, and what specific evidence distinguishes them?
- How are economists treating intangible capital, externalities and path dependence in the current AI economy?

**So-what and the next constraint**
- What does the compounding view imply about hyperscaler concentration, AI value capture, and the productivity-paradox debate around current enterprise AI returns?
- Where is the next binding constraint emerging — energy, regulatory limits, data exhaustion, trust/verification, synthetic-data quality?
- Who pays for the next substrate layer, and on what evidence?

## Suggested command

Manual steps (run in your own terminal if needed):
1. `./batch-search.sh \`
2. `--brief-file "prompts/compounding-tech-waves.md" \`
3. `--lanes financial,academic,blogs,vc \`
4. `--from 1995 \`
5. `--to 2026 \`
6. `--depth deep \`
7. `--folder "compounding-tech-waves"`

## Notes

- Deep depth (5 rounds, 25 sources/lane, 1800-2400 word synthesis) — chosen for the 31-year date range and breadth of literature across three waves
- Lanes chosen for: macro/productivity and labour data (financial), economic theory and labour economics (academic), thesis pieces and Andreessen/Karpathy strand (blogs), current AI-economy narratives and venture-side labour forecasts (vc)
- Output lands in the Obsidian sweeps folder
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise compounding-tech-waves`
- Check batches: `./list-batches.sh`
