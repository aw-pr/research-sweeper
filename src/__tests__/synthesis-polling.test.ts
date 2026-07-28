import { afterEach, describe, expect, it, vi } from "vitest";
import { runSynthesisOptimised } from "../cli/synthesis";
import type { ProviderAdapter, SweepConfig } from "../types";

const config: SweepConfig = {
  provider: "openai",
  topic: "Polling test",
  fromYear: 2026,
  toYear: 2026,
  lanes: ["frontier"],
  depth: "shallow",
  outputDir: "/tmp/research-sweeper-polling-test",
  test: false,
  overwrite: false,
  openaiAuth: "api_key",
};

function batchProvider(statuses: string[]): ProviderAdapter {
  const getBatchStatus = vi.fn(async () => ({
    id: "batch-synthesis-123",
    status: statuses.shift() || "completed",
    counts: { processing: 0, succeeded: 0, errored: 0 },
  }));
  return {
    provider: "openai",
    getModels: () => ({ lane: "gpt-5.6-terra", synthesis: "gpt-5.6-sol" }),
    requireApiKey: () => "test-key",
    runLane: vi.fn(),
    runSynthesis: vi.fn(),
    submitBatchLanes: vi.fn(),
    getBatchStatus,
    collectBatchResults: vi.fn(),
    submitBatchSynthesis: vi.fn(async () => "batch-synthesis-123"),
    collectBatchSynthesisResult: vi.fn(async () => ({ markdown: "# Complete", tokensIn: 1, tokensOut: 2 })),
  };
}

describe("runSynthesisOptimised batch polling", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["failed", "expired", "cancelled", "errored", "unknown"])('fails promptly for terminal status "%s"', async (status) => {
    vi.useFakeTimers();
    const provider = batchProvider([status]);
    const run = runSynthesisOptimised(provider, config, [], "sources-test");
    const rejection = expect(run).rejects.toThrow(`Synthesis batch batch-synthesis-123 ended with status "${status}".`);

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(provider.collectBatchSynthesisResult).not.toHaveBeenCalled();
  });

  it("continues through known in-progress states and collects a completed batch", async () => {
    vi.useFakeTimers();
    const provider = batchProvider(["validating", "in_progress", "finalizing", "completed"]);
    const run = runSynthesisOptimised(provider, config, [], "sources-test");

    await vi.advanceTimersByTimeAsync(40_000);

    await expect(run).resolves.toMatchObject({ markdown: "# Complete", batched: true });
    expect(provider.collectBatchSynthesisResult).toHaveBeenCalledWith("batch-synthesis-123");
  });
});
