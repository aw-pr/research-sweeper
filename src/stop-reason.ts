// Pure decision logic for provider stop/finish-reason handling. Extracted so
// it's unit-testable without a mocked SDK client, and so every call site
// classifies the same way: providers/claude.ts (Anthropic `stop_reason`),
// providers/openai.ts (Responses `status`/`incomplete_details`), and
// providers/gemini.ts (candidate `finishReason`) all route their native
// truncation signal through the shared markNarrativeTruncated /
// appendSynthesisTruncationWarning helpers so the marker is provider-agnostic.
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

// OpenAI Responses API truncation: the call returns status "incomplete" with
// incomplete_details.reason === "max_output_tokens" when it hit the output cap.
export function isOpenAIResponseTruncated(
  response: { status?: string | null; incomplete_details?: { reason?: string | null } | null } | null | undefined
): boolean {
  return !!response && response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens";
}

// Gemini truncation: the top candidate's finishReason is "MAX_TOKENS" when the
// model hit the output cap. (SAFETY/RECITATION stops are handled as benign
// empty-lane output elsewhere, not as truncation.)
export function isGeminiResponseTruncated(finishReason: string | null | undefined): boolean {
  return finishReason === "MAX_TOKENS";
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
