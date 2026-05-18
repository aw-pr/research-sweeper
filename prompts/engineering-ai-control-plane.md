# Research Brief: Engineering AI Control Plane

## Topic string (paste into --topic)

```
Engineering AI control planes for software delivery from July 1, 2025 through April 24, 2026: how teams implement AI across development workflows and CI/CD, choose tools/models/SDKs, govern observability and compliance, manage reliability and provider availability, and handle cognitive debt, dark code, case studies, success stories, and failure modes across team size, company scale, and greenfield versus brownfield systems
```

## Sub-questions for synthesis to address

### 1. Adoption Patterns And Operating Models

- How are engineering teams using AI across planning, coding, code review, testing, release, documentation, incident response, and maintenance?
- Which workflows are becoming standard practice versus remaining experimental?
- How do adoption patterns differ across startups, scaleups, enterprises, regulated companies, platform teams, and product teams?
- What operating models are emerging: individual copilots, AI pair programming, agentic ticket execution, platform-provided AI control planes, internal developer portals, centralized enablement teams, or security-led governance?
- How does adoption differ between greenfield systems, brownfield systems, monorepos, legacy estates, regulated stacks, and high-change product environments?

### 2. Tool, Model, And SDK Selection

- How are teams choosing between Claude, Codex/OpenAI, Gemini, Mistral, open-weight models, local models, and specialist coding models?
- What tradeoffs are teams reporting across code quality, reasoning depth, latency, cost, context length, tool use, reliability, privacy, data residency, and integration maturity?
- Are teams using CLI-based agents, IDE assistants, hosted SaaS agents, direct SDK integrations, internal wrappers, or agent frameworks?
- Where are SDK-based integrations preferred over CLI tools, and where are CLI agents still more practical?
- How important is model availability and provider reliability? Are Claude, OpenAI, Gemini, or other providers experiencing enough downtime, rate limits, or quota instability to affect engineering workflow design?
- Are teams building multi-provider routing, fallback models, local model escape hatches, or queue-based workflows to handle provider outages and capacity limits?
- What role are open-weight models such as Mistral, Llama-family models, Qwen, DeepSeek, or specialist code models playing in enterprise engineering workflows?

### 3. CI/CD Integration And Delivery Controls

- Where are AI tools being inserted into CI/CD pipelines: PR review, test generation, flaky-test triage, dependency updates, security scanning, release notes, migration automation, deployment gating, rollback analysis, and incident retrospectives?
- What controls are teams placing around AI-generated or AI-modified code before merge and release?
- How are teams using policy-as-code, required human review, provenance labels, sandbox execution, eval gates, SAST, DAST, SCA, secrets checks, SBOMs, and approval workflows?
- What control plane capabilities are emerging around prompt and template management, model routing, tool permissions, audit logs, evals, cost controls, environment access, and data boundaries?
- Which vendors, platforms, OSS tools, and internal platform patterns appear repeatedly in credible reports and case studies?

### 4. Emerging Architecture Patterns And Practices

- What architectural patterns are emerging for AI-assisted engineering platforms: centralized orchestration services, per-team agents, internal developer platform extensions, CI/CD-native agents, repo-scoped agents, or event-driven automation?
- How are teams managing context: code indexing, retrieval, repo maps, architectural decision records, runbooks, design docs, dependency graphs, issue trackers, and incident history?
- How are tool permissions designed: read-only agents, sandboxed write agents, PR-only agents, deploy-capable agents, incident-response agents, or human-approved tool escalation?
- What patterns are emerging for model routing, fallback, evals, guardrails, prompt/version management, cost budgets, audit trails, and environment isolation?
- How are teams separating experimental AI automation from production delivery systems?
- What practices appear to reduce risk when deploying AI into brownfield systems with weak tests, unclear ownership, or high operational coupling?

### 5. Observability, Compliance, And Risk Management

- What telemetry do mature teams collect for AI-assisted engineering: prompt and tool traces, generated-code provenance, test coverage deltas, review bypasses, deployment outcomes, incident links, cost, latency, developer productivity, and security signals?
- How are organizations meeting compliance needs around SOC 2, ISO 27001, regulated data, IP and licensing, model residency, data residency, auditability, and separation of duties?
- What evidence exists that AI engineering controls reduce real failure risk rather than adding governance theater?
- How are platform and security teams balancing developer autonomy with least-privilege tool access, reproducible delivery, and auditable decision-making?

### 6. Outcomes, Case Studies, And Failure Modes

- What credible case studies or success stories show measurable improvements in lead time, review quality, test quality, migration speed, reliability, incident response, or developer satisfaction?
- What published failure modes, outages, regressions, security leaks, or near misses have been attributed to AI-assisted development or AI automation in software delivery?
- How are teams identifying and managing cognitive debt, dark code, unreviewed generated logic, prompt sprawl, hidden dependencies, brittle tests, and knowledge erosion?
- What leading indicators separate durable AI adoption from productivity theater: better flow metrics, fewer escaped defects, healthier code ownership, faster recovery, or simply more code produced?

### 7. Trend, Maturity, And Outlook

- What changed materially between July 1, 2025 and April 24, 2026 in model capability, coding agents, IDE integration, CI/CD platform support, enterprise governance, and security expectations?
- Which practices appear robust, repeatable, and evidence-backed?
- Which claims appear speculative, vendor-led, or unsupported by measurable outcomes?
- What should an engineering leader implement first when building a pragmatic AI control plane for software delivery?
- What open questions remain around liability, maintainability, developer skill formation, software supply chain risk, and long-term system health?

## Desired Output

Prioritize concrete evidence over broad commentary.

Look for:

- Public case studies from engineering organizations.
- Vendor and platform documentation where it reveals real implementation patterns.
- Practitioner writeups from engineering leaders, platform teams, SRE teams, DevSecOps teams, and security teams.
- Academic or empirical studies on AI coding tools, developer productivity, software quality, cognitive load, and security risk.
- Reports on incidents, outages, regressions, provider downtime, capacity constraints, or governance gaps caused or amplified by AI-assisted engineering.
- Evidence comparing Claude, Codex/OpenAI, Gemini, Mistral, open-weight models, local models, CLI agents, SDK integrations, and hosted AI engineering platforms.
- Evidence that distinguishes team size, company maturity, regulated versus unregulated environments, and greenfield versus brownfield systems.

Synthesize the findings into a practical map of the emerging engineering AI control plane: what it is, why teams need it, what controls matter, where AI belongs in CI/CD, how tool and model choice affects architecture, what risks are real, and what an engineering leader should do next.

## Suggested command

```bash
./run-secure-command.sh env -u ANTHROPIC_API_KEY npx ts-node research-sweep.ts --auth-check claude-oauth

./run-secure-sweep.sh --sync \
  --provider claude \
  --claude-auth claude-oauth \
  --brief-file "prompts/engineering-ai-control-plane.md" \
  --from 2025-07 \
  --to 2026-04 \
  --lanes financial,frontier,academic,vc,blogs,tech \
  --depth deep \
  --folder "engineering-ai-control-plane"
```

## Notes

- Use `./run-secure-sweep.sh` for Claude OAuth sync runs when `.env` contains `CLAUDE_CODE_OAUTH_TOKEN=op://...`; the wrapper hydrates the 1Password reference via `op run --env-file .env`, and explicit OAuth runs strip `ANTHROPIC_API_KEY` before the Agent SDK runs.
- A raw `npx ts-node research-sweep.ts ...` command only works for Claude OAuth if `CLAUDE_CODE_OAUTH_TOKEN` is already exported as a real token in that shell.
- Claude synthesis defaults to `claude-opus-4-5`; add `--synthesis-model claude-opus-4-7` only for especially detailed/expensive synthesis.
- The exact date cutoff is in the topic string: July 1, 2025 through April 24, 2026.
