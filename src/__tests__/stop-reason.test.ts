import { describe, it, expect } from "vitest";
import {
  appendSynthesisTruncationWarning,
  classifyStopReason,
  isGeminiResponseTruncated,
  isOpenAIResponseTruncated,
  markNarrativeTruncated,
  REFUSAL_NARRATIVE,
  SYNTHESIS_TRUNCATION_WARNING,
  TRUNCATION_MARKER,
} from "../stop-reason";

describe("classifyStopReason", () => {
  it("classifies pause_turn, max_tokens, and refusal", () => {
    expect(classifyStopReason("pause_turn")).toBe("pause_turn");
    expect(classifyStopReason("max_tokens")).toBe("max_tokens");
    expect(classifyStopReason("refusal")).toBe("refusal");
  });

  it("classifies end_turn, tool_use, stop_sequence, null, and undefined as normal", () => {
    expect(classifyStopReason("end_turn")).toBe("normal");
    expect(classifyStopReason("tool_use")).toBe("normal");
    expect(classifyStopReason("stop_sequence")).toBe("normal");
    expect(classifyStopReason(null)).toBe("normal");
    expect(classifyStopReason(undefined)).toBe("normal");
  });
});

describe("markNarrativeTruncated", () => {
  it("prefixes the narrative with the truncation marker", () => {
    const result = markNarrativeTruncated("partial findings here");
    expect(result).toBe(`${TRUNCATION_MARKER} partial findings here`);
  });

  it("is idempotent — does not double-prefix an already-marked narrative", () => {
    const once = markNarrativeTruncated("partial findings");
    const twice = markNarrativeTruncated(once);
    expect(twice).toBe(once);
    expect(twice.match(new RegExp(TRUNCATION_MARKER.replace(/[[\]]/g, "\\$&"), "g"))).toHaveLength(1);
  });

  it("returns just the marker when the narrative is empty or whitespace", () => {
    expect(markNarrativeTruncated("")).toBe(TRUNCATION_MARKER);
    expect(markNarrativeTruncated("   ")).toBe(TRUNCATION_MARKER);
  });
});

describe("appendSynthesisTruncationWarning", () => {
  it("appends the warning callout to the markdown", () => {
    const result = appendSynthesisTruncationWarning("# Research Brief\n\nSome content.");
    expect(result).toBe(`# Research Brief\n\nSome content.${SYNTHESIS_TRUNCATION_WARNING}`);
  });

  it("is idempotent — does not double-append", () => {
    const once = appendSynthesisTruncationWarning("content");
    const twice = appendSynthesisTruncationWarning(once);
    expect(twice).toBe(once);
  });
});

describe("isOpenAIResponseTruncated", () => {
  it("is true only when status is incomplete and reason is max_output_tokens", () => {
    expect(isOpenAIResponseTruncated({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).toBe(true);
  });

  it("is false for a completed response", () => {
    expect(isOpenAIResponseTruncated({ status: "completed", incomplete_details: null })).toBe(false);
  });

  it("is false when incomplete for a different reason (e.g. content_filter)", () => {
    expect(isOpenAIResponseTruncated({ status: "incomplete", incomplete_details: { reason: "content_filter" } })).toBe(false);
  });

  it("is false for null/undefined or a response missing the fields", () => {
    expect(isOpenAIResponseTruncated(null)).toBe(false);
    expect(isOpenAIResponseTruncated(undefined)).toBe(false);
    expect(isOpenAIResponseTruncated({})).toBe(false);
  });
});

describe("isGeminiResponseTruncated", () => {
  it("is true only for a MAX_TOKENS finishReason", () => {
    expect(isGeminiResponseTruncated("MAX_TOKENS")).toBe(true);
  });

  it("is false for STOP, SAFETY, RECITATION, null, and undefined", () => {
    expect(isGeminiResponseTruncated("STOP")).toBe(false);
    expect(isGeminiResponseTruncated("SAFETY")).toBe(false);
    expect(isGeminiResponseTruncated("RECITATION")).toBe(false);
    expect(isGeminiResponseTruncated(null)).toBe(false);
    expect(isGeminiResponseTruncated(undefined)).toBe(false);
  });
});

describe("REFUSAL_NARRATIVE", () => {
  it("is the exact fallback narrative used on a refusal stop_reason", () => {
    expect(REFUSAL_NARRATIVE).toBe("Model refused this lane request");
  });
});
