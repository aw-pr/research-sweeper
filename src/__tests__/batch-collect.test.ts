import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assembleLaneResult, emptyLaneResult, finalizeLaneResults } from "../batch-collect";
import { TRUNCATION_MARKER } from "../stop-reason";
import type { Lane, LaneDefinition, LaneResult } from "../types";

const definition: LaneDefinition = {
  label: "Frontier",
  outlets: ["Example"],
  searchFocus: "test",
  systemPrompt: "test",
};

/** Valid lane JSON matching parseLaneResponse's expected shape. */
function laneJson(narrative = "narrative text", sources = 1): string {
  return JSON.stringify({
    lane: "frontier",
    label: "Frontier",
    sources: Array.from({ length: sources }, (_, idx) => ({
      title: `Source ${idx}`,
      url: `https://example.com/${idx}`,
      date: "2026",
      outlet: "Example",
      significance: "test",
    })),
    narrative,
    model_context: "background knowledge",
  });
}

// Silence the module's console.log/warn narration during assertions.
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("assembleLaneResult", () => {
  it("builds a full LaneResult from parseable JSON, carrying only the extras provided", () => {
    const result = assembleLaneResult("frontier", definition, {
      rawText: laneJson("clean narrative", 2),
      tokensIn: 100,
      tokensOut: 50,
      model: "gemini-2.5-flash-lite",
      searchesFired: 3,
    });
    expect(result.lane).toBe("frontier");
    expect(result.label).toBe("Frontier");
    expect(result.sources).toHaveLength(2);
    expect(result.narrative).toBe("clean narrative");
    expect(result.model_context).toBe("background knowledge");
    expect(result.model).toBe("gemini-2.5-flash-lite");
    expect(result.searchesFired).toBe(3);
    // Extras not supplied must be absent, not undefined-valued.
    expect("reasoningOut" in result).toBe(false);
    expect("cacheCreateIn" in result).toBe(false);
    expect(result.truncated).toBeUndefined();
  });

  it("prefixes the narrative and sets truncated when the provider flagged truncation", () => {
    const result = assembleLaneResult("frontier", definition, {
      rawText: laneJson("partial findings"),
      tokensIn: 10,
      tokensOut: 5,
      model: "claude-haiku-4-5-20251001",
      truncated: true,
    });
    expect(result.truncated).toBe(true);
    expect(result.narrative.startsWith(TRUNCATION_MARKER)).toBe(true);
    expect(result.narrative).toContain("partial findings");
  });

  it("carries reasoning and cache extras through to the result", () => {
    const result = assembleLaneResult("frontier", definition, {
      rawText: laneJson(),
      tokensIn: 10,
      tokensOut: 5,
      model: "gpt-5.6-terra",
      reasoningOut: 42,
      cacheCreateIn: 7,
      cacheReadIn: 3,
    });
    expect(result.reasoningOut).toBe(42);
    expect(result.cacheCreateIn).toBe(7);
    expect(result.cacheReadIn).toBe(3);
  });

  it("falls back when the raw text is not parseable, still applying truncation and extras", () => {
    const result = assembleLaneResult("frontier", definition, {
      rawText: "this is not json",
      tokensIn: 10,
      tokensOut: 5,
      model: "gpt-5.6-terra",
      reasoningOut: 9,
      truncated: true,
    });
    expect(result.sources).toHaveLength(0);
    expect(result.narrative.startsWith(TRUNCATION_MARKER)).toBe(true);
    expect(result.reasoningOut).toBe(9);
    expect(result.truncated).toBe(true);
  });
});

describe("emptyLaneResult", () => {
  it("produces a zero-token placeholder with the given narrative", () => {
    const result = emptyLaneResult("vc", "Venture Capital", "Batch result: errored", "model-x");
    expect(result).toEqual({
      lane: "vc",
      label: "Venture Capital",
      sources: [],
      narrative: "Batch result: errored",
      rawText: "",
      tokensIn: 0,
      tokensOut: 0,
      model: "model-x",
    });
  });
});

describe("finalizeLaneResults", () => {
  it("returns lanes in request order and fills missing lanes with a placeholder", () => {
    const present: LaneResult = emptyLaneResult("frontier", "Frontier", "ok", "m");
    const map = new Map<Lane, LaneResult>([["frontier", present]]);
    const lanes: Lane[] = ["frontier", "academic"];

    const results = finalizeLaneResults(lanes, map, "fallback-model", (l) => (l === "academic" ? "Academic" : l));

    expect(results).toHaveLength(2);
    expect(results[0]).toBe(present);
    expect(results[1].lane).toBe("academic");
    expect(results[1].label).toBe("Academic");
    expect(results[1].sources).toHaveLength(0);
    expect(results[1].model).toBe("fallback-model");
    expect(results[1].narrative).toContain("no collectable response");
  });
});
