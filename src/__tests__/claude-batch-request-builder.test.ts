import { describe, expect, it } from "vitest";
import { buildLaneBatchRequests, determineFailedLanes } from "../providers/claude";
import type { Lane, SweepConfig } from "../types";

function makeConfig(lanes: Lane[]): SweepConfig {
  return {
    provider: "claude",
    topic: "Batch recovery test topic",
    fromYear: 2025,
    toYear: 2026,
    lanes,
    depth: "standard",
    outputDir: "/tmp/does-not-matter",
    test: false,
    overwrite: false,
  };
}

describe("buildLaneBatchRequests", () => {
  it("builds one request per lane with matching custom_id", () => {
    const config = makeConfig(["financial", "frontier", "academic"]);
    const requests = buildLaneBatchRequests(config, config.lanes);

    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.custom_id)).toEqual(["financial", "frontier", "academic"]);
    for (const request of requests) {
      expect(request.params.model).toBeTruthy();
      expect(request.params.max_tokens).toBeGreaterThan(0);
      expect(Array.isArray(request.params.messages)).toBe(true);
      expect(Array.isArray(request.params.system)).toBe(true);
    }
  });

  it("builds requests for only the requested subset, not the full config.lanes", () => {
    const config = makeConfig(["financial", "frontier", "academic", "vc", "blogs", "tech"]);
    const requests = buildLaneBatchRequests(config, ["vc", "tech"]);

    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.custom_id)).toEqual(["vc", "tech"]);
  });

  it("returns an empty array for an empty lane subset", () => {
    const config = makeConfig(["financial"]);
    expect(buildLaneBatchRequests(config, [])).toEqual([]);
  });

  it("forces tool use and leaves the prompt untouched on a model that accepts it", () => {
    const saved = process.env.LANE_MODEL_SONNET;
    process.env.LANE_MODEL_SONNET = "claude-sonnet-5";
    try {
      const config = { ...makeConfig(["financial"]), depth: "deep" as const };
      const [request] = buildLaneBatchRequests(config, config.lanes);
      expect(request.params.tool_choice).toEqual({ type: "any" });
      const content = (request.params.messages as Array<{ content: string }>)[0].content;
      expect(content).not.toContain("MUST call the submit_lane_findings");
    } finally {
      if (saved === undefined) delete process.env.LANE_MODEL_SONNET;
      else process.env.LANE_MODEL_SONNET = saved;
    }
  });

  it("does not force tool use on the default deep-lane model, claude-sonnet-5-5", () => {
    const config = { ...makeConfig(["financial"]), depth: "deep" as const };
    const [request] = buildLaneBatchRequests(config, config.lanes);
    expect(request.params.model).toBe("claude-sonnet-5-5");
    expect(request.params.tool_choice).toEqual({ type: "auto" });
    const content = (request.params.messages as Array<{ content: string }>)[0].content;
    expect(content).toContain("MUST call the submit_lane_findings");
  });

  it("switches to auto + an appended submit instruction when the lane model rejects forced tool_choice", () => {
    const saved = process.env.LANE_MODEL_SONNET;
    process.env.LANE_MODEL_SONNET = "claude-opus-5-5";
    try {
      const config = { ...makeConfig(["financial"]), depth: "deep" as const };
      const [request] = buildLaneBatchRequests(config, config.lanes);
      expect(request.params.model).toBe("claude-opus-5-5");
      expect(request.params.tool_choice).toEqual({ type: "auto" });
      const content = (request.params.messages as Array<{ content: string }>)[0].content;
      expect(content).toMatch(/MUST call the submit_lane_findings tool exactly once/);
    } finally {
      if (saved === undefined) delete process.env.LANE_MODEL_SONNET;
      else process.env.LANE_MODEL_SONNET = saved;
    }
  });

  it("uses the test-mode haiku model when config.test is set", () => {
    const config = { ...makeConfig(["financial"]), test: true };
    const requests = buildLaneBatchRequests(config, config.lanes);
    expect(requests[0].params.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("determineFailedLanes", () => {
  it("flags non-succeeded custom_ids with their result type", () => {
    const items = [
      { custom_id: "financial", resultType: "succeeded" },
      { custom_id: "frontier", resultType: "errored" },
      { custom_id: "academic", resultType: "expired" },
      { custom_id: "vc", resultType: "canceled" },
    ];
    const failures = determineFailedLanes(items, ["financial", "frontier", "academic", "vc"]);

    expect(failures).toEqual([
      { lane: "frontier", resultType: "errored" },
      { lane: "academic", resultType: "expired" },
      { lane: "vc", resultType: "canceled" },
    ]);
  });

  it("returns an empty array when every lane succeeded", () => {
    const items = [
      { custom_id: "financial", resultType: "succeeded" },
      { custom_id: "frontier", resultType: "succeeded" },
    ];
    expect(determineFailedLanes(items, ["financial", "frontier"])).toEqual([]);
  });

  it("ignores custom_ids outside the requested lane list", () => {
    const items = [
      { custom_id: "financial", resultType: "errored" },
      { custom_id: "stale-lane", resultType: "errored" },
    ];
    expect(determineFailedLanes(items, ["financial"])).toEqual([{ lane: "financial", resultType: "errored" }]);
  });

  it("does not flag a lane that has no result item at all", () => {
    const items = [{ custom_id: "financial", resultType: "succeeded" }];
    expect(determineFailedLanes(items, ["financial", "frontier"])).toEqual([]);
  });
});
