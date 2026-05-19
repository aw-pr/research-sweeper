import { Lane, LaneDefinition, LaneResult, SourceItem } from "./types";

export function extractText(blocks: Array<{ type?: string; text?: string }>): string {
  return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text || "").join("\n");
}

function coerceSourceItem(value: unknown): SourceItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.significance !== "string") return null;
  return {
    title: record.title,
    significance: record.significance,
    url: typeof record.url === "string" ? record.url : undefined,
    date: typeof record.date === "string" ? record.date : undefined,
    outlet: typeof record.outlet === "string" ? record.outlet : undefined,
  };
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
  return {
    sources: sourceValues.map(coerceSourceItem).filter((item): item is SourceItem => item !== null),
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
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
