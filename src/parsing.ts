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

export function parseLaneResponse(rawText: string): { sources: SourceItem[]; narrative: string; model_context?: string } | null {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
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
