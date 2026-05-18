# Research Brief: AI API Reliability Comparison

## Topic string (paste into --topic)

```
AI API service reliability 2023–present: Anthropic, OpenAI, and Google downtime statistics, incident history, SLA terms, and how availability track records have changed over time
```

Tip: Include the date range in the topic string itself — lane agents use it as a search anchor and are less likely to skip recent coverage.

## Sub-questions for synthesis to address

**Downtime and incident history**
- What are the documented downtime rates and major incidents for Anthropic (Claude API), OpenAI (API and ChatGPT), and Google (Gemini API / Vertex AI) since 2023
- How have outage frequency and duration changed over time for each provider — are they improving or degrading as scale increases
- What are the most significant incidents (date, duration, affected services, root cause if disclosed) for each provider

**SLA commitments and reliability standards**
- What SLA uptime guarantees does each provider publish, and do measured uptime stats match published commitments
- How do enterprise-tier SLAs differ from standard API access across Anthropic, OpenAI, and Google
- Are there independent third-party monitoring sources (e.g. status pages, downdetector, APImetrics) that track these reliably

**Comparative positioning**
- Which provider has the strongest reliability track record over 2023–2025
- Where are the gaps most visible — inference latency, batch processing, API availability, or rate-limit behaviour
- What do enterprise buyers and analysts say about reliability as a selection criterion when choosing between providers
- Are there published benchmarks, reports, or analyst notes (Gartner, Forrester, IDC) that rank AI API reliability

**Trend and outlook**
- What patterns suggest reliability is improving or worsening as each provider scales
- Are there structural factors (infrastructure, redundancy architecture, model size) that correlate with downtime patterns
- Where are graphs, dashboards, or time-series data publicly available that visualise uptime trends

## Suggested command

```bash
./batch-search.sh \
  --brief-file "prompts/api-reliability-comparison.md" \
  --lanes financial,frontier,academic,vc \
  --from 2023 \
  --depth standard \
  --folder "api-reliability-comparison"
```

### Depth guide
| Depth    | Rounds | Sources/lane | Synthesis length        | Best for                          |
|----------|--------|--------------|-------------------------|-----------------------------------|
| shallow  | 2      | 5            | 300–400 words           | Quick orientation, narrow topics  |
| standard | 3      | 10           | 700–900 words           | Most research briefs              |
| deep     | 5      | 25           | 1800–2400 words         | Broad or competitive topics       |

## Notes

- Output lands in `~/obsidian/research/api-reliability-comparison/`
- Status pages to note: status.anthropic.com, status.openai.com, status.cloud.google.com
- Synthesis should flag wherever a graph or time-series visualisation exists as a source
