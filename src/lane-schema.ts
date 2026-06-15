// Strict response-schema enforcement for lane output.
//
// Field-name drift (the model renaming `narrative` -> `research_summary`, or a
// source's `significance` -> `core_relevance`) caused two silent-failure bugs.
// Enforcing a schema at the model layer fixes the contract so the parser stops
// guessing. This is wired into the API-key paths of OpenAI and Claude only:
//
//   - OpenAI: Responses API `text.format` json_schema (strict).
//   - Claude: a forced `submit_lane_findings` tool whose input_schema is the
//     contract (web_search runs first, then the model returns via the tool).
//
// Gemini is excluded: Google Search grounding and JSON structured output are
// mutually exclusive in the Gemini API. The tolerant parser in parsing.ts
// stays as the cross-provider safety net (and covers the codex-cli / Agent SDK
// subscription routes, which cannot carry a schema).

const NARRATIVE_DESC = "The lane's prose narrative synthesising the findings. Required, non-empty. Use this exact field name.";
const SOURCES_DESC = "The retrieved sources. Each item MUST use the exact field names below.";
const SIGNIFICANCE_DESC = "Why this source matters to the topic. Use this exact field name (not core_relevance / why_it_matters / etc.).";

// OpenAI Responses API strict json_schema: every property must appear in
// `required` and `additionalProperties` must be false; genuinely-optional
// fields are expressed as nullable unions.
export const OPENAI_LANE_SCHEMA = {
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
  format: { type: "json_schema" as const, name: "lane_response", strict: true, schema: OPENAI_LANE_SCHEMA },
};

export const CLAUDE_LANE_TOOL_NAME = "submit_lane_findings";

// Anthropic tool input_schema: standard JSON Schema (not strict-mode
// constrained), so genuinely-optional fields are simply omitted from
// `required` rather than made nullable.
export const CLAUDE_LANE_TOOL = {
  name: CLAUDE_LANE_TOOL_NAME,
  description: "Return the lane's researched findings. Call this exactly once, AFTER you have finished searching the web.",
  input_schema: {
    type: "object",
    required: ["narrative", "sources"],
    properties: {
      narrative: { type: "string", description: NARRATIVE_DESC },
      model_context: { type: "string", description: "Structured background knowledge from the model, separate from retrieved sources." },
      sources: {
        type: "array",
        description: SOURCES_DESC,
        items: {
          type: "object",
          required: ["title", "significance"],
          properties: {
            title: { type: "string", description: "Source title or headline." },
            significance: { type: "string", description: SIGNIFICANCE_DESC },
            url: { type: "string", description: "Canonical https URL." },
            date: { type: "string", description: "Publication date or year." },
            outlet: { type: "string", description: "Publication / outlet / venue." },
          },
        },
      },
    },
  },
} as const;

type ContentBlock = { type: string; name?: string; input?: unknown; text?: string };

// Claude tool/tool_choice for a lane request. With search on, both web_search
// and the submit tool are offered and tool use is forced; the model searches
// then submits. With search off, the submit tool is forced directly.
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
