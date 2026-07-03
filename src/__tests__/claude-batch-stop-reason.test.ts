import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK before importing the provider.
const mockResultsIter = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        batches: {
          results: (id: string) => mockResultsIter(id),
        },
      };
    },
  };
});

import { ClaudeProvider } from "../providers/claude";
import { REFUSAL_NARRATIVE, TRUNCATION_MARKER } from "../stop-reason";
import type { Lane } from "../types";

function makeBatchItem(lane: string, stopReason: string, sources = 1) {
  return {
    custom_id: lane,
    result: {
      type: "succeeded",
      message: {
        model: "claude-haiku-4-5-20251001",
        stop_reason: stopReason,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              lane,
              label: lane,
              sources: Array.from({ length: sources }, (_, idx) => ({
                title: `Source ${idx}`,
                url: `https://example.com/${idx}`,
                date: "2025",
                outlet: "Example",
                significance: "test",
              })),
              narrative: "narrative",
              model_context: "ctx",
            }),
          },
        ],
        usage: { input_tokens: 1000, output_tokens: 500 },
      },
    },
  };
}

async function* asAsyncIter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

describe("ClaudeProvider.collectBatchResults — stop_reason handling", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    mockResultsIter.mockReset();
  });

  it("marks a lane truncated and prefixes the narrative on stop_reason max_tokens", async () => {
    const lanes: Lane[] = ["frontier"];
    mockResultsIter.mockReturnValue(asAsyncIter([makeBatchItem("frontier", "max_tokens")]));

    const provider = new ClaudeProvider();
    const results = await provider.collectBatchResults("batch_id", lanes, "claude-haiku-4-5-20251001");

    expect(results[0].truncated).toBe(true);
    expect(results[0].narrative.startsWith(TRUNCATION_MARKER)).toBe(true);
  });

  it("returns the degraded refusal fallback on stop_reason refusal", async () => {
    const lanes: Lane[] = ["frontier"];
    mockResultsIter.mockReturnValue(asAsyncIter([makeBatchItem("frontier", "refusal")]));

    const provider = new ClaudeProvider();
    const results = await provider.collectBatchResults("batch_id", lanes, "claude-haiku-4-5-20251001");

    expect(results[0].narrative).toBe(REFUSAL_NARRATIVE);
    expect(results[0].sources).toHaveLength(0);
  });

  it("does not mark truncated on a normal stop_reason", async () => {
    const lanes: Lane[] = ["frontier"];
    mockResultsIter.mockReturnValue(asAsyncIter([makeBatchItem("frontier", "end_turn")]));

    const provider = new ClaudeProvider();
    const results = await provider.collectBatchResults("batch_id", lanes, "claude-haiku-4-5-20251001");

    expect(results[0].truncated).toBeUndefined();
    expect(results[0].narrative).toBe("narrative");
  });
});

describe("ClaudeProvider.collectBatchSynthesisResult — max_tokens truncation warning", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    mockResultsIter.mockReset();
  });

  it("appends the truncation callout on stop_reason max_tokens", async () => {
    mockResultsIter.mockReturnValue(
      asAsyncIter([
        {
          custom_id: "synthesis",
          result: {
            type: "succeeded",
            message: {
              stop_reason: "max_tokens",
              content: [{ type: "text", text: "# Partial Brief" }],
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          },
        },
      ])
    );

    const provider = new ClaudeProvider();
    const { markdown } = await provider.collectBatchSynthesisResult("batch_id");

    expect(markdown).toContain("# Partial Brief");
    expect(markdown).toContain("[!warning] Synthesis truncated at max_tokens");
  });

  it("does not append the callout on a normal stop_reason", async () => {
    mockResultsIter.mockReturnValue(
      asAsyncIter([
        {
          custom_id: "synthesis",
          result: {
            type: "succeeded",
            message: {
              stop_reason: "end_turn",
              content: [{ type: "text", text: "# Full Brief" }],
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          },
        },
      ])
    );

    const provider = new ClaudeProvider();
    const { markdown } = await provider.collectBatchSynthesisResult("batch_id");

    expect(markdown).toBe("# Full Brief");
  });
});
