// Shared batch-result assembly for all three providers' collectBatchResults.
// Each provider fetches and iterates its own batch payload, extracts the
// normalized fields below from one succeeded item, and calls assembleLaneResult
// — so parse, truncation marking, the "Collected" log line, and the JSON
// fallback stay identical across claude/openai/gemini. Non-succeeded, errored,
// and missing lanes become explicit placeholders (emptyLaneResult /
// finalizeLaneResults) so synthesis always sees a stable lane count.

import { mergeLaneSources } from "./lane-schema";
import { fallbackLaneResult, parseLaneResponse } from "./parsing";
import { markNarrativeTruncated } from "./stop-reason";
import { Lane, LaneDefinition, LaneResult, SourceItem } from "./types";

// Normalized fields extracted from one succeeded batch item. Provider-specific
// extras (searches, reasoning, cache) are optional and only set by the
// providers that produce them.
export interface ExtractedBatchLane {
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  searchesFired?: number;
  reasoningOut?: number;
  openaiCachedIn?: number;
  openaiCacheWriteIn?: number;
  cacheCreateIn?: number;
  cacheReadIn?: number;
  truncated?: boolean;
  // Sources harvested from the response's search-result blocks (Claude route
  // only). Merged with the model-reported sources so provenance never depends
  // on the model re-transcribing its own search results.
  harvestedSources?: SourceItem[];
}

// Zero-token placeholder for a lane with no readable output (item errored, was
// non-succeeded, or is missing from the results). Keeps the lane visible to
// synthesis instead of dropping it.
export function emptyLaneResult(lane: Lane, label: string, narrative: string, model: string): LaneResult {
  return { lane, label, sources: [], narrative, rawText: "", tokensIn: 0, tokensOut: 0, model };
}

function logCollected(label: string, sourceCount: number, x: ExtractedBatchLane): void {
  const searchLabel = x.searchesFired === undefined ? "" : `, ${x.searchesFired} search${x.searchesFired !== 1 ? "es" : ""}`;
  const cacheLabel =
    x.cacheCreateIn || x.cacheReadIn ? `, cache ${(x.cacheCreateIn ?? 0).toLocaleString()} w / ${(x.cacheReadIn ?? 0).toLocaleString()} r` : "";
  const reasoningLabel = x.reasoningOut ? `, ${x.reasoningOut.toLocaleString()} reasoning` : "";
  console.log(
    `  [${label}] Collected — ${sourceCount} sources${searchLabel} (${x.tokensIn.toLocaleString()} in / ${x.tokensOut.toLocaleString()} out${cacheLabel}${reasoningLabel})`
  );
}

// Only spread the extras a provider actually produced, so a Gemini result never
// carries a stray reasoningOut: undefined etc.
function optionalExtras(x: ExtractedBatchLane): Partial<LaneResult> {
  return {
    ...(x.searchesFired !== undefined ? { searchesFired: x.searchesFired } : {}),
    ...(x.reasoningOut !== undefined ? { reasoningOut: x.reasoningOut } : {}),
    ...(x.openaiCachedIn !== undefined ? { openaiCachedIn: x.openaiCachedIn } : {}),
    ...(x.openaiCacheWriteIn !== undefined ? { openaiCacheWriteIn: x.openaiCacheWriteIn } : {}),
    ...(x.cacheCreateIn !== undefined ? { cacheCreateIn: x.cacheCreateIn } : {}),
    ...(x.cacheReadIn !== undefined ? { cacheReadIn: x.cacheReadIn } : {}),
    ...(x.truncated ? { truncated: true } : {}),
  };
}

// Parse one succeeded batch item into a LaneResult: applies the truncation
// marker when the provider flagged max-tokens truncation, logs the collected
// line, and falls back to fallbackLaneResult when the JSON can't be parsed.
export function assembleLaneResult(lane: Lane, definition: LaneDefinition, x: ExtractedBatchLane): LaneResult {
  const parsed = parseLaneResponse(x.rawText);
  const extras = optionalExtras(x);

  if (parsed) {
    const sources = mergeLaneSources(parsed.sources, x.harvestedSources ?? []);
    logCollected(definition.label, sources.length, x);
    return {
      lane,
      label: definition.label,
      sources,
      narrative: x.truncated ? markNarrativeTruncated(parsed.narrative) : parsed.narrative,
      model_context: parsed.model_context,
      parseMode: parsed.parseMode,
      rawText: x.rawText,
      tokensIn: x.tokensIn,
      tokensOut: x.tokensOut,
      model: x.model,
      ...extras,
    };
  }

  const fallback = fallbackLaneResult(lane, definition, x.rawText, x.tokensIn, x.tokensOut, x.model);
  fallback.sources = mergeLaneSources(fallback.sources, x.harvestedSources ?? []);
  logCollected(definition.label, fallback.sources.length, x);
  if (x.truncated) fallback.narrative = markNarrativeTruncated(fallback.narrative);
  return { ...fallback, ...extras };
}

// Assemble the final ordered lane list. Any requested lane still missing from
// the map gets an explicit empty placeholder + warning so synthesis sees a
// stable lane count and the drop is visible rather than swallowed by a filter.
export function finalizeLaneResults(
  lanes: Lane[],
  laneResultMap: Map<Lane, LaneResult>,
  fallbackModel: string,
  laneLabel: (lane: Lane) => string
): LaneResult[] {
  return lanes.map((lane) => {
    const result = laneResultMap.get(lane);
    if (result) return result;
    const label = laneLabel(lane);
    console.warn(`  [${label}] Warning: no batch result for this lane — emitting empty placeholder so synthesis sees the gap.`);
    return emptyLaneResult(lane, label, "Batch result: lane produced no collectable response.", fallbackModel);
  });
}
