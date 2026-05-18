import { DEPTH_CONFIG, LANE_CONFIG, LANE_PREFIX } from "./config";
import { Lane, LaneResult, SweepConfig } from "./types";

function presentDate(): string {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const STYLE_RULES = `## Style rules (these outputs are published)

- British English throughout (optimise, organisation, behaviour, programme, centre).
- No em dashes. Use commas, full stops, parentheses, or restructure.
- Short paragraphs: 2–4 sentences each. Vary sentence length within a paragraph.
- Active voice. Concrete nouns and verbs. Name publications, people, numbers.
- No hedging openers ("In today's…", "It's worth noting…", "In conclusion…").
- No AI-tell vocabulary: delve, leverage (verb), unlock (verb), robust, seamless, cutting-edge, ever-evolving, game-changer, paradigm shift (as filler), navigate the complexities, testament to, tapestry, in the realm of, fascinating, crucially, holistic, ecosystem (unless literal), transformation (without an object).
- Dry, analytical, skeptical-not-cynical register. No corporate-deck adjectives. No moralising.`;

// Shared lane scaffolding. This block is identical across all six lanes and is
// the prime cache target. It must clear 1024 tokens to be cacheable on Sonnet
// and Opus (≈4096 characters at the 4-chars-per-token rule of thumb). Keep
// content here that is genuinely stable across lanes — schema, citation rules,
// output discipline, style rules — so the cache stays warm for the whole sweep.
export const SHARED_LANE_SCAFFOLDING = `You are conducting one lane of a structured, multi-lane research sweep. Six specialist lanes run in parallel and a synthesis pass combines them. Your job is to surface high-quality sources and an analytical short narrative for your single assigned lane.

## Output discipline

Return ONLY a single JSON object — no preamble, no postscript, no markdown fences around it, no commentary. The JSON must be parseable by JSON.parse on the raw text. Use double quotes for all keys and string values. Do not include trailing commas. Do not include comments. Do not wrap the JSON in any code block. If you would otherwise write "Here is the JSON:" or similar — do not.

## Output schema

The JSON object must follow this exact shape:

{
  "lane": "<lane id>",
  "label": "<lane label>",
  "sources": [
    {
      "title": "Full title of article, paper, or report",
      "url": "Exact URL retrieved from web search — do not fabricate, do not guess, do not shorten",
      "date": "YYYY-MM or YYYY",
      "outlet": "Publication or venue name",
      "significance": "One sentence on why this source matters for the research topic"
    }
  ],
  "narrative": "A short summary (2–4 paragraphs, each 2–4 sentences) of what this lane's sources reveal. Tight paragraphs — these are published. Be specific: name publications, people, numbers.",
  "model_context": "Analytical background from your training knowledge about this lane's domain — 3–5 short paragraphs (2–4 sentences each) on key structural dynamics, historical context, dominant players, or conceptual framing that web searches alone may not surface. This is explicitly model knowledge, not sourced claims. Do not include URLs here."
}

## Source quality rules

- Every entry in "sources" must be a real document retrievable via your provided search tool. If you cannot find a source by search, do not invent one. A shorter list of real sources is always better than a long list with one fabricated entry.
- Prefer primary sources over commentary: company filings, lab papers, government data, standards documents, conference proceedings, named-author practitioner reports.
- Prefer recent coverage where the topic is moving fast (last 18 months) but include foundational older sources where they remain canonical.
- Prefer named outlets over aggregators. Avoid press releases dressed as analysis.
- Each source's "significance" sentence must say something specific to the topic — not "this is a useful overview".

## Citation and URL rules

- Do not paraphrase a URL. Either retrieve and copy it exactly from the search result, or omit the source.
- Do not include tracking parameters or referrer fragments in URLs.
- Do not hyperlink inside the narrative — narrative prose is plain text, citation is via the structured "sources" array.
- "date" should be the publication date of the source, not the date you retrieved it. Use YYYY-MM where you can, YYYY otherwise.

## Narrative vs model_context

The "narrative" field is grounded in the sources you returned. Every non-trivial factual claim in "narrative" should be supportable by one of those sources. "model_context" is the opposite: explicit, declared model knowledge — historical framing, structural dynamics, conceptual background — that web searches alone may underserve. Do not blur the two. Do not put URLs in model_context. Do not put unsourced numeric claims in narrative.

${STYLE_RULES}

## Final checks

Before returning, verify:
1. The output is a single JSON object, parseable, with no surrounding prose.
2. Every URL in "sources" is real and exact, not paraphrased.
3. "narrative" contains 2–4 short paragraphs and no markdown hyperlinks.
4. "model_context" contains 3–5 short paragraphs of explicit model knowledge with no URLs.
5. Style rules are observed. British English. No em dashes. No banned vocabulary.
`;


function toLabel(config: SweepConfig): string {
  return config.toYear != null ? String(config.toYear) : presentDate();
}

export function buildLanePrompt(lane: Lane, config: SweepConfig): string {
  const lc = LANE_CONFIG[lane];
  const dc = DEPTH_CONFIG[config.depth];
  const briefingSection = config.briefing
    ? `

## Research brief context

Use these research questions and angles to prioritise coverage for your lane. You do not need to answer them one-by-one, but the sources and narrative you return should help the synthesis answer them.

${config.briefing}`
    : "";

  const searchInstruction = config.noSearch
    ? `Draw on your training knowledge to identify the most relevant sources for this topic within your lane. Include sources you know to be authoritative and relevant.`
    : `You MUST use the web_search tool to find sources — do not rely on training data for source discovery. All entries in "sources" must come from actual web searches. Run up to ${dc.searchRounds} targeted searches. If a search returns no useful results, try a different query.`;

  // Lane-specific addendum only — the shared scaffolding (schema, style rules,
  // citation rules, output discipline) lives in the system array and is cached
  // across all six lanes per sweep.
  return `## This lane

TOPIC: ${config.topic}
DATE RANGE: ${config.fromYear} to ${toLabel(config)}
LANE: ${lc.label} (id: ${lane})
OUTLETS TO PRIORITISE: ${lc.outlets.join(", ")}
SEARCH FOCUS: ${lc.searchFocus}
TARGET SOURCES: approximately ${dc.sourcesPerLane} high-quality sources

## Search behaviour

${searchInstruction}

Prioritise your assigned outlets, but do not limit yourself to them — include high-value sources outside the list (industry surveys, practitioner reports, government data, standards bodies, professional associations) when they offer coverage not found in the primary outlets. Prioritise quality over quantity.

Search across the full date range (${config.fromYear}–${toLabel(config)}), prioritising recent coverage from the last 18 months.${briefingSection}

Return ONLY the JSON object as defined in the system instructions. Use "${lane}" as the "lane" value and "${lc.label}" as the "label" value.`;
}

export function buildSynthesisPrompt(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): string {
  const laneNarratives = laneResults
    .map((result) => {
      const parts = [`### ${result.label}`, "", result.narrative];
      if (result.model_context) {
        parts.push("", "**Domain context (model knowledge):**", result.model_context);
      }
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
  const numberedSources = laneResults.flatMap((result) =>
    result.sources.map((source, index) => {
      const id = `${LANE_PREFIX[result.lane]}${index + 1}`;
      return `${id}: [${source.outlet || result.label}] ${source.date || "n.d."} — ${source.title}`;
    })
  );
  const dc = DEPTH_CONFIG[config.depth];
  const briefingSection = config.briefing
    ? `
## Research questions to answer

Use the following brief as part of the synthesis objective. Treat it as explicit guidance on what the final report should surface.

${config.briefing}
`
    : "";

  return `You are a senior technology research analyst assembling a sweep summary from parallel specialist research agents.

Each lane provides two things: (1) sourced findings from real web searches with citations, and (2) domain context from model knowledge. Use sourced findings as the evidentiary backbone — cite them inline. Use domain context to add depth, framing, and structural understanding where sources alone are thin. Never cite model context as if it were a retrieved source.


TOPIC: ${config.topic}
DATE RANGE: ${config.fromYear}–${toLabel(config)}
DEPTH: ${config.depth} (${laneResults.length} lanes, ~${dc.sourcesPerLane} sources each)
${briefingSection}

## Lane narratives

${laneNarratives}

## Available sources — cite using ${sourcesName} > ^id

${numberedSources.join("\n")}

Citation format requirements:
- Do not include raw URLs in summary prose.
- Do not include markdown hyperlinks in summary prose.
- Keep prose readable (company names, reports, metrics) and move references to a separate line under the sentence/paragraph.
- Use this exact reference style on its own line, with the outlet name as the link text:
  Sources: [[${sourcesName}#^f1|Outlet Name (Year)]]; [[${sourcesName}#^a3|Outlet Name (Year)]]
- Every non-trivial factual claim should be supported by one or more IDs.
Do not write a Source Index section — sources are written separately.

${STYLE_RULES}

Additional synthesis rules:
- Prose-led. Bullets only for genuine enumeration (e.g. three category errors, four proof points), never as primary structure.
- Declarative headers, short and a little playful where it lands. No rhetorical-question headers.
- Open with strength: a concrete claim, a number, or a hook. No throat-clearing.
- Close with a punchline or implication. No recap paragraph. No "in summary".
If you include a chart spec (for example Mermaid, Vega-Lite, Chart.js, or HTML/SVG), use colour only when it encodes meaning. For a single series, use one consistent bar/line colour and avoid per-bar rainbow styling.
Do not describe colours in prose unless colour itself carries analytical meaning.

## Your task

${dc.synthGuide}`;
}
