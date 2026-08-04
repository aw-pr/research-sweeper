import { describe, expect, it } from "vitest";
import { buildLanePrompt, buildLaneSystemPrefix, buildSynthesisPrompt, SHARED_LANE_SCAFFOLDING } from "../prompts";
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

describe("brief directive placement", () => {
  const withDirectives = (): SweepConfig => ({
    ...config("deep"),
    laneDirective: "Act as an infrastructure architect. Retrieve numbers, not adjectives.",
    synthesisDirective: "Write as a technology strategist for senior decision-makers.",
  });

  it("carries the lane directive in the cached system prefix, not the per-lane message", () => {
    const cfg = withDirectives();
    expect(buildLaneSystemPrefix(cfg)).toContain("infrastructure architect");
    expect(buildLanePrompt("academic", cfg)).not.toContain("infrastructure architect");
  });

  it("keeps the lane directive out of the synthesis prompt and vice versa", () => {
    const cfg = withDirectives();
    const synthesis = buildSynthesisPrompt(cfg, [], "sources-test");
    expect(synthesis).toContain("technology strategist");
    expect(synthesis).not.toContain("infrastructure architect");
    expect(buildLaneSystemPrefix(cfg)).not.toContain("technology strategist");
  });

  it("keeps the output schema rules after the directive so they cannot be displaced", () => {
    const prefix = buildLaneSystemPrefix(withDirectives());
    expect(prefix.indexOf("## Output schema")).toBeLessThan(prefix.indexOf("infrastructure architect"));
    expect(prefix).toContain("keep the schema");
  });

  it("falls back to the default analyst persona with no directive", () => {
    expect(buildSynthesisPrompt(config("deep"), [], "sources-test")).toContain("senior technology research analyst");
    expect(buildLaneSystemPrefix(config("deep"))).toBe(SHARED_LANE_SCAFFOLDING);
  });
});
