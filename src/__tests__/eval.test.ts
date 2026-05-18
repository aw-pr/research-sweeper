import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";

// Mock fs.readFileSync and fs.existsSync
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof fs>("fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor(_opts: unknown) {}
    },
  };
});

import { evalSweep, computeOverall, EvalError } from "../eval";

const mockedReadFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;
const mockedExistsSync = fs.existsSync as unknown as ReturnType<typeof vi.fn>;

function mockJudgeResponse(text: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text }],
    usage,
  });
}

beforeEach(() => {
  mockedReadFileSync.mockReset();
  mockedExistsSync.mockReset();
  mockCreate.mockReset();
  mockedExistsSync.mockReturnValue(true);
  mockedReadFileSync.mockImplementation((p: string) => {
    if (typeof p === "string" && p.includes("summary")) return "# Summary content";
    if (typeof p === "string" && p.includes("sources")) return "# Sources content";
    return "";
  });
});

describe("computeOverall", () => {
  it("computes the mean rounded to 1dp", () => {
    expect(computeOverall({ coverage: 4, sourceQuality: 5, synthesis: 3, relevance: 4 })).toBe(4.0);
    expect(computeOverall({ coverage: 5, sourceQuality: 4, synthesis: 4, relevance: 4 })).toBe(4.3);
    expect(computeOverall({ coverage: 1, sourceQuality: 2, synthesis: 2, relevance: 1 })).toBe(1.5);
  });
});

describe("evalSweep", () => {
  it("parses a well-formed <json> response and computes overallScore as mean", async () => {
    const judge = `<json>
{
  "dimensions": { "coverage": 4, "sourceQuality": 5, "synthesis": 3, "relevance": 4 },
  "dimensionReasons": { "coverage": "c", "sourceQuality": "sq", "synthesis": "s", "relevance": "r" },
  "factualFlags": ["claim A unverified"],
  "judgeSummary": "Solid research overall."
}
</json>`;
    mockJudgeResponse(judge);

    const score = await evalSweep({
      summaryPath: "/fake/summary-foo.md",
      sourcesPath: "/fake/sources-foo.md",
      briefText: "Test brief",
      apiKey: "sk-test",
    });

    expect(score.overallScore).toBe(4.0);
    expect(score.dimensions.coverage).toBe(4);
    expect(score.dimensions.sourceQuality).toBe(5);
    expect(score.factualFlags).toEqual(["claim A unverified"]);
    expect(score.judgeSummary).toBe("Solid research overall.");
    expect(score.model).toBe("claude-haiku-4-5-20251001");
    expect(score.tokensUsed).toBe(150);
    expect(score.runId).toBe("foo");
  });

  it("strips markdown fences inside the <json> block", async () => {
    const judge = "<json>\n```json\n" + JSON.stringify({
      dimensions: { coverage: 3, sourceQuality: 3, synthesis: 3, relevance: 3 },
      dimensionReasons: { coverage: "", sourceQuality: "", synthesis: "", relevance: "" },
      factualFlags: [],
      judgeSummary: "Average.",
    }) + "\n```\n</json>";
    mockJudgeResponse(judge);

    const score = await evalSweep({
      summaryPath: "/fake/summary-bar.md",
      sourcesPath: "/fake/sources-bar.md",
      briefText: "Brief",
      apiKey: "sk-test",
    });
    expect(score.overallScore).toBe(3.0);
    expect(score.judgeSummary).toBe("Average.");
  });

  it("returns a partial score with parse error when JSON is malformed", async () => {
    mockJudgeResponse("<json>{not valid json,,,}</json>");

    const score = await evalSweep({
      summaryPath: "/fake/summary-baz.md",
      sourcesPath: "/fake/sources-baz.md",
      briefText: "Brief",
      apiKey: "sk-test",
    });
    expect(score.overallScore).toBe(0);
    expect(score.judgeSummary).toContain("parse error");
    expect(score.dimensions).toEqual({ coverage: 0, sourceQuality: 0, synthesis: 0, relevance: 0 });
  });

  it("throws EvalError with the path when the summary file is missing", async () => {
    mockedExistsSync.mockImplementation((p: string) => !String(p).includes("missing-summary"));
    await expect(
      evalSweep({
        summaryPath: "/fake/missing-summary.md",
        sourcesPath: "/fake/sources-x.md",
        briefText: "Brief",
        apiKey: "sk-test",
      })
    ).rejects.toThrow(/missing-summary\.md/);
  });

  it("rounds overallScore to 1dp from known dimension values", async () => {
    const judge = `<json>
{
  "dimensions": { "coverage": 5, "sourceQuality": 4, "synthesis": 4, "relevance": 4 },
  "dimensionReasons": { "coverage": "", "sourceQuality": "", "synthesis": "", "relevance": "" },
  "factualFlags": [],
  "judgeSummary": "ok"
}
</json>`;
    mockJudgeResponse(judge);

    const score = await evalSweep({
      summaryPath: "/fake/summary-r.md",
      sourcesPath: "/fake/sources-r.md",
      briefText: "Brief",
      apiKey: "sk-test",
    });
    // (5+4+4+4)/4 = 4.25 -> rounded to 1dp = 4.3
    expect(score.overallScore).toBe(4.3);
  });

  it("uses an explicit runId when provided", async () => {
    mockJudgeResponse(`<json>
{
  "dimensions": { "coverage": 3, "sourceQuality": 3, "synthesis": 3, "relevance": 3 },
  "dimensionReasons": { "coverage": "", "sourceQuality": "", "synthesis": "", "relevance": "" },
  "factualFlags": [],
  "judgeSummary": "ok"
}
</json>`);
    const score = await evalSweep({
      summaryPath: "/fake/summary-foo.md",
      sourcesPath: "/fake/sources-foo.md",
      briefText: "Brief",
      apiKey: "sk-test",
      runId: "custom-run-id",
    });
    expect(score.runId).toBe("custom-run-id");
  });
});

describe("EvalError", () => {
  it("is an Error subclass with the right name", () => {
    const e = new EvalError("boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("EvalError");
  });
});
