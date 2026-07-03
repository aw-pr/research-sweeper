// Pure decision logic for Anthropic Messages API `stop_reason` handling.
// Extracted so it's unit-testable without a mocked SDK client, and so every
// call site in providers/claude.ts (sync lane, sync synthesis, batch lanes,
// batch synthesis) classifies stop_reason the same way.
//
// Note: the installed @anthropic-ai/sdk version types `stop_reason` as only
// 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null — it
// predates `pause_turn` and `refusal`. Both are real values the API can send
// at runtime; routing every comparison through classifyStopReason (which
// takes a plain `string | null | undefined`) avoids a TS2367 "no overlap"
// error at the call site instead of casting away type safety there.

export type StopReasonClass = "pause_turn" | "max_tokens" | "refusal" | "normal";

export function classifyStopReason(stopReason: string | null | undefined): StopReasonClass {
  if (stopReason === "pause_turn") return "pause_turn";
  if (stopReason === "max_tokens") return "max_tokens";
  if (stopReason === "refusal") return "refusal";
  return "normal";
}

export const TRUNCATION_MARKER = "[TRUNCATED at max_tokens — findings incomplete]";

/** Prefixes a lane narrative with the truncation marker, idempotently. */
export function markNarrativeTruncated(narrative: string): string {
  if (narrative.startsWith(TRUNCATION_MARKER)) return narrative;
  const trimmed = narrative.trim();
  return trimmed.length > 0 ? `${TRUNCATION_MARKER} ${trimmed}` : TRUNCATION_MARKER;
}

export const REFUSAL_NARRATIVE = "Model refused this lane request";

export const SYNTHESIS_TRUNCATION_WARNING =
  "\n\n> [!warning] Synthesis truncated at max_tokens — increase depth tier or reduce lane volume.";

/** Appends the synthesis truncation callout to the markdown, idempotently. */
export function appendSynthesisTruncationWarning(markdown: string): string {
  if (markdown.includes(SYNTHESIS_TRUNCATION_WARNING)) return markdown;
  return `${markdown}${SYNTHESIS_TRUNCATION_WARNING}`;
}
