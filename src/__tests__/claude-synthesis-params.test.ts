import { describe, expect, it } from "vitest";
import { supportsEffort } from "../claude-capabilities";
import { buildSynthesisRequestParams, SYNTHESIS_EFFORT } from "../providers/claude";
import type { SweepConfig } from "../types";

const config: SweepConfig = {
  provider: "claude",
  topic: "Synthesis params test",
  fromYear: 2025,
  toYear: 2026,
  lanes: ["financial"],
  depth: "deep",
  outputDir: "/tmp/does-not-matter",
  test: false,
  overwrite: false,
};

describe("buildSynthesisRequestParams", () => {
  it("pins effort high on Opus 5.5, whose default is medium", () => {
    const params = buildSynthesisRequestParams(config, [], "sources", "claude-opus-5-5");
    expect(SYNTHESIS_EFFORT).toBe("high");
    expect(params.output_config).toEqual({ effort: "high" });
  });

  it("never disables thinking or sends budget_tokens, which Opus 5.5 and Fable reject", () => {
    for (const model of ["claude-opus-5-5", "claude-fable-5-1", "claude-opus-5", "claude-haiku-4-5-20251001"]) {
      const params = buildSynthesisRequestParams(config, [], "sources", model);
      expect(params).not.toHaveProperty("thinking");
      expect(JSON.stringify(params)).not.toContain("budget_tokens");
    }
  });

  it("omits effort on models that 400 on it, including the test-mode Haiku", () => {
    const params = buildSynthesisRequestParams(config, [], "sources", "claude-haiku-4-5-20251001");
    expect(params).not.toHaveProperty("output_config");
  });
});

describe("supportsEffort", () => {
  it.each(["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-4-5", "claude-opus-4-1", "claude-3-7-sonnet-20250219"])(
    "is false for %s",
    (model) => expect(supportsEffort(model)).toBe(false)
  );

  it.each(["claude-opus-4-5", "claude-opus-4-8", "claude-sonnet-5", "claude-opus-5", "claude-opus-5-5", "claude-fable-5-1", "claude-opus-6"])(
    "is true for %s",
    (model) => expect(supportsEffort(model)).toBe(true)
  );
});
