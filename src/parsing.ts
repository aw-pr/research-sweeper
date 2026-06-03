import { Lane, LaneDefinition, LaneResult, SourceItem } from "./types";

export function extractText(blocks: Array<{ type?: string; text?: string }>): string {
  return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text || "").join("\n");
}

function coerceSourceItem(value: unknown): SourceItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const firstString = (...values: unknown[]): string | undefined => values.find((item): item is string => typeof item === "string" && item.length > 0);
  const title = firstString(
    record.title,
    record.headline,
    record.headline_claim,
    record.model_or_paper,
    record.practice_or_pattern,
    record.paper,
    record.claim
  );
  const significance = firstString(
    record.significance,
    record.why_it_matters,
    record.evidence_value,
    record.core_contribution,
    record.evidence_role,
    record.why_relevant,
    record.relevance,
    record.core_claim,
    record.claim,
    record.practice,
    record.practice_or_pattern,
    record.empirical_grounding,
    record.headline_claim
  );
  const citation = firstString(record.url, record.source, record.source_citation, record.citation, record.evidence_role);
  const url = citation?.match(/https?:\/\/[^)\s]+/)?.[0];
  if (!title || !significance) return null;
  return {
    title,
    significance,
    url,
    date: typeof record.date === "string" || typeof record.date === "number" ? String(record.date) : typeof record.year === "number" ? String(record.year) : undefined,
    outlet: firstString(record.outlet, record.publication, record.lab_or_evaluator, record.venue, record.firm),
  };
}

function stringifyNarrative(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return undefined;
}

// Pull the first balanced { ... } object out of a string by brace-depth
// scanning (string/escape aware). Handles trailing prose after the JSON and
// avoids the greedy regex over-capturing into a later stray brace — common
// with chattier models like gemini-2.5-flash-lite.
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function parseLaneResponse(rawText: string): { sources: SourceItem[]; narrative: string; model_context?: string } | null {
  // Strip ```json / ``` fences some models wrap the object in.
  const unfenced = rawText.replace(/```(?:json)?/gi, "");
  let parsed: Record<string, unknown> | null = null;
  // 1) greedy outer-brace match (fast path, unchanged behaviour)
  // 2) balanced-brace fallback for prose-wrapped / multi-block replies
  for (const candidate of [unfenced.match(/\{[\s\S]*\}/)?.[0], extractBalancedObject(unfenced)]) {
    if (!candidate) continue;
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
      break;
    } catch {
      /* try next strategy */
    }
  }
  if (!parsed) return null;
  const sourceValues = Array.isArray(parsed.sources) ? parsed.sources : [];
  const narrative = stringifyNarrative(parsed.narrative) ?? stringifyNarrative(parsed.synthesis) ?? stringifyNarrative(parsed.summary) ?? stringifyNarrative(parsed.findings) ?? stringifyNarrative(parsed.recommended_narrative_themes) ?? "";
  return {
    sources: sourceValues.map(coerceSourceItem).filter((item): item is SourceItem => item !== null),
    narrative,
    model_context: typeof parsed.model_context === "string" ? parsed.model_context : undefined,
  };
}

export function fallbackLaneResult(
  lane: Lane,
  definition: LaneDefinition,
  rawText: string,
  tokensIn: number,
  tokensOut: number,
  model: string = ""
): LaneResult {
  return {
    lane,
    label: definition.label,
    sources: [],
    narrative: rawText,
    rawText,
    tokensIn,
    tokensOut,
    model,
  };
}
