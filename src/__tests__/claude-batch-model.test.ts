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
import type { Lane } from "../types";

function makeBatchItem(lane: string, model: string, sources = 1) {
  return {
    custom_id: lane,
    result: {
      type: "succeeded",
      message: {
        model,
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

describe("ClaudeProvider.collectBatchResults — model recording", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    mockResultsIter.mockReset();
  });

  it("records the model from per-result message.model (not hardcoded Sonnet)", async () => {
    const lanes: Lane[] = ["frontier", "academic"];
    mockResultsIter.mockReturnValue(
      asAsyncIter([
        makeBatchItem("frontier", "claude-haiku-4-5-20251001"),
        makeBatchItem("academic", "claude-haiku-4-5-20251001"),
      ])
    );

    const provider = new ClaudeProvider();
    const results = await provider.collectBatchResults("batch_test_id", lanes, "claude-haiku-4-5-20251001");

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.model).toBe("claude-haiku-4-5-20251001");
      expect(r.model).not.toBe("claude-sonnet-4-6");
    }
  });

  it("falls back to submittedModel when per-result model is missing", async () => {
    mockResultsIter.mockReturnValue(
      asAsyncIter([
        {
          custom_id: "frontier",
          result: {
            type: "succeeded",
            message: {
              // no model field
              content: [{ type: "text", text: JSON.stringify({ lane: "frontier", label: "Frontier", sources: [], narrative: "x", model_context: "y" }) }],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          },
        },
      ])
    );

    const provider = new ClaudeProvider();
    const results = await provider.collectBatchResults("batch_x", ["frontier"], "claude-haiku-4-5-20251001");
    expect(results[0].model).toBe("claude-haiku-4-5-20251001");
  });
});
