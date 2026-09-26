import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MODEL_REGISTRY_ENV, resetModelRegistryCache } from "../model-registry";
import { buildRunStats, computeRunCost, findUnpricedModels, resetUnpricedWarnings, warnUnpricedModels } from "../stats";
import type { SweepConfig, TokenBreakdown } from "../types";

const tokens: TokenBreakdown = { lanesIn: 1_000_000, lanesOut: 0, synthesisIn: 1_000_000, synthesisOut: 0, totalIn: 2_000_000, totalOut: 0 };

const config: SweepConfig = {
  provider: "claude",
  topic: "Unpriced model test",
  fromYear: 2025,
  toYear: null,
  lanes: ["frontier"],
  depth: "deep",
  outputDir: "/tmp",
  test: false,
  overwrite: false,
};

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stats-unpriced-"));
  for (const key of [MODEL_REGISTRY_ENV, "SYNTHESIS_MODEL"]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetModelRegistryCache();
  resetUnpricedWarnings();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetModelRegistryCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("unpriced models", () => {
  it("records an unpriced synthesis model as unknown cost, not $0", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = buildRunStats({ ...config, synthesisModel: "claude-future-9" }, "sync", 1, null, tokens, []);
    expect(stats.estimatedCostUSD).toBeNull();
    expect(stats.unpricedModels).toEqual(["claude-future-9"]);
  });

  it("omits unpricedModels when every model is priced", () => {
    const stats = buildRunStats({ ...config, synthesisModel: "claude-opus-5" }, "sync", 1, null, tokens, []);
    expect(typeof stats.estimatedCostUSD).toBe("number");
    expect(stats.unpricedModels).toBeUndefined();
  });

  it("warns loudly once per model per run, however many times it is checked", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const models = { lane: "claude-sonnet-5", synthesis: "claude-future-9" };
    expect(warnUnpricedModels("claude", models)).toEqual(["claude-future-9"]);
    warnUnpricedModels("claude", models);
    buildRunStats({ ...config, synthesisModel: "claude-future-9" }, "sync", 1, null, tokens, []);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("UNKNOWN");
  });

  it("stays silent for priced models", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(warnUnpricedModels("claude", { lane: "claude-sonnet-5", synthesis: "claude-opus-5" })).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("registry pricing fallback", () => {
  function useRegistry(pricing: Record<string, unknown>) {
    const file = path.join(tmpDir, "models.json");
    fs.writeFileSync(file, JSON.stringify({ pricing }));
    process.env[MODEL_REGISTRY_ENV] = file;
  }

  it("prices a model missing from the local table via the registry", () => {
    useRegistry({ "claude-future-9": { inPer1M: 2, outPer1M: 8 } });
    const models = { lane: "claude-sonnet-5", synthesis: "claude-future-9" };
    expect(findUnpricedModels("claude", models)).toEqual([]);
    // lane 1M * $3 + synthesis 1M * $2
    expect(computeRunCost("claude", tokens, models, false)).toBeCloseTo(5, 6);
  });

  it("prefers the local table over the registry for a known id", () => {
    useRegistry({ "claude-sonnet-5": { inPer1M: 99, outPer1M: 99 } });
    const models = { lane: "claude-sonnet-5", synthesis: "claude-sonnet-5" };
    expect(computeRunCost("claude", tokens, models, false)).toBeCloseTo(6, 6);
  });
});
