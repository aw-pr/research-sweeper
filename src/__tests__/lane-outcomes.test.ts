import { describe, it, expect } from "vitest";
import { classifyLaneOutcomes, defaultMinLanes } from "../lane-outcomes";
import type { LaneResult } from "../types";

function makeLaneResult(overrides: Partial<LaneResult> = {}): LaneResult {
  return {
    lane: "frontier",
    label: "Frontier",
    sources: [
      { title: "A", url: "https://a.example", date: "2025", outlet: "x", significance: "y" },
    ],
    narrative: "ok",
    rawText: "",
    tokensIn: 100,
    tokensOut: 50,
    model: "claude-haiku-4-5-20251001",
    ...overrides,
  };
}

describe("classifyLaneOutcomes", () => {
  it("marks fulfilled results with sources as success", () => {
    const settled: PromiseSettledResult<LaneResult>[] = [
      { status: "fulfilled", value: makeLaneResult({ lane: "frontier" }) },
    ];
    const outcomes = classifyLaneOutcomes(["frontier"], settled);
    expect(outcomes[0].kind).toBe("success");
  });

  it("marks fulfilled results with empty sources as degraded", () => {
    const settled: PromiseSettledResult<LaneResult>[] = [
      { status: "fulfilled", value: makeLaneResult({ lane: "academic", sources: [] }) },
    ];
    const outcomes = classifyLaneOutcomes(["academic"], settled);
    expect(outcomes[0].kind).toBe("degraded");
  });

  it("marks rejected promises as rejected", () => {
    const settled: PromiseSettledResult<LaneResult>[] = [
      { status: "rejected", reason: new Error("boom") },
    ];
    const outcomes = classifyLaneOutcomes(["vc"], settled);
    expect(outcomes[0].kind).toBe("rejected");
    expect(outcomes[0].reason).toContain("boom");
  });
});

describe("defaultMinLanes", () => {
  it("requires >50% of lanes to succeed", () => {
    expect(defaultMinLanes(6)).toBe(3);
    expect(defaultMinLanes(5)).toBe(3);
    expect(defaultMinLanes(1)).toBe(1);
    expect(defaultMinLanes(2)).toBe(1);
  });
});
