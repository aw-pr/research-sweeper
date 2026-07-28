import { describe, expect, it } from "vitest";
import { capLaneSourcesByDepth } from "../cli/synthesis";
import type { LaneResult, SourceItem, SweepConfig } from "../types";

const config: SweepConfig = {
  provider: "openai",
  topic: "Source capping test",
  fromYear: 2025,
  toYear: 2026,
  lanes: ["financial", "frontier"],
  depth: "shallow",
  outputDir: "research/source-capping-test",
  test: false,
  overwrite: false,
};

function source(title: string, url?: string): SourceItem {
  return { title, url, significance: "Relevant source" };
}

function lane(laneId: LaneResult["lane"], sources: SourceItem[]): LaneResult {
  return {
    lane: laneId,
    label: laneId,
    sources,
    narrative: "Narrative",
    rawText: "",
    tokensIn: 0,
    tokensOut: 0,
    model: "test-model",
  };
}

describe("capLaneSourcesByDepth", () => {
  it("dedupes normalized URLs globally, retains URL-less sources, and fills later lanes to their cap", () => {
    const results = capLaneSourcesByDepth(config, [
      lane("financial", [source("First", "https://EXAMPLE.com/report/#section")]),
      lane("frontier", [
        source("Duplicate title is irrelevant", "https://example.com/report"),
        source("Same title but no URL"),
        source("Unique 1", "https://example.com/one"),
        source("Unique 2", "https://example.com/two/"),
        source("Unique 3", "https://example.com/three"),
        source("Unique 4", "https://example.com/four"),
        source("Unique 5", "https://example.com/five"),
      ]),
    ]);

    expect(results[0].sources.map((item) => item.title)).toEqual(["First"]);
    expect(results[1].sources.map((item) => item.title)).toEqual([
      "Same title but no URL",
      "Unique 1",
      "Unique 2",
      "Unique 3",
      "Unique 4",
    ]);
  });

  it("does not dedupe URL-less sources solely because their titles match", () => {
    const results = capLaneSourcesByDepth(config, [
      lane("financial", [source("Shared title"), source("Shared title")]),
    ]);

    expect(results[0].sources).toHaveLength(2);
  });
});
