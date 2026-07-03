import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Anthropic SDK before importing the provider — capture the
// constructor options (to assert maxRetries: 0) and let messages.create be
// scripted per test.
const mockCreate = vi.fn();
const mockConstructorOptions: Record<string, unknown>[] = [];
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: (params: unknown) => mockCreate(params) };
      constructor(options: Record<string, unknown>) {
        mockConstructorOptions.push(options);
      }
    },
  };
});

import { ClaudeProvider, claudeErrorStatus, claudeRetryAfterMs, isTransientClaudeError } from "../providers/claude";
import type { SweepConfig } from "../types";

function anthropicError(status: number, headers: Record<string, string> = {}) {
  const err = new Error(`status ${status}`) as Error & { status: number; headers: Record<string, string> };
  err.status = status;
  err.headers = headers;
  return err;
}

function makeConfig(overrides: Partial<SweepConfig> = {}): SweepConfig {
  return {
    provider: "claude",
    topic: "test topic",
    fromYear: 2024,
    toYear: null,
    lanes: ["frontier"],
    depth: "shallow",
    outputDir: "/tmp/out",
    test: true, // forces LANE_MODEL_HAIKU and skips resolveLaneModel branching
    overwrite: false,
    noSearch: true, // simplifies tool_choice to the forced submit tool
    ...overrides,
  };
}

function submitToolResponse() {
  return {
    content: [
      {
        type: "tool_use",
        name: "submit_lane_findings",
        input: { narrative: "narrative text", sources: [] },
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: "tool_use",
  };
}

describe("claude.ts transient-error predicate and retry-after parsing", () => {
  it("treats 429, 500, 502, 503, and 529 as transient", () => {
    for (const status of [429, 500, 502, 503, 529]) {
      expect(isTransientClaudeError(anthropicError(status))).toBe(true);
    }
  });

  it("does not treat 400/401/403/404/422 as transient", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isTransientClaudeError(anthropicError(status))).toBe(false);
    }
  });

  it("returns undefined status for a non-SDK error", () => {
    expect(claudeErrorStatus(new Error("plain"))).toBeUndefined();
    expect(isTransientClaudeError(new Error("plain"))).toBe(false);
  });

  it("extracts a retry-after hint (seconds -> ms) only for 429", () => {
    const err = anthropicError(429, { "retry-after": "3" });
    expect(claudeRetryAfterMs(err)).toBe(3000);
  });

  it("ignores retry-after on non-429 transient statuses", () => {
    const err = anthropicError(503, { "retry-after": "3" });
    expect(claudeRetryAfterMs(err)).toBeUndefined();
  });

  it("returns undefined when retry-after header is absent or non-numeric", () => {
    expect(claudeRetryAfterMs(anthropicError(429, {}))).toBeUndefined();
    expect(claudeRetryAfterMs(anthropicError(429, { "retry-after": "not-a-number" }))).toBeUndefined();
  });
});

describe("ClaudeProvider — retry wiring on the API-key path", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    mockCreate.mockReset();
    mockConstructorOptions.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("constructs the Anthropic client with maxRetries: 0", async () => {
    mockCreate.mockResolvedValue(submitToolResponse());
    const provider = new ClaudeProvider();
    await provider.runLane(makeConfig(), "frontier");
    expect(mockConstructorOptions).toHaveLength(1);
    expect(mockConstructorOptions[0].maxRetries).toBe(0);
  });

  it("retries a transient 503 once and then succeeds, without degrading the lane", async () => {
    mockCreate.mockRejectedValueOnce(anthropicError(503)).mockResolvedValueOnce(submitToolResponse());

    const provider = new ClaudeProvider();
    const resultPromise = provider.runLane(makeConfig(), "frontier");
    // Let the retry's backoff timer fire.
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.narrative).toBe("narrative text");
    expect(result.narrative).not.toContain("Error during sweep");
  });

  it("does not retry a non-transient 400 and degrades the lane via the catch-all fallback", async () => {
    mockCreate.mockRejectedValueOnce(anthropicError(400));

    const provider = new ClaudeProvider();
    const result = await provider.runLane(makeConfig(), "frontier");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.narrative).toContain("Error during sweep");
  });

  it("exhausts retries on a persistent transient error and degrades via the catch-all fallback", async () => {
    mockCreate.mockRejectedValue(anthropicError(529));

    const provider = new ClaudeProvider();
    const resultPromise = provider.runLane(makeConfig(), "frontier");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // 1 initial attempt + 3 retries = 4 total calls (maxAttempts: 3 in withClaudeRetry).
    expect(mockCreate).toHaveBeenCalledTimes(4);
    expect(result.narrative).toContain("Error during sweep");
  });
});
