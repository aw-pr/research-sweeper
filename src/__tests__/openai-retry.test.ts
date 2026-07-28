import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the OpenAI SDK before importing the provider — capture the constructor
// options (to assert maxRetries: 0) and let responses.create be scripted per
// test. Mirrors claude-retry.test.ts.
const mockCreate = vi.fn();
const mockConstructorOptions: Record<string, unknown>[] = [];
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      responses = { create: (params: unknown) => mockCreate(params) };
      files = {};
      batches = {};
      constructor(options: Record<string, unknown>) {
        mockConstructorOptions.push(options);
      }
    },
  };
});

import { OpenAIProvider, openaiErrorStatus, openaiRetryAfterMs, isTransientOpenAIError } from "../providers/openai";
import type { SweepConfig } from "../types";

function openaiError(status: number, headers: Record<string, string> = {}) {
  const err = new Error(`status ${status}`) as Error & { status: number; headers: Record<string, string> };
  err.status = status;
  err.headers = headers;
  return err;
}

function makeConfig(overrides: Partial<SweepConfig> = {}): SweepConfig {
  return {
    provider: "openai",
    topic: "test topic",
    fromYear: 2024,
    toYear: null,
    lanes: ["frontier"],
    depth: "shallow",
    outputDir: "/tmp/out",
    test: true, // forces TEST_MODEL and skips model branching
    overwrite: false,
    noSearch: true, // simplifies tool config
    openaiAuth: "api_key", // force api-key path deterministically (no codex fs read)
    ...overrides,
  };
}

function laneResponse() {
  return {
    output_text: JSON.stringify({ sources: [], narrative: "narrative text" }),
    usage: { input_tokens: 10, output_tokens: 5 },
    output: [],
  };
}

describe("openai.ts transient-error predicate and retry-after parsing", () => {
  it("treats 429, 500, 502, 503, and 529 as transient", () => {
    for (const status of [429, 500, 502, 503, 529]) {
      expect(isTransientOpenAIError(openaiError(status))).toBe(true);
    }
  });

  it("does not treat 400/401/403/404/422 as transient", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isTransientOpenAIError(openaiError(status))).toBe(false);
    }
  });

  it("returns undefined status for a non-SDK error", () => {
    expect(openaiErrorStatus(new Error("plain"))).toBeUndefined();
    expect(isTransientOpenAIError(new Error("plain"))).toBe(false);
  });

  it("extracts a retry-after hint (seconds -> ms) only for 429", () => {
    expect(openaiRetryAfterMs(openaiError(429, { "retry-after": "3" }))).toBe(3000);
  });

  it("ignores retry-after on non-429 transient statuses", () => {
    expect(openaiRetryAfterMs(openaiError(503, { "retry-after": "3" }))).toBeUndefined();
  });

  it("returns undefined when retry-after header is absent or non-numeric", () => {
    expect(openaiRetryAfterMs(openaiError(429, {}))).toBeUndefined();
    expect(openaiRetryAfterMs(openaiError(429, { "retry-after": "not-a-number" }))).toBeUndefined();
  });

  it("reads a Headers-like object exposing get()", () => {
    const err = new Error("429") as Error & { status: number; headers: { get: (n: string) => string | null } };
    err.status = 429;
    err.headers = { get: (n: string) => (n === "retry-after" ? "2" : null) };
    expect(openaiRetryAfterMs(err)).toBe(2000);
  });
});

describe("OpenAIProvider — retry wiring on the API-key path", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key-not-real";
    mockCreate.mockReset();
    mockConstructorOptions.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
  });

  it("constructs the OpenAI client with maxRetries: 0", async () => {
    mockCreate.mockResolvedValue(laneResponse());
    const provider = new OpenAIProvider();
    await provider.runLane(makeConfig(), "frontier");
    expect(mockConstructorOptions).toHaveLength(1);
    expect(mockConstructorOptions[0].maxRetries).toBe(0);
  });

  it("preserves model context and a reported zero cached-input count on a sync lane", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ sources: [], narrative: "narrative text", model_context: "model background" }),
      usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
      output: [],
    });

    const result = await new OpenAIProvider().runLane(makeConfig(), "frontier");

    expect(result.model_context).toBe("model background");
    expect(result.openaiCachedIn).toBe(0);
    expect(result.openaiCacheWriteIn).toBe(0);
  });

  it("retries a transient 503 once and then succeeds, without degrading the lane", async () => {
    mockCreate.mockRejectedValueOnce(openaiError(503)).mockResolvedValueOnce(laneResponse());

    const provider = new OpenAIProvider();
    const resultPromise = provider.runLane(makeConfig(), "frontier");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.narrative).toBe("narrative text");
    expect(result.narrative).not.toContain("Error during sweep");
  });

  it("does not retry a non-transient 400 and degrades the lane via the catch-all fallback", async () => {
    mockCreate.mockRejectedValueOnce(openaiError(400));

    const provider = new OpenAIProvider();
    const result = await provider.runLane(makeConfig(), "frontier");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.narrative).toContain("Error during sweep");
  });

  it("exhausts retries on a persistent transient error and degrades via the catch-all fallback", async () => {
    mockCreate.mockRejectedValue(openaiError(529));

    const provider = new OpenAIProvider();
    const resultPromise = provider.runLane(makeConfig(), "frontier");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // 1 initial attempt + 3 retries = 4 total calls (maxAttempts: 3 in withOpenAIRetry).
    expect(mockCreate).toHaveBeenCalledTimes(4);
    expect(result.narrative).toContain("Error during sweep");
  });
});
