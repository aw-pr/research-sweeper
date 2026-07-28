import { describe, expect, it } from "vitest";
import { buildSynthesisBatchRequest } from "../providers/openai";
import { DEPTH_CONFIG } from "../config";
import type { Depth, LaneResult, SweepConfig } from "../types";

function makeConfig(depth: Depth = "deep"): SweepConfig {
  return {
    provider: "openai",
    topic: "Batch synthesis test topic",
    fromYear: 2026,
    toYear: 2026,
    lanes: ["financial", "frontier"],
    depth,
    outputDir: "/tmp/does-not-matter",
    test: false,
    overwrite: false,
  };
}

const laneResults: LaneResult[] = [
  {
    lane: "financial",
    label: "Financial",
    sources: [{ title: "A source", url: "https://example.com/a", outlet: "Example", date: "2026-07", significance: "Baseline datapoint." }],
    narrative: "Some findings.",
    rawText: "{}",
    tokensIn: 10,
    tokensOut: 20,
    model: "gpt-5.6-terra",
  },
];

describe("buildSynthesisBatchRequest", () => {
  it("builds a single /v1/responses request with the synthesis custom_id", () => {
    const request = buildSynthesisBatchRequest(makeConfig(), "gpt-5.6-sol", laneResults, "sources-test");

    expect(request.custom_id).toBe("synthesis");
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/v1/responses");
    expect(request.body.model).toBe("gpt-5.6-sol");
  });

  it("uses high reasoning effort and the depth's synthesis token cap", () => {
    const request = buildSynthesisBatchRequest(makeConfig("deep"), "gpt-5.6-sol", laneResults, "sources-test");

    expect(request.body.reasoning).toEqual({ effort: "high" });
    expect(request.body.max_output_tokens).toBe(DEPTH_CONFIG.deep.synthesisMaxTokens);
  });

  it("omits the lane tool config and json_schema format so synthesis stays free markdown", () => {
    const request = buildSynthesisBatchRequest(makeConfig(), "gpt-5.6-sol", laneResults, "sources-test");
    const body = request.body as Record<string, unknown>;

    expect(body.text).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("carries the lane findings through into the prompt input", () => {
    const request = buildSynthesisBatchRequest(makeConfig(), "gpt-5.6-sol", laneResults, "sources-test");
    const prompt = request.body.input[0].content[0].text;

    expect(prompt).toContain("Some findings.");
    expect(prompt).toContain("Batch synthesis test topic");
  });
});
