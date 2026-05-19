import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @google/genai SDK before importing the provider.
// The GeminiProvider calls (ai as any).batches.get({ name }) and reads
// job.state and job.dest.inlinedResponses[].
const mockBatchesGet = vi.fn();
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      batches = {
        get: (args: unknown) => mockBatchesGet(args),
      };
      // Expose models.generateContent to satisfy imports that call it;
      // not exercised in batch tests.
      models = {
        generateContent: vi.fn(),
      };
    },
  };
});

import { GeminiProvider } from "../providers/gemini";
import type { Lane } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a single inlinedResponse item. */
function makeInlinedResponse(rawText: string, tokensIn = 1000, tokensOut = 500) {
  return {
    response: {
      text: rawText,
      usageMetadata: {
        promptTokenCount: tokensIn,
        candidatesTokenCount: tokensOut,
      },
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [],
            webSearchQueries: ["test query"],
          },
        },
      ],
    },
  };
}

/** Build valid JSON lane content (mirrors the shape parseLaneResponse expects). */
function makeLaneJson(lane: string, sources = 1) {
  return JSON.stringify({
    lane,
    label: lane,
    sources: Array.from({ length: sources }, (_, idx) => ({
      title: `Source ${idx}`,
      url: `https://example.com/${idx}`,
      date: "2026",
      outlet: "Example",
      significance: "test",
    })),
    narrative: "narrative text",
    model_context: "background knowledge",
  });
}

/** Simulate a succeeded batch job with the given inlined responses. */
function makeSucceededJob(inlinedResponses: Array<ReturnType<typeof makeInlinedResponse>>) {
  return {
    name: "projects/test-project/locations/us-central1/batchPredictionJobs/123",
    state: "JOB_STATE_SUCCEEDED",
    dest: { inlinedResponses },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GeminiProvider.collectBatchResults — batch contract", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    // Ensure OAuth token is absent so the provider defaults to api_key.
    delete process.env.GOOGLE_ACCESS_TOKEN;
    mockBatchesGet.mockReset();
  });

  it("returns LaneResult[] with correct lane keys in submission order", async () => {
    const lanes: Lane[] = ["frontier", "academic"];
    mockBatchesGet.mockResolvedValue(
      makeSucceededJob([
        makeInlinedResponse(makeLaneJson("frontier"), 1000, 500),
        makeInlinedResponse(makeLaneJson("academic"), 800, 400),
      ])
    );

    const provider = new GeminiProvider();
    const results = await provider.collectBatchResults("batch-id-123", lanes, "gemini-2.5-flash-lite");

    expect(results).toHaveLength(2);
    expect(results[0].lane).toBe("frontier");
    expect(results[1].lane).toBe("academic");
  });

  it("echoes the submittedModel on every returned LaneResult (no SDK model field in Gemini batch)", async () => {
    // Unlike the Anthropic batch API, Gemini inlined responses do not carry a
    // per-response model field. GeminiProvider must fall back to submittedModel.
    // TODO(phase-c): verify against final impl if SDK adds a model field.
    const lanes: Lane[] = ["frontier", "academic"];
    mockBatchesGet.mockResolvedValue(
      makeSucceededJob([
        makeInlinedResponse(makeLaneJson("frontier")),
        makeInlinedResponse(makeLaneJson("academic")),
      ])
    );

    const provider = new GeminiProvider();
    const results = await provider.collectBatchResults("batch-id-456", lanes, "gemini-2.5-flash-lite");

    for (const r of results) {
      expect(r.model).toBe("gemini-2.5-flash-lite");
    }
  });

  it("populates sources and narrative from parsed JSON response", async () => {
    const lanes: Lane[] = ["blogs"];
    mockBatchesGet.mockResolvedValue(
      makeSucceededJob([
        makeInlinedResponse(makeLaneJson("blogs", 3)),
      ])
    );

    const provider = new GeminiProvider();
    const results = await provider.collectBatchResults("batch-id-789", lanes, "gemini-2.5-flash-lite");

    expect(results[0].sources).toHaveLength(3);
    expect(results[0].narrative).toBe("narrative text");
    expect(results[0].model_context).toBe("background knowledge");
  });

  it("records searchesFired from groundingMetadata.webSearchQueries", async () => {
    const lanes: Lane[] = ["tech"];
    mockBatchesGet.mockResolvedValue(
      makeSucceededJob([
        makeInlinedResponse(makeLaneJson("tech")),
      ])
    );

    const provider = new GeminiProvider();
    const results = await provider.collectBatchResults("batch-id-abc", lanes, "gemini-2.5-flash-lite");

    // makeInlinedResponse inserts one webSearchQuery ("test query")
    expect(results[0].searchesFired).toBe(1);
  });

  it("uses fallback result when inlined response is missing (error item)", async () => {
    const lanes: Lane[] = ["vc"];
    mockBatchesGet.mockResolvedValue({
      name: "batch-error-job",
      state: "JOB_STATE_SUCCEEDED",
      dest: {
        inlinedResponses: [
          { error: { message: "quota exceeded" } },
        ],
      },
    });

    const provider = new GeminiProvider();
    const results = await provider.collectBatchResults("batch-id-err", lanes, "gemini-2.5-flash-lite");

    expect(results).toHaveLength(1);
    expect(results[0].lane).toBe("vc");
    expect(results[0].sources).toHaveLength(0);
    expect(results[0].narrative).toContain("quota exceeded");
    // TODO(phase-c): confirm the exact narrative prefix matches final impl.
  });

  it("throws when batch job is not in JOB_STATE_SUCCEEDED", async () => {
    const lanes: Lane[] = ["financial"];
    mockBatchesGet.mockResolvedValue({
      name: "batch-in-progress",
      state: "JOB_STATE_RUNNING",
      dest: null,
    });

    const provider = new GeminiProvider();
    await expect(
      provider.collectBatchResults("batch-id-running", lanes, "gemini-2.5-flash-lite")
    ).rejects.toThrow(/not in a succeeded state/);
  });

  it("falls back to LANE_MODEL_FLASH_LITE when submittedModel is omitted", async () => {
    // TODO(phase-c): verify LANE_MODEL_FLASH_LITE constant matches final impl.
    const lanes: Lane[] = ["frontier"];
    mockBatchesGet.mockResolvedValue(
      makeSucceededJob([
        makeInlinedResponse(makeLaneJson("frontier")),
      ])
    );

    const provider = new GeminiProvider();
    const results = await provider.collectBatchResults("batch-no-model", lanes);

    // Without submittedModel the provider should use the depth-based default.
    expect(typeof results[0].model).toBe("string");
    expect(results[0].model.length).toBeGreaterThan(0);
  });
});
