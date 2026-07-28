import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK before importing the provider.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: (params: unknown) => mockCreate(params) };
      constructor() {
        // no-op — options aren't asserted in this file (see claude-retry.test.ts)
      }
    },
  };
});

import { ClaudeProvider } from "../providers/claude";
import { REFUSAL_NARRATIVE, TRUNCATION_MARKER } from "../stop-reason";
import type { SweepConfig } from "../types";

function makeConfig(overrides: Partial<SweepConfig> = {}): SweepConfig {
  return {
    provider: "claude",
    topic: "test topic",
    fromYear: 2024,
    toYear: null,
    lanes: ["frontier"],
    depth: "shallow",
    outputDir: "/tmp/out",
    test: true,
    overwrite: false,
    noSearch: true,
    ...overrides,
  };
}

function toolResponse(stopReason: string) {
  return {
    content: [
      {
        type: "tool_use",
        name: "submit_lane_findings",
        input: { narrative: "narrative text", sources: [] },
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: stopReason,
  };
}

function pauseTurnResponse() {
  return {
    content: [{ type: "server_tool_use", name: "web_search", input: { query: "x" } }],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: "pause_turn",
  };
}

describe("ClaudeProvider.runLane — stop_reason handling (API-key path)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    mockCreate.mockReset();
  });

  it("resends on pause_turn by appending the paused assistant response, then completes", async () => {
    mockCreate.mockResolvedValueOnce(pauseTurnResponse()).mockResolvedValueOnce(toolResponse("tool_use"));

    const provider = new ClaudeProvider();
    const result = await provider.runLane(makeConfig(), "frontier");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Second call's messages must include the paused assistant turn appended.
    const secondCallParams = mockCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: unknown }> };
    expect(secondCallParams.messages).toHaveLength(2);
    expect(secondCallParams.messages[1].role).toBe("assistant");
    expect(secondCallParams.messages[1].content).toEqual(pauseTurnResponse().content);
    expect(result.narrative).toBe("narrative text");
  });

  it("bounds pause_turn continuations at 5 and stops resending", async () => {
    mockCreate.mockResolvedValue(pauseTurnResponse());

    const provider = new ClaudeProvider();
    await provider.runLane(makeConfig(), "frontier");

    // 1 initial call + 5 continuations = 6 total.
    expect(mockCreate).toHaveBeenCalledTimes(6);
  });

  it("marks the lane truncated and prefixes the narrative on stop_reason max_tokens", async () => {
    mockCreate.mockResolvedValueOnce(toolResponse("max_tokens"));

    const provider = new ClaudeProvider();
    const result = await provider.runLane(makeConfig(), "frontier");

    expect(result.truncated).toBe(true);
    expect(result.narrative.startsWith(TRUNCATION_MARKER)).toBe(true);
    expect(result.narrative).toContain("narrative text");
  });

  it("returns the degraded refusal fallback on stop_reason refusal", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
      stop_reason: "refusal",
    });

    const provider = new ClaudeProvider();
    const result = await provider.runLane(makeConfig(), "frontier");

    expect(result.narrative).toBe(REFUSAL_NARRATIVE);
    expect(result.sources).toHaveLength(0);
  });

  it("does not mark truncated on a normal end_turn/tool_use completion", async () => {
    mockCreate.mockResolvedValueOnce(toolResponse("tool_use"));

    const provider = new ClaudeProvider();
    const result = await provider.runLane(makeConfig(), "frontier");

    expect(result.truncated).toBeUndefined();
    expect(result.narrative).toBe("narrative text");
  });
});

describe("ClaudeProvider.runSynthesis — max_tokens truncation warning (API-key path)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    mockCreate.mockReset();
  });

  it("appends the truncation callout to the markdown on stop_reason max_tokens", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "# Partial Brief" }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "max_tokens",
    });

    const provider = new ClaudeProvider();
    const { markdown } = await provider.runSynthesis(makeConfig(), [], "sources.md");

    expect(markdown).toContain("# Partial Brief");
    expect(markdown).toContain("[!warning] Synthesis truncated at max_tokens");
  });

  it("fails rather than writing an empty synthesis on refusal", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 100, output_tokens: 2 },
      stop_reason: "refusal",
    });

    await expect(new ClaudeProvider().runSynthesis(makeConfig(), [], "sources.md")).rejects.toThrow(
      "Synthesis refused by Claude (stop_reason: refusal)."
    );
  });

  it("does not append the callout on a normal end_turn completion", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "# Full Brief" }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });

    const provider = new ClaudeProvider();
    const { markdown } = await provider.runSynthesis(makeConfig(), [], "sources.md");

    expect(markdown).toBe("# Full Brief");
  });
});
