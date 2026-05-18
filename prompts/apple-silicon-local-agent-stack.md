# Research Brief: Local LLM Serving on Apple Silicon for an Agentic CLI (Nov 2025 – May 2026)

## Role, audience and tone

**Role for lane and synthesis agents:** Senior ML-infrastructure engineer evaluating local LLM serving on Apple Silicon for a security-conscious agentic CLI (OpenClaw-style: gateway daemon, tool-calling embedded agent, always-on, loopback-bound).

**Audience:** Senior engineering and AI-platform leaders choosing a local-model stack for an agent harness on M-series Macs in 2026. Dry, analytical, specific. Suitable for publication on iTone (British English, short paragraphs of 2–4 sentences, never more than five lines, no corporate-deck adjectives, no hedging, no AI-tell vocabulary).

**Output contract for every lane:**
- Bulleted findings preferred over prose; one claim per bullet.
- Every claim carries a source link inline.
- When sources disagree, name the conflict explicitly — do not average.
- Recency gate: ignore sources published before 2025-11-01 unless they are foundational reference material (cite the foundational source once and move on).
- Quantitative comparisons (tokens/sec, RAM at context N, tool-call success %) preferred over adjectives.

## Topic string (paste into --topic)

```
Local LLM serving on Apple Silicon for agentic, tool-using CLIs between November 2025 and May 2026: serving runtimes (Ollama, llama.cpp, MLX, LM Studio, vLLM-on-Metal), tool-capable open models in the 1B–32B range as always-on local defaults, agent-harness patterns for small-context tool calling, and macOS isolation patterns for running a model daemon alongside an agent gateway under a separate user, sandbox-exec, container, or VM boundary.
```

## Sub-questions for synthesis to address

**Serving runtimes on Apple Silicon**

- How do Ollama, llama.cpp, MLX, LM Studio, and any Metal-backed vLLM/SGLang variant compare on M-series in Nov 2025 → May 2026 for tokens/sec, time-to-first-token, and steady-state RAM at 4k / 8k / 32k context?
- Which runtimes expose a stable daemon/HTTP surface suitable for an always-on gateway, and which still assume interactive use?
- How faithfully does each runtime implement OpenAI-style tool/function calling — do tool-call schemas survive round-trip, are streaming tool calls supported, and what are the known failure modes?
- What is the practical memory ceiling on 32 GB / 64 GB / 128 GB / 192 GB Apple Silicon for running a model daemon next to a browser, an IDE, and an agent gateway without thrashing?

**Tool-capable open models for an always-on local default**

- Which open models released or revised between Nov 2025 and May 2026 in the 1B–32B band are genuinely tool-capable on Ollama / MLX (Qwen3 family, Llama 3.3 / 4, Gemma 3, Mistral Small / Devstral, DeepSeek, Phi, Granite, others)?
- What do BFCL, tau-bench, SWE-bench-Verified-style and agent-leaderboard scores look like at each size on Apple Silicon, and which models punch above their weight on tool-call reliability specifically?
- What are the realistic context-vs-latency trade-offs for sub-2B, 7B-class, and 14–32B models on M-series — where does context above 8k stop being free?
- For an OpenClaw-style harness whose system prompt already consumes most of a 4k window, which models stay coherent at 4k–8k effective context with `--thinking off`?

**Agent-harness patterns and small-model failure modes**

- What harness changes (thinking budgets, retry logic, structured-output coercion, tool-schema simplification) measurably improve tool-call reliability on small local models since late 2025?
- When does the evidence say to fall back from a local default to a frontier API — task complexity, tool count, plan depth, latency budget?
- What are the dominant failure modes documented for small Ollama/MLX models on agent loops (silent tool-call drops, malformed JSON, hallucinated tool names, context-overflow into truncated tool args) and which mitigations actually work?
- Are there agent harnesses (Aider, Cline, Claude Code, OpenClaw, Continue, Goose) publishing concrete configs for local-only operation that others can lift?

**macOS isolation patterns for a model daemon plus agent gateway**

- What is the current state of the art (Nov 2025 – May 2026) for isolating a long-running model + agent process on macOS: dedicated standard user, sandbox-exec profile, container (Docker / OrbStack / Apple Container Framework), or full VM (Parallels / UTM / Apple Virtualization)?
- What are the TCC (microphone, Accessibility, Screen Recording) implications of running the gateway under a service user while the main user runs a menu-bar client — what breaks, what survives?
- How does Apple's Container Framework / `container` CLI in macOS 15/16 change the isolation calculus versus Docker Desktop and OrbStack for a local model daemon?
- Where is the documented evidence on the cost of crossing the host/VM boundary for local model traffic (latency, throughput, file-share semantics) versus keeping the daemon on the host under a separate user?

**Decision framework and outlook**

- For a security-conscious agentic CLI on a 64 GB M-series Mac in mid-2026, what is the defensible default stack (runtime + model + isolation) and what are the top three swap-out conditions?
- Which 2026 trajectories (model releases, runtime maturity, Apple platform changes) most likely invalidate that default within 6–12 months?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/apple-silicon-local-agent-stack.md" \
  --lanes frontier,academic,tech,blogs,vc \
  --from 2025-11 --to 2026-05 \
  --depth deep \
  --folder "apple-silicon-local-agent-stack" \
  --synthesis-model claude-opus-4-7 \
  --lane-model claude-opus-4-7
```

### Depth rationale

`deep` — five themes, broad runtime + model + isolation matrix, comparative and decision-framework angles. 25 sources per lane, 1800–2400 word synthesis.

### Lane rationale

- `frontier` — model and runtime releases, Ollama / MLX / llama.cpp changelog, Apple platform changes affecting local serving.
- `academic` — agentic and tool-call benchmarks (BFCL, tau-bench, SWE-bench-Verified), small-model evaluation papers since Nov 2025.
- `tech` — practitioner posts, ThoughtWorks Radar, InfoQ, IEEE/ACM, hands-on Apple Silicon benchmarks.
- `blogs` — Substack / LessWrong / personal blogs with hands-on M-series numbers and harness configs.
- `vc` — investment narratives around local-first agents, on-device inference, and Apple Silicon ML tooling.

(Skipping `financial` — enterprise adoption framing is not the angle here.)

## Notes

- Output lands in `~/obsidian/research/apple-silicon-local-agent-stack/`
- Re-run synthesis: `npx ts-node research-sweep.ts --re-synthesise apple-silicon-local-agent-stack`
- Check batches: `./list-batches.sh`
- Synthesis output should be Obsidian-ready (frontmatter + wikilinks where relevant), publishable quality.
