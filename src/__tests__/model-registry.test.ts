import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MODEL_REGISTRY_ENV, registryModel, registryPricing, resetModelRegistryCache } from "../model-registry";
import { ClaudeProvider, haikuLaneModel, sonnetLaneModel, synthesisModel } from "../providers/claude";
import type { SweepConfig } from "../types";

const ENV_KEYS = [MODEL_REGISTRY_ENV, "SYNTHESIS_MODEL", "LANE_MODEL_SONNET", "LANE_MODEL_HAIKU"];

function makeConfig(overrides: Partial<SweepConfig> = {}): SweepConfig {
  return {
    provider: "claude",
    topic: "Registry test",
    fromYear: 2025,
    toYear: 2026,
    lanes: ["financial"],
    depth: "standard",
    outputDir: "/tmp/does-not-matter",
    test: false,
    overwrite: false,
    ...overrides,
  };
}

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

function writeRegistry(contents: unknown): string {
  const file = path.join(tmpDir, "models.json");
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
  return file;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "model-registry-"));
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetModelRegistryCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetModelRegistryCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const REGISTRY = {
  claude: { opus: "claude-opus-registry", sonnet: "claude-sonnet-registry", haiku: "claude-haiku-registry" },
  pricing: {
    "claude-opus-registry": { inPer1M: 4, outPer1M: 20, cachedInPer1M: 0.2, verified: true },
    "claude-broken-row": { inPer1M: "4", outPer1M: 20 },
  },
};

describe("model registry", () => {
  it("is inert when the env var is unset", () => {
    expect(registryModel("claude", "opus")).toBeUndefined();
    expect(registryPricing("claude-opus-registry")).toBeUndefined();
  });

  it("reads tiers and well-formed pricing rows", () => {
    process.env[MODEL_REGISTRY_ENV] = writeRegistry(REGISTRY);
    expect(registryModel("claude", "opus")).toBe("claude-opus-registry");
    expect(registryModel("claude", "nonexistent")).toBeUndefined();
    expect(registryPricing("claude-opus-registry")).toEqual({ inPer1M: 4, outPer1M: 20, cachedInPer1M: 0.2 });
    expect(registryPricing("claude-broken-row")).toBeUndefined();
  });

  it("warns once and falls back when the registry file is unreadable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[MODEL_REGISTRY_ENV] = writeRegistry("{ not json");
    expect(registryModel("claude", "opus")).toBeUndefined();
    expect(registryModel("claude", "sonnet")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(synthesisModel(makeConfig())).toMatch(/^claude-opus-/);
  });
});

describe("Claude model resolution order", () => {
  it("uses the built-in fallbacks with no env and no registry", () => {
    expect(haikuLaneModel()).toBe("claude-haiku-4-5-20251001");
    expect(sonnetLaneModel()).toBe("claude-sonnet-5");
    expect(synthesisModel(makeConfig())).toMatch(/^claude-opus-/);
  });

  it("prefers the registry over the fallbacks", () => {
    process.env[MODEL_REGISTRY_ENV] = writeRegistry(REGISTRY);
    expect(haikuLaneModel()).toBe("claude-haiku-registry");
    expect(sonnetLaneModel()).toBe("claude-sonnet-registry");
    expect(synthesisModel(makeConfig())).toBe("claude-opus-registry");
  });

  it("prefers env overrides over the registry", () => {
    process.env[MODEL_REGISTRY_ENV] = writeRegistry(REGISTRY);
    process.env.SYNTHESIS_MODEL = "claude-opus-env";
    process.env.LANE_MODEL_SONNET = "claude-sonnet-env";
    process.env.LANE_MODEL_HAIKU = "claude-haiku-env";
    expect(synthesisModel(makeConfig())).toBe("claude-opus-env");
    expect(sonnetLaneModel()).toBe("claude-sonnet-env");
    expect(haikuLaneModel()).toBe("claude-haiku-env");
  });

  it("keeps --synthesis-model above every other source", () => {
    process.env[MODEL_REGISTRY_ENV] = writeRegistry(REGISTRY);
    process.env.SYNTHESIS_MODEL = "claude-opus-env";
    expect(synthesisModel(makeConfig({ synthesisModel: "claude-opus-flag" }))).toBe("claude-opus-flag");
  });

  it("routes getModels through the resolvers by depth and test mode", () => {
    process.env[MODEL_REGISTRY_ENV] = writeRegistry(REGISTRY);
    const provider = new ClaudeProvider();
    expect(provider.getModels(makeConfig({ depth: "deep" }), "sync")).toEqual({ lane: "claude-sonnet-registry", synthesis: "claude-opus-registry" });
    expect(provider.getModels(makeConfig({ depth: "shallow" }), "sync").lane).toBe("claude-haiku-registry");
    expect(provider.getModels(makeConfig({ test: true }), "sync")).toEqual({ lane: "claude-haiku-registry", synthesis: "claude-haiku-registry" });
  });
});
