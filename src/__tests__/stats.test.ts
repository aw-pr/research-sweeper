import { describe, it, expect } from "vitest";
import { computeRunCost, generateRunId } from "../stats";
import type { SweepConfig, TokenBreakdown, ProviderModels } from "../types";

const baseTokens: TokenBreakdown = {
  lanesIn: 1_000_000,
  lanesOut: 500_000,
  synthesisIn: 200_000,
  synthesisOut: 100_000,
  totalIn: 1_200_000,
  totalOut: 600_000,
};

const haikuModels: ProviderModels = {
  lane: "claude-haiku-4-5-20251001",
  synthesis: "claude-opus-4-7",
};

describe("computeRunCost", () => {
  it("computes sync cost from known haiku + opus pricing", () => {
    // lane: 1M in * 0.8 + 0.5M out * 4.0 = 0.8 + 2.0 = 2.8
    // synth: 0.2M in * 5.0 + 0.1M out * 25.0 = 1.0 + 2.5 = 3.5
    // total = 6.3
    const cost = computeRunCost("claude", baseTokens, haikuModels, false);
    expect(cost).toBeCloseTo(6.3, 6);
  });

  it("applies 50% batch discount to lane portion only", () => {
    const sync = computeRunCost("claude", baseTokens, haikuModels, false);
    const batch = computeRunCost("claude", baseTokens, haikuModels, true);
    // lane was 2.8 sync -> 1.4 batch; synth unchanged at 3.5
    expect(batch).toBeCloseTo(1.4 + 3.5, 6);
    expect(batch).toBeLessThan(sync);
  });

  it("returns 0 for unknown model without throwing", () => {
    const cost = computeRunCost(
      "claude",
      baseTokens,
      { lane: "claude-bogus-9000", synthesis: "claude-opus-4-7" },
      false
    );
    expect(cost).toBe(0);
  });

  it("returns 0 for zero tokens", () => {
    const zero: TokenBreakdown = { lanesIn: 0, lanesOut: 0, synthesisIn: 0, synthesisOut: 0, totalIn: 0, totalOut: 0 };
    expect(computeRunCost("claude", zero, haikuModels, false)).toBe(0);
    expect(computeRunCost("openai", zero, { lane: "gpt-5.4-mini", synthesis: "gpt-5.5" }, true)).toBe(0);
  });

  it("prices Anthropic cache writes at 1.25x and cache reads at 0.10x lane input rate", () => {
    // base haiku/opus: 6.3 (sync). lane input rate = 0.8.
    // cacheCreateIn = 1M -> 1M/1e6 * 0.8 * 1.25 = 1.0
    // cacheReadIn   = 1M -> 1M/1e6 * 0.8 * 0.10 = 0.08
    // total expected = 6.3 + 1.0 + 0.08 = 7.38
    const tokens: TokenBreakdown = {
      ...baseTokens,
      cacheCreateIn: 1_000_000,
      cacheReadIn: 1_000_000,
    };
    const cost = computeRunCost("claude", tokens, haikuModels, false);
    expect(cost).toBeCloseTo(7.38, 6);
  });

  it("prices OpenAI reasoning tokens at synthesis output rate", () => {
    // gpt-5.4-mini lane (irrelevant here), gpt-5.5 synth out = 30/MTok.
    // reasoningOut = 100k -> 100k/1e6 * 30 = 3.0
    const tokens: TokenBreakdown = {
      lanesIn: 0,
      lanesOut: 0,
      synthesisIn: 0,
      synthesisOut: 0,
      totalIn: 0,
      totalOut: 0,
      reasoningOut: 100_000,
    };
    const cost = computeRunCost("openai", tokens, { lane: "gpt-5.4-mini", synthesis: "gpt-5.5" }, false);
    expect(cost).toBeCloseTo(3.0, 6);
  });

  it("applies batch discount to cache create/read pricing", () => {
    const tokens: TokenBreakdown = {
      lanesIn: 0,
      lanesOut: 0,
      synthesisIn: 0,
      synthesisOut: 0,
      totalIn: 0,
      totalOut: 0,
      cacheCreateIn: 1_000_000,
      cacheReadIn: 0,
    };
    // sync: 1.0
    const sync = computeRunCost("claude", tokens, haikuModels, false);
    // batch: 0.5
    const batch = computeRunCost("claude", tokens, haikuModels, true);
    expect(sync).toBeCloseTo(1.0, 6);
    expect(batch).toBeCloseTo(0.5, 6);
  });

});

describe("generateRunId", () => {
  const baseConfig: SweepConfig = {
    provider: "claude",
    topic: "Agent Orchestration Patterns",
    fromYear: 2022,
    toYear: null,
    lanes: ["frontier"],
    depth: "standard",
    outputDir: "/tmp",
    test: false,
    overwrite: false,
  };

  it("matches YYYY-MM-DDTHH-MM-SS-{provider}-{mode}-{slug} pattern", () => {
    const id = generateRunId(baseConfig, "sync");
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-claude-sync-[a-z0-9-]+$/);
  });

  it("slugifies topic to lowercase hyphenated form", () => {
    const id = generateRunId(baseConfig, "batch");
    expect(id.endsWith("-agent-orchestration-patterns")).toBe(true);
    expect(id).toContain("-batch-");
  });

  it("truncates slug to max 30 chars", () => {
    const longTopic = { ...baseConfig, topic: "This is a Very Long Research Topic That Should Be Truncated Eventually" };
    const id = generateRunId(longTopic, "sync");
    const slug = id.split("-sync-")[1];
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it("strips special characters from slug", () => {
    const odd = { ...baseConfig, topic: "AI/ML & RAG: 2024 !!!" };
    const id = generateRunId(odd, "sync");
    const slug = id.split("-sync-")[1];
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
  });
});
