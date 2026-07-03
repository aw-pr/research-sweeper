import { describe, it, expect } from "vitest";
import {
  appendSynthesisTruncationWarning,
  classifyStopReason,
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

describe("REFUSAL_NARRATIVE", () => {
  it("is the exact fallback narrative used on a refusal stop_reason", () => {
    expect(REFUSAL_NARRATIVE).toBe("Model refused this lane request");
  });
});
