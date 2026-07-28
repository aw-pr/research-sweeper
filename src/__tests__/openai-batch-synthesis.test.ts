import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRetrieve = vi.fn();
const mockContent = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    batches = { retrieve: (id: string) => mockRetrieve(id) };
    files = { content: (id: string) => mockContent(id) };
    constructor(_options: Record<string, unknown>) {}
  },
}));

import { buildSynthesisBatchRequest, OpenAIProvider } from "../providers/openai";
import { DEPTH_CONFIG } from "../config";
import type { Depth, LaneResult, SweepConfig } from "../types";

function makeConfig(depth: Depth = "deep"): SweepConfig {
  return {
    provider: "openai",
    topic: "Batch synthesis test topic",
    fromYear: 2026,
    toYear: 2026,
    lanes: ["financial", "frontier"],
    depth,
    outputDir: "/tmp/does-not-matter",
    test: false,
    overwrite: false,
    openaiAuth: "api_key",
  };
}

const laneResults: LaneResult[] = [
  {
    lane: "financial",
    label: "Financial",
    sources: [{ title: "A source", url: "https://example.com/a", outlet: "Example", date: "2026-07", significance: "Baseline datapoint." }],
    narrative: "Some findings.",
    rawText: "{}",
    tokensIn: 10,
    tokensOut: 20,
    model: "gpt-5.6-terra",
  },
];

describe("buildSynthesisBatchRequest", () => {
  it("builds a single /v1/responses request with the synthesis custom_id", () => {
    const request = buildSynthesisBatchRequest(makeConfig(), "gpt-5.6-sol", laneResults, "sources-test");

    expect(request.custom_id).toBe("synthesis");
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/v1/responses");
    expect(request.body.model).toBe("gpt-5.6-sol");
  });

  it("uses high reasoning effort and the depth's synthesis token cap", () => {
    const request = buildSynthesisBatchRequest(makeConfig("deep"), "gpt-5.6-sol", laneResults, "sources-test");

    expect(request.body.reasoning).toEqual({ effort: "high" });
    expect(request.body.max_output_tokens).toBe(DEPTH_CONFIG.deep.synthesisMaxTokens);
  });

  it("omits the lane tool config and json_schema format so synthesis stays free markdown", () => {
    const request = buildSynthesisBatchRequest(makeConfig(), "gpt-5.6-sol", laneResults, "sources-test");
    const body = request.body as Record<string, unknown>;

    expect(body.text).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("carries the lane findings through into the prompt input", () => {
    const request = buildSynthesisBatchRequest(makeConfig(), "gpt-5.6-sol", laneResults, "sources-test");
    const prompt = request.body.input[0].content[0].text;

    expect(prompt).toContain("Some findings.");
    expect(prompt).toContain("Batch synthesis test topic");
  });
});

describe("OpenAIProvider.collectBatchSynthesisResult", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key-not-real";
    mockRetrieve.mockReset();
    mockContent.mockReset();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("surfaces an HTTP failure from the batch output with its batch id", async () => {
    mockRetrieve.mockResolvedValue({ output_file_id: "output-file" });
    mockContent.mockResolvedValue({
      text: async () => JSON.stringify({
        custom_id: "synthesis",
        response: { status_code: 400, body: { error: { message: "Unsupported model" } } },
      }),
    });

    const provider = new OpenAIProvider();
    provider.requireApiKey(makeConfig());

    await expect(provider.collectBatchSynthesisResult("batch-synthesis-123")).rejects.toThrow(
      "Synthesis batch batch-synthesis-123 request failed (HTTP 400): Unsupported model"
    );
  });

  it("includes batch-level validation errors when no output file exists", async () => {
    mockRetrieve.mockResolvedValue({
      errors: { data: [{ message: "Invalid request at line 1" }] },
    });

    const provider = new OpenAIProvider();
    provider.requireApiKey(makeConfig());

    await expect(provider.collectBatchSynthesisResult("batch-synthesis-123")).rejects.toThrow(
      "Synthesis batch batch-synthesis-123 produced no output file: Invalid request at line 1"
    );
  });

  it("preserves a reported zero cached-input count as known telemetry", async () => {
    mockRetrieve.mockResolvedValue({ output_file_id: "output-file" });
    mockContent.mockResolvedValue({
      text: async () => JSON.stringify({
        custom_id: "synthesis",
        response: {
          status_code: 200,
          body: {
            output_text: "# Complete",
            output: [],
            usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
          },
        },
      }),
    });

    const provider = new OpenAIProvider();
    provider.requireApiKey(makeConfig());
    const result = await provider.collectBatchSynthesisResult("batch-synthesis-123");

    expect(result.openaiCachedIn).toBe(0);
    expect(result.openaiCacheWriteIn).toBe(0);
  });
});
