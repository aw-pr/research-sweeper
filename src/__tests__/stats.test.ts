import { describe, it, expect } from "vitest";
import * as os from "os";
import * as path from "path";
import { buildRunStats, computeRunCost, generateRunId, toHomeRelative } from "../stats";
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
    // lane: 1M in * 1.0 + 0.5M out * 5.0 = 1.0 + 2.5 = 3.5
    // synth: 0.2M in * 5.0 + 0.1M out * 25.0 = 1.0 + 2.5 = 3.5
    // total = 7.0
    const cost = computeRunCost("claude", baseTokens, haikuModels, false);
    expect(cost).toBeCloseTo(7.0, 6);
  });

  it("applies the 50% batch discount to lanes and to batched synthesis", () => {
    const sync = computeRunCost("claude", baseTokens, haikuModels, false);
    const batch = computeRunCost("claude", baseTokens, haikuModels, true);
    // lane 3.5 -> 1.75, synth 3.5 -> 1.75; claude batches both halves
    expect(batch).toBeCloseTo(1.75 + 1.75, 6);
    expect(batch).toBeLessThan(sync);
  });

  it("keeps synthesis at full price on a batch run that synthesised synchronously", () => {
    // openai batches lanes but has no batch-synthesis endpoint, so the
    // synthesis half bills at full rate even though mode is "batch".
    const cost = computeRunCost("claude", baseTokens, haikuModels, true, false);
    expect(cost).toBeCloseTo(1.75 + 3.5, 6);
  });

  it("defaults synthesisBatched to the run mode when the caller omits it", () => {
    expect(computeRunCost("claude", baseTokens, haikuModels, true)).toBe(
      computeRunCost("claude", baseTokens, haikuModels, true, true)
    );
    expect(computeRunCost("claude", baseTokens, haikuModels, false)).toBe(
      computeRunCost("claude", baseTokens, haikuModels, false, false)
    );
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
    expect(computeRunCost("openai", zero, { lane: "gpt-5.6-luna", synthesis: "gpt-5.6-sol" }, true)).toBe(0);
  });

  it("prices Anthropic cache writes at 1.25x and cache reads at 0.10x lane input rate", () => {
    // base haiku/opus: 7.0 (sync). lane input rate = 1.0.
    // cacheCreateIn = 1M -> 1M/1e6 * 1.0 * 1.25 = 1.25
    // cacheReadIn   = 1M -> 1M/1e6 * 1.0 * 0.10 = 0.10
    // total expected = 7.0 + 1.25 + 0.10 = 8.35
    const tokens: TokenBreakdown = {
      ...baseTokens,
      cacheCreateIn: 1_000_000,
      cacheReadIn: 1_000_000,
    };
    const cost = computeRunCost("claude", tokens, haikuModels, false);
    expect(cost).toBeCloseTo(8.35, 6);
  });

  it("does not charge OpenAI reasoning tokens twice", () => {
    // Responses usage.output_tokens already includes reasoning tokens.
    const tokens: TokenBreakdown = {
      lanesIn: 0,
      lanesOut: 0,
      synthesisIn: 0,
      synthesisOut: 0,
      totalIn: 0,
      totalOut: 0,
      reasoningOut: 100_000,
    };
    const cost = computeRunCost("openai", tokens, { lane: "gpt-5.6-luna", synthesis: "gpt-5.6-sol" }, false);
    expect(cost).toBeCloseTo(0, 6);
  });

  it("applies the OpenAI batch discount exactly once to lanes and synthesis", () => {
    const models: ProviderModels = { lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" };
    // List price: lane 1M * $2.00 + 0.5M * $12 = $8; synthesis $1 + $3 = $4.
    expect(computeRunCost("openai", baseTokens, models, false)).toBeCloseTo(12, 6);
    expect(computeRunCost("openai", baseTokens, models, true, true)).toBeCloseTo(6, 6);
    // A hypothetical sync synthesis attached to a batch lane bills $4 + $4.
    expect(computeRunCost("openai", baseTokens, models, true, false)).toBeCloseTo(8, 6);
  });

  it("prices OpenAI cached input at the cache-read rate without charging it twice", () => {
    const tokens: TokenBreakdown = {
      lanesIn: 1_000_000,
      lanesOut: 0,
      synthesisIn: 1_000_000,
      synthesisOut: 0,
      totalIn: 2_000_000,
      totalOut: 0,
      openaiLaneCachedIn: 400_000,
      openaiSynthesisCachedIn: 200_000,
    };
    // Terra: 0.6M * $2.00 + 0.4M * $0.20 = $1.28.
    // Sol:   0.8M * $5.00 + 0.2M * $0.50 = $4.10. Total = $5.38.
    expect(computeRunCost("openai", tokens, { lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" }, false)).toBeCloseTo(5.38, 6);
  });

  it("prices OpenAI cache writes as replacement input components and clamps mixed usage", () => {
    const tokens: TokenBreakdown = {
      lanesIn: 1_000_000,
      lanesOut: 0,
      synthesisIn: 1_000_000,
      synthesisOut: 0,
      totalIn: 2_000_000,
      totalOut: 0,
      // Cache read gets first claim to the input total; write clamps to the
      // remaining 0.2M rather than creating a negative normal-input amount.
      openaiLaneCachedIn: 800_000,
      openaiLaneCacheWriteIn: 800_000,
      openaiSynthesisCacheWriteIn: 1_000_000,
    };
    // Terra lane: 0.8M * $0.20 + 0.2M * $2.50 = $0.66.
    // Sol synthesis: 1M * $6.25 = $6.25. Total = $6.91.
    expect(computeRunCost("openai", tokens, { lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" }, false)).toBeCloseTo(6.91, 6);
  });

  it("ignores malformed negative, NaN, and infinite OpenAI cache telemetry", () => {
    const tokens: TokenBreakdown = {
      lanesIn: 1_000_000,
      lanesOut: 0,
      synthesisIn: 1_000_000,
      synthesisOut: 0,
      totalIn: 2_000_000,
      totalOut: 0,
      openaiLaneCachedIn: -1,
      openaiLaneCacheWriteIn: Infinity,
      openaiSynthesisCachedIn: Number.NaN,
      openaiSynthesisCacheWriteIn: -1,
    };
    // Malformed optional values are ignored: normal Terra + Sol input = $7.00.
    expect(computeRunCost("openai", tokens, { lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" }, false)).toBeCloseTo(7.0, 6);
  });

  it("uses the established standard rate for non-5.6 OpenAI models", () => {
    const tokens: TokenBreakdown = {
      lanesIn: 1_000_000,
      lanesOut: 1_000_000,
      synthesisIn: 0,
      synthesisOut: 0,
      totalIn: 1_000_000,
      totalOut: 1_000_000,
    };
    // GPT-5 mini: $0.25 input + $2 output at list price.
    expect(computeRunCost("openai", tokens, { lane: "gpt-5-mini", synthesis: "gpt-5-mini" }, false)).toBeCloseTo(2.25, 6);
  });

  it("adds observed OpenAI web-search call fees without batch discount", () => {
    const tokens: TokenBreakdown = {
      lanesIn: 0,
      lanesOut: 0,
      synthesisIn: 0,
      synthesisOut: 0,
      totalIn: 0,
      totalOut: 0,
      openaiWebSearchCalls: 16,
    };
    expect(computeRunCost("openai", tokens, { lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" }, true)).toBeCloseTo(0.16, 6);
  });

  it("ignores malformed OpenAI web-search call counts", () => {
    const models: ProviderModels = { lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" };
    const base: TokenBreakdown = { lanesIn: 0, lanesOut: 0, synthesisIn: 0, synthesisOut: 0, totalIn: 0, totalOut: 0 };
    for (const openaiWebSearchCalls of [-1, Number.NaN, Infinity]) {
      expect(computeRunCost("openai", { ...base, openaiWebSearchCalls }, models, false)).toBe(0);
    }
  });

  it("labels an OpenAI estimate when cache or search telemetry is unavailable", () => {
    const config: SweepConfig = {
      provider: "openai",
      topic: "telemetry test",
      fromYear: 2024,
      toYear: null,
      lanes: ["frontier"],
      depth: "shallow",
      outputDir: "/tmp/out",
      test: true,
      overwrite: false,
    };
    const stats = buildRunStats(config, "sync", 1, null, baseTokens, []);
    expect(stats.costEstimateNotes).toEqual([
      "OpenAI cache read/write usage was unavailable; unreported input is priced at the normal input rate.",
      "OpenAI web-search call count was unavailable; web-search tool fees are excluded.",
    ]);
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
    // sync: 1M/1e6 * 1.0 * 1.25 = 1.25
    const sync = computeRunCost("claude", tokens, haikuModels, false);
    // batch: 1.25 * 0.5 = 0.625
    const batch = computeRunCost("claude", tokens, haikuModels, true);
    expect(sync).toBeCloseTo(1.25, 6);
    expect(batch).toBeCloseTo(0.625, 6);
  });

  it("computes gemini sync cost from known flash-lite + pro pricing", () => {
    // lane: 1M in * 0.10 + 0.5M out * 0.40 = 0.10 + 0.20 = 0.30
    // synth: 0.2M in * 1.25 + 0.1M out * 10.0 = 0.25 + 1.00 = 1.25
    // total = 1.55
    const geminiModels: ProviderModels = {
      lane: "gemini-2.5-flash-lite",
      synthesis: "gemini-2.5-pro",
    };
    const cost = computeRunCost("gemini", baseTokens, geminiModels, false);
    expect(cost).toBeCloseTo(1.55, 6);
  });

  it("applies the 50% batch discount to gemini lanes and batched synthesis", () => {
    // sync lane = 0.30, batch lane = 0.15; synth 1.25 -> 0.625
    // sync total = 1.55, batch total = 0.775
    const geminiModels: ProviderModels = {
      lane: "gemini-2.5-flash-lite",
      synthesis: "gemini-2.5-pro",
    };
    const sync = computeRunCost("gemini", baseTokens, geminiModels, false);
    const batch = computeRunCost("gemini", baseTokens, geminiModels, true);
    expect(sync).toBeCloseTo(1.55, 6);
    expect(batch).toBeCloseTo(0.775, 6);
    expect(batch).toBeLessThan(sync);
  });

  it("computes gemini flash sync cost correctly", () => {
    // lane: 1M in * 0.30 + 0.5M out * 2.50 = 0.30 + 1.25 = 1.55
    // synth: 0.2M in * 0.30 + 0.1M out * 2.50 = 0.06 + 0.25 = 0.31
    // total = 1.86
    const geminiFlashModels: ProviderModels = {
      lane: "gemini-2.5-flash",
      synthesis: "gemini-2.5-flash",
    };
    const cost = computeRunCost("gemini", baseTokens, geminiFlashModels, false);
    expect(cost).toBeCloseTo(1.86, 6);
  });

  it("returns 0 for unknown gemini model without throwing", () => {
    const cost = computeRunCost(
      "gemini",
      baseTokens,
      { lane: "gemini-bogus-9000", synthesis: "gemini-2.5-pro" },
      false
    );
    expect(cost).toBe(0);
  });

});

describe("toHomeRelative", () => {
  const home = os.homedir();

  it("rewrites a path under $HOME to a ~-relative path", () => {
    const p = path.join(home, "obsidian", "research", "x", "summary.md");
    expect(toHomeRelative(p)).toBe("~" + path.sep + path.join("obsidian", "research", "x", "summary.md"));
  });

  it("collapses $HOME itself to ~", () => {
    expect(toHomeRelative(home)).toBe("~");
  });

  it("reduces an absolute path outside $HOME to its basename so no machine prefix leaks", () => {
    const p = "/private/tmp/agent-scratch/-Users-someone-repos-research-sweeper/abc/scratchpad/lane-blogs-smoke.md";
    expect(toHomeRelative(p)).toBe("lane-blogs-smoke.md");
  });

  it("leaves a relative path untouched", () => {
    expect(toHomeRelative("lanes/lane-blogs.md")).toBe("lanes/lane-blogs.md");
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
