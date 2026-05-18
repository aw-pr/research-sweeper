# Research Brief: Agentic AI's Impact on Technology Operating Models and Architecture

## Topic string (paste into --topic)

```
Agentic AI's impact on enterprise technology operating models and architecture (January 2025–April 17th 2026): what stays (API infrastructure, data governance, SDLC controls), what shifts (DevOps as the new control plane, testing and rollback at agent speed, dark-code and agentic tech-debt governance), and whether frontier models like Anthropic's Mythos become embedded in CI/CD pipelines for security, code review, and release control
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor and are less likely to skip recent coverage.

## Sub-questions for synthesis to address

When you run with `--brief-file`, these are passed through to both the lane prompts and the synthesis prompt. Use them to shape what evidence gets collected and what the final report must answer.

**Operating model shift — roles, accountability, and controls**
- How is the influence of traditional enterprise controls — API infrastructure, data governance, identity/RBAC, SDLC controls, change management — shifting as agentic AI reshapes delivery: are they strengthening (because agent velocity makes them the last line of defence), weakening (because agents route around them), or being displaced by new primitives, and what does the evidence actually show?
- Which historically senior-engineer functions (architecture decisions, code review, technical standards, incident commander) are being automated, delegated to agents, or redistributed to platform teams — and which remain explicitly human?
- Where is accountability landing for agent-authored work in the operating model — platform engineering, SRE, specialist "AI engineering" functions, the CTO office, business product owners — and what do IT leadership sources (HBR, MIT Sloan, McKinsey, Gartner) actually recommend versus what early adopters are doing in practice?
- What does a coherent agentic-era operating model look like — team topologies, spans of control, capability groupings, where the "thinnest viable" human team sits — and where do Team Topologies, Spotify-style, and McKinsey/Gartner operating-model frameworks need adjustment for agent participation?

**Architecture at every layer — enterprise, business, solution, data, integration, security**
- How are enterprise architecture functions (TOGAF, ArchiMate, enterprise-architect practice) responding — reasserting authority as the only discipline that reasons across the whole system, being bypassed by agent-driven delivery teams, or redesigning their own methods for an agent-composable estate?
- How is business architecture (capability maps, value streams, operating-model and business-model canvases) being redrawn when agentic AI can realise capabilities directly — do business-architecture artefacts remain the governing abstraction for investment and change, or get replaced by machine-readable capability/service definitions that agents can compose against?
- What solution and application architecture patterns are emerging for agent-augmented systems — orchestrator/worker, planner/executor, deterministic core with probabilistic edge, human-in-the-loop gates — and how are microservices, modular monoliths, and event-driven decompositions holding up when agents author the services?
- How are data and integration architectures shifting — data mesh vs data fabric under agent consumption, vector stores and retrieval layers, data contracts as the hard interface between deterministic systems and agents, MCP and tool-use gateways evolving from API management, service meshes becoming agent-aware?
- How is security architecture being rebuilt — zero-trust extended to agent identities, ephemeral credentials for tool use, prompt-injection treated as a first-class threat class, policy-as-code at the agent/tool boundary, attestation and provenance (SBOM for AI / AI-BOM) for agent-authored artefacts?
- Where is the industry converging on canonical reference architectures for agentic systems — hyperscaler reference designs (AWS/Azure/GCP), CNCF landscape evolution, ThoughtWorks Technology Radar movements, IEEE/ACM pattern languages, Gartner/Forrester reference models — and where do they meaningfully diverge?

**Architecture–team–process symbiosis — Conway's Law and Team Topologies in an agentic era**
- How does Conway's Law extend when agents become non-human actors in the delivery system — do systems mirror the communication structures of hybrid human–agent organisations, and what kind of systems does that hybrid structure actually produce?
- Are Team Topologies' four team types (stream-aligned, platform, enabling, complicated-subsystem) and three interaction modes (collaboration, X-as-a-service, facilitating) still fit-for-purpose when agents participate — do agents sit inside stream-aligned teams, form their own topology, or expand the mission of platform and enabling teams into "agent platform" and "agent enablement"?
- Is the Inverse Conway Maneuver being applied deliberately to agentic-era architectures — designing the joint human/agent team structure to produce the intended system shape — and what early case studies (enterprise transformation programmes, hyperscaler internal use, scaleup practice) exist?
- How is cognitive load — Team Topologies' central concern — redistributing when agents absorb writing-code load but add review, governance, specification, and incident-response load: are teams genuinely freed up for higher-value work, or trading one form of load for another that is less well understood?
- Where are the leading practitioners on this symbiosis (Matthew Skelton, Manuel Pais, Allan Kelly, John Cutler, Gene Kim, Nicole Forsgren, Charity Majors, Jessica Kerr) converging or diverging in the agentic context, and how does their framing compare to classical Conway-era writing (Melvin Conway, Fred Brooks, Eliyahu Goldratt)?
- How does this symbiosis play back into architecture and process decisions — if team shape and agent fleet shape jointly determine the architecture that emerges, what does "architecture-first" even mean when the team/agent composition is itself the primary design variable?

**DevOps and platform engineering as the new control plane**
- Is there quantified evidence (DORA State of DevOps, DX, SPACE, Stack Overflow Developer Survey, ThoughtWorks reports) that DevOps maturity is a stronger predictor of successful agentic-AI adoption than model choice or tooling spend?
- How is the responsibility model shifting: what work formerly owned by senior developers and technical architects is moving into platform engineering, internal developer platforms, and the CI/CD pipeline itself?
- Which DevOps capabilities are becoming non-negotiable gates for agentic code — trunk-based development, feature flags, progressive delivery, SLO-driven rollout, change failure rate tracking?
- How are high-performing organisations (per DORA) structuring human-in-the-loop review, merge policy, and deployment approval when agents generate the majority of pull requests?

**Testing, rollback, and quality engineering under agentic delivery**
- How is the testing discipline changing when agents author most code: contract testing, property-based testing, mutation testing, generative test synthesis, observability-driven validation, chaos engineering — which of these are being elevated and why?
- What rollback and recovery patterns are emerging when change velocity exceeds traditional review throughput: instant revert, shadow deploys, canary gates, automated rollback on SLO breach, blue/green at agent cadence?
- How are teams detecting regressions introduced by agentic code: production observability, runtime assertions, eval-in-prod harnesses, differential testing against previous versions — and what is actually working in the field versus in vendor marketing?
- What is the empirical evidence (post-mortems, incident reports, industry surveys) on failure modes specific to agent-generated code: silent logic errors, spurious dependencies, prompt-injection vectors in generated code, subtle data-handling bugs?

**Live incident response — P1 recovery when agents authored the code**
- How is the P1/SEV-1 process changing when the person who "wrote" the failing code is an agent and no human can fully explain the change: who gets paged, who owns the bridge, who signs off on the fix?
- What is happening to MTTD and MTTR (time to detect / time to restore) under agentic delivery — is higher deployment velocity paired with faster recovery, or is detection lagging because nobody has the mental model of the shipped code?
- How are on-call rotations and escalation paths being restructured: do platform/SRE teams absorb more frontline response, are senior engineers reserved for deep diagnosis, and what is the evidence from DORA/SPACE/SRE industry surveys?
- What roles do AI copilots and agent-driven tooling play inside the incident itself — runbook execution, log triage, hypothesis generation, suggested rollback targets, draft comms — and where have they helped or harmed MTTR in published post-mortems?
- How are rollback and forward-fix decisions made at agent cadence: automated revert on SLO breach, feature-flag kill switches, progressive rollback, database-state reconciliation when an agent has written schema or data migrations?
- How are blameless post-mortems and learning reviews being adapted when the proximate author is a model version that no longer exists — what counts as a corrective action, and who owns follow-through?
- What quantitative signals are emerging (change-failure rate, incident rate per deploy, recurrence rate, customer-impact minutes) that distinguish well-run agentic delivery from the organisations quietly accumulating production risk?

**Dark code, agentic tech debt, and governance accountability**
- Where is the line between legitimate agent-authored code and "dark code" — code that is shipped but not understood, reviewed, or owned by any human — and how are leading organisations defining and measuring it?
- How does agentic tech debt compare structurally to legacy tech debt: accumulation dynamics, refactoring cost, organisational accountability, the half-life of debt when the original "author" is a model that no longer exists in that version?
- What governance frameworks, policy-as-code approaches, and code-provenance mechanisms (SBOM for AI, AI-BOM, signed model attestations, tool-use audit logs) are being adopted to make agentic code explainable and auditable?
- What do IT leadership sources (HBR, MIT Sloan Management Review, McKinsey, Gartner) say about organisational accountability for AI-authored code — who is on the hook when agentic code fails in production, and how does that shape operating-model design?

**Frontier models in the CI/CD pipeline — Mythos-class models as gatekeepers**
- What evidence exists that next-generation frontier models (Anthropic's Mythos, forthcoming OpenAI/Google/Meta tier, extended-thinking / long-horizon models) are being embedded directly into CI/CD — for code review, security scanning, architectural compliance, policy enforcement, release gating?
- How are vendors positioning advanced-model capabilities (long context, extended thinking, agentic tool use, sandboxed execution) as differentiators for pipeline integration versus raw developer assistance?
- Which security practices are being re-framed: threat modelling at PR time, supply-chain attestation by model, secrets detection, prompt-injection defence in generated code, model-reviewed IAM changes — and where is the empirical evidence of adoption (not just vendor claims)?
- What is the cost and latency envelope for model-in-the-pipeline today: sustainable at current frontier-model pricing, reliant on batch APIs, reserved for high-risk changes only, or trending toward default-on?

**Comparative positioning and outlook**
- Which organisations are publicly describing a coherent operating-model redesign (not just tool adoption) to accommodate agentic AI — and what does a credible benchmark look like in April 2026?
- Where are expert commentators (Martin Fowler, Simon Willison, Charity Majors, Kelsey Hightower, Adrian Cockcroft, Andrew Ng, Stratechery, iTone) converging and diverging on the "what stays / what goes" question?
- What are the 12–24 month signals to watch: DORA 2026/2027 findings, ThoughtWorks Radar volumes, hyperscaler CI/CD launches, enterprise post-mortems on agentic-code incidents, regulatory intervention on AI-authored code liability?

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/agentic-ai-operating-model-and-architecture.md" \
  --lanes financial,frontier,academic,vc,blogs,tech \
  --from 2025-01 \
  --depth deep \
  --folder "agentic-ai-operating-model-shift"
```

Or sync (if you want results without the batch wait):

```bash
npx ts-node research-sweep.ts --sync \
  --provider claude \
  --brief-file prompts/agentic-ai-operating-model-and-architecture.md \
  --lanes financial,frontier,academic,vc,blogs,tech \
  --from 2025-01 \
  --depth deep \
  --folder "agentic-ai-operating-model-shift"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

### Date anchor guide
| Scope         | Flag           |
|---------------|----------------|
| Last 6 months | --from 2025-10 |
| Last year     | --from 2025-04 |
| Last 16 months | --from 2025-01 |
| Custom window | --from YYYY-MM --to YYYY-MM |

## Notes

- Output lands in `~/obsidian/research/agentic-ai-operating-model-shift/`
- The `tech` lane (DORA, ThoughtWorks Radar, Martin Fowler, InfoQ, IEEE Software, ACM Queue, CNCF, HBR/MIT Sloan) is the primary source for the DevOps-as-control-plane and operating-model themes — it should carry most of the evidentiary weight for the "what stays" and "testing/rollback" sections
- The `frontier` lane will track Mythos and peer next-generation models — their release cadence and any vendor-signalled CI/CD positioning
- The `blogs` lane should pick up practitioner commentary (Simon Willison, Charity Majors, Kelsey Hightower, Martin Fowler's bliki, Stratechery) including any iTone thesis work — use it to cross-reference claims from the formal lanes
- A `_research-sweeper-stub.md` note is created before the sweep starts
- Existing `summary-*`, `sources-*`, and lane files are protected unless you pass `--overwrite`
- Re-run synthesis without new searches: `npx ts-node research-sweep.ts --re-synthesise agentic-ai-operating-model-shift`
- Check batch status: `./list-batches.sh`
- Resume manually: `./resume-batch.sh 1`
- "Mythos" is treated as a candidate next-generation Anthropic model name — if the frontier lane finds the real product name has landed differently by April 2026, the synthesis should reconcile
- Architecture coverage in this sweep is intentionally broad (one dedicated theme across EA, business, solution, data, integration, security). A follow-up narrower sweep on architecture specifically should drop `financial` and `vc` lanes and run `tech,frontier,academic,blogs` at `deep` — that gets you pattern-level density without enterprise-adoption noise
