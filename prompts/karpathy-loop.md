# Research Brief: The Karpathy Loop — AI Agents Running Autonomous Training Experiments

## Topic string (paste into --topic)

```
The "Karpathy loop" — autonomous AI agent research cycles that run and evaluate ML training experiments to discover improvements, April 2025–April 19 2026, including Karpathy's own explanations, independent commentary, and real-world implementations
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor.

## Sub-questions for synthesis to address

**Karpathy's own framing**
- Has Karpathy described this loop in a talk, blog post, tweet/X thread, or video? What is his canonical explanation?
- What specific problem does the loop solve — is it about automating hyperparameter search, architecture search, or full experiment design?
- Does he name it "the Karpathy loop" himself, or is that a community label?

**Mechanics and approach**
- What is the high-level structure: how does an agent propose, run, evaluate, and iterate on a training experiment?
- What guardrails or evaluation criteria are used to decide whether an experiment result is trustworthy?
- How does it differ from prior AutoML or Neural Architecture Search (NAS) approaches?

**Examples and evidence**
- Are there public implementations, repos, or demos that show the loop in practice?
- Which organisations or researchers have replicated or extended the approach?
- What concrete training improvements (accuracy gains, efficiency, novel architectures) have been reported?

**Trend and outlook**
- How is this being positioned relative to the broader "AI scientist" / autonomous research agent trend?
- What limitations or failure modes have been identified by practitioners?

## Suggested command

Manual steps (run in your own terminal if needed):
1. `./batch-search.sh \`
2. `--brief-file "prompts/karpathy-loop.md" \`
3. `--lanes frontier,blogs,tech \`
4. `--from 2025-04 \`
5. `--depth shallow \`
6. `--folder "karpathy-loop"`
