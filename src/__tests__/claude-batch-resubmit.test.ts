import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK before importing the provider.
const mockResultsIter = vi.fn();
const mockBatchesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        batches: {
          results: (id: string) => mockResultsIter(id),
          create: (params: unknown) => mockBatchesCreate(params),
        },
      };
    },
  };
});

import { ClaudeProvider } from "../providers/claude";
import type { Lane, SweepConfig } from "../types";

async function* asAsyncIter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function makeConfig(lanes: Lane[]): SweepConfig {
  return {
    provider: "claude",
    topic: "Batch recovery integration test",
    fromYear: 2025,
    toYear: 2026,
    lanes,
    depth: "standard",
    outputDir: "/tmp/does-not-matter",
    test: false,
    overwrite: false,
  };
}

describe("ClaudeProvider.getBatchLaneFailures", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    mockResultsIter.mockReset();
    mockBatchesCreate.mockReset();
  });

  it("reports errored/expired/canceled lanes with their result type", async () => {
    mockResultsIter.mockReturnValue(
      asAsyncIter([
        { custom_id: "financial", result: { type: "succeeded" } },
        { custom_id: "frontier", result: { type: "errored" } },
        { custom_id: "academic", result: { type: "expired" } },
      ])
    );

    const provider = new ClaudeProvider();
    const failures = await provider.getBatchLaneFailures("batch_id", ["financial", "frontier", "academic"]);

    expect(failures).toEqual([
      { lane: "frontier", resultType: "errored" },
      { lane: "academic", resultType: "expired" },
    ]);
  });

  it("returns an empty array when the whole batch succeeded", async () => {
    mockResultsIter.mockReturnValue(asAsyncIter([{ custom_id: "financial", result: { type: "succeeded" } }]));

    const provider = new ClaudeProvider();
    const failures = await provider.getBatchLaneFailures("batch_id", ["financial"]);
    expect(failures).toEqual([]);
  });
});

describe("ClaudeProvider.submitBatchLanesSubset", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    mockResultsIter.mockReset();
    mockBatchesCreate.mockReset();
  });

  it("submits requests for exactly the given lane subset", async () => {
    mockBatchesCreate.mockResolvedValue({ id: "batch_new_id" });

    const provider = new ClaudeProvider();
    const config = makeConfig(["financial", "frontier", "academic", "vc", "blogs", "tech"]);
    const batchId = await provider.submitBatchLanesSubset(config, ["frontier", "vc"]);

    expect(batchId).toBe("batch_new_id");
    expect(mockBatchesCreate).toHaveBeenCalledTimes(1);
    const params = mockBatchesCreate.mock.calls[0][0] as { requests: Array<{ custom_id: string }> };
    expect(params.requests.map((r) => r.custom_id)).toEqual(["frontier", "vc"]);
  });
});
