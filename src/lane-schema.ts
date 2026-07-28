import { SourceItem } from "./types";

// Strict response-schema enforcement for lane output.
//
// Field-name drift (the model renaming `narrative` -> `research_summary`, or a
// source's `significance` -> `core_relevance`) caused two silent-failure bugs.
// Enforcing a schema at the model layer fixes the contract so the parser stops
// guessing. Wiring:
//
//   - OpenAI api-key: Responses API `text.format` json_schema (strict).
//   - OpenAI codex-cli: the same schema passed via `codex exec --output-schema`
//     (verified available on codex-cli 0.144.4).
//   - Claude api-key: a `submit_lane_findings` tool whose input_schema is the
//     contract. With search enabled, `tool_choice: any` forces some tool use;
//     the prompt requests web search first, but that setting alone cannot
//     guarantee which offered tool the model chooses.
//
// Gemini is excluded: Google Search grounding and JSON structured output are
// mutually exclusive in the Gemini API. The Claude OAuth / Agent SDK route is
// excluded: the SDK query cannot carry a response schema. The tolerant parser
// in parsing.ts stays as the safety net for those two routes.

const NARRATIVE_DESC = "The lane's prose narrative synthesising the findings. Required, non-empty. Use this exact field name.";
const SOURCES_DESC = "The retrieved sources. Each item MUST use the exact field names below.";
const SIGNIFICANCE_DESC = "Why this source matters to the topic. Use this exact field name (not core_relevance / why_it_matters / etc.).";

// The single lane-response schema, shared by every schema-capable route:
// OpenAI Responses `text.format` (strict), `codex exec --output-schema`, and
// the Claude strict tool below. Strict-mode constraints: every property in
// `required`, `additionalProperties: false`; genuinely-optional fields are
// expressed as nullable unions.
export const LANE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narrative", "model_context", "sources"],
  properties: {
    narrative: { type: "string", description: NARRATIVE_DESC },
    model_context: { type: ["string", "null"], description: "Structured background knowledge from the model, separate from retrieved sources. Null if none." },
    sources: {
      type: "array",
      description: SOURCES_DESC,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "significance", "url", "date", "outlet"],
        properties: {
          title: { type: "string", description: "Source title or headline." },
          significance: { type: "string", description: SIGNIFICANCE_DESC },
          url: { type: ["string", "null"], description: "Canonical https URL. Null if genuinely unavailable." },
          date: { type: ["string", "null"], description: "Publication date or year. Null if unknown." },
          outlet: { type: ["string", "null"], description: "Publication / outlet / venue. Null if unknown." },
        },
      },
    },
  },
} as const;

// Responses API structured-output wrapper.
export const OPENAI_LANE_TEXT_FORMAT = {
  format: { type: "json_schema" as const, name: "lane_response", strict: true, schema: LANE_RESPONSE_SCHEMA },
};

// OpenAI tools/tool_choice for a lane request. With search on, web_search is
// offered and forced, mirroring the Claude lane contract below — without
// forcing, the model may answer from parametric knowledge and skip searching.
// The strict text.format above still shapes the final message. With search
// off, no tools are attached. tool_choice `{ type: "web_search" }` is accepted
// by the API but missing from the SDK's ToolChoiceTypes union — call sites
// cast where the request object is SDK-typed.
export function openaiLaneToolConfig(noSearch: boolean): { tools?: unknown[]; tool_choice?: unknown } {
  if (noSearch) return {};
  return { tools: [{ type: "web_search" }], tool_choice: { type: "web_search" } };
}

export const CLAUDE_LANE_TOOL_NAME = "submit_lane_findings";

// Anthropic strict tool use (GA, no beta header): `strict: true` guarantees
// `tool_use.input` validates against the schema exactly, closing the last
// field-drift/invalid-JSON gap on the Claude api-key route. Same schema as
// the OpenAI routes.
export const CLAUDE_LANE_TOOL = {
  name: CLAUDE_LANE_TOOL_NAME,
  description: "Return the lane's researched findings. Call this exactly once, AFTER you have finished searching the web.",
  strict: true,
  input_schema: LANE_RESPONSE_SCHEMA,
} as const;

type ContentBlock = { type: string; name?: string; input?: unknown; text?: string; content?: unknown };

// Claude tool/tool_choice for a lane request. With search on, both web_search
// and the submit tool are offered and some tool use is forced; the prompt asks
// the model to search before submitting, but the API setting alone cannot
// guarantee web_search. With search off, the submit tool is forced directly.
export function claudeLaneToolConfig(noSearch: boolean): { tools: unknown[]; tool_choice: unknown } {
  if (noSearch) {
    return { tools: [CLAUDE_LANE_TOOL], tool_choice: { type: "tool", name: CLAUDE_LANE_TOOL_NAME } };
  }
  return {
    tools: [{ type: "web_search_20250305", name: "web_search" }, CLAUDE_LANE_TOOL],
    tool_choice: { type: "any" },
  };
}

// Prefer the structured submit_lane_findings tool input; fall back to the text
// blocks (and the tolerant parser) if the model emitted prose instead.
export function extractClaudeLaneRaw(content: ContentBlock[]): string {
  const submit = content.find((block) => block.type === "tool_use" && block.name === CLAUDE_LANE_TOOL_NAME);
  if (submit && submit.input !== undefined) return JSON.stringify(submit.input);
  return content.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}

// Count web searches, excluding the submit tool call so the stat stays honest.
export function countClaudeSearches(content: ContentBlock[]): number {
  return content.filter(
    (block) => (block.type === "server_tool_use" || block.type === "tool_use") && block.name !== CLAUDE_LANE_TOOL_NAME
  ).length;
}

type WebSearchResult = { type?: string; title?: string; url?: string; page_age?: string };

// Normalise a URL for dedup: lowercase host, drop fragment and trailing slash.
// Returns the original string on parse failure so odd URLs still dedup exactly.
export function normaliseUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

function outletFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// The forced submit_lane_findings tool makes the model re-enumerate its own
// search results into `sources`, which it does unreliably (often returning an
// empty array despite many searches). The web_search_tool_result blocks in the
// same response are ground truth: the pages the server actually retrieved.
// Harvest sources from those blocks so provenance never depends on the model
// transcribing them. Returned in retrieval order (roughly relevance order);
// downstream depth-capping keeps the leading N.
export function harvestClaudeSearchSources(content: ContentBlock[]): SourceItem[] {
  const seen = new Set<string>();
  const sources: SourceItem[] = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content as WebSearchResult[]) {
      if (result?.type !== "web_search_result" || !result.url) continue;
      const key = normaliseUrlKey(result.url);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        title: result.title || result.url,
        url: result.url,
        date: result.page_age || undefined,
        outlet: outletFromUrl(result.url),
        significance: "Retrieved by this lane's web search.",
      });
    }
  }
  return sources;
}

// Union model-provided sources (authoritative, they carry real significance)
// with harvested ones, deduped by normalised URL then title. Model entries lead
// so their annotations survive the depth cap; harvested entries fill the rest.
export function mergeLaneSources(modelSources: SourceItem[], harvested: SourceItem[]): SourceItem[] {
  const seen = new Set<string>();
  const keyOf = (s: SourceItem) => (s.url ? normaliseUrlKey(s.url) : `title:${(s.title || "").trim().toLowerCase()}`);
  const merged: SourceItem[] = [];
  for (const source of [...modelSources, ...harvested]) {
    const key = keyOf(source);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged;
}
