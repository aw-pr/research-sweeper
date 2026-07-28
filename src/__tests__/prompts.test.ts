import { describe, expect, it } from "vitest";
import { buildLanePrompt, SHARED_LANE_SCAFFOLDING } from "../prompts";
import type { Depth, SweepConfig } from "../types";

function config(depth: Depth): SweepConfig {
  return {
    provider: "openai",
    topic: "Prompt budget test",
    fromYear: 2025,
    toYear: 2026,
    lanes: ["academic"],
    depth,
    outputDir: "research/prompt-budget-test",
    test: false,
    overwrite: false,
  };
}

describe("model_context prompt budget", () => {
  it("uses an empty model_context at shallow depth", () => {
    expect(buildLanePrompt("academic", config("shallow"))).toContain('Return an empty string ("") for "model_context".');
  });

  it("allows a single bounded paragraph at standard depth", () => {
    expect(buildLanePrompt("academic", config("standard"))).toContain("At most one short paragraph (about 80 words)");
  });

  it("allows a larger but bounded paragraph at deep depth", () => {
    expect(buildLanePrompt("academic", config("deep"))).toContain("At most one short paragraph (about 120 words)");
  });

  it("has no contradictory multi-paragraph model_context instruction", () => {
    expect(SHARED_LANE_SCAFFOLDING).not.toMatch(/3\s*[–-]\s*5 short paragraphs/);
    expect(SHARED_LANE_SCAFFOLDING).toContain("Follow the depth-specific budget");
  });
});
