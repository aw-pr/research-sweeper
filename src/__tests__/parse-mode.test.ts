import { describe, expect, it } from "vitest";
import { fallbackLaneResult, parseLaneResponse } from "../parsing";
import { LANE_CONFIG } from "../config";

const CLEAN = JSON.stringify({
  narrative: "All good.",
  model_context: "Background.",
  sources: [{ title: "T", significance: "S", url: "https://example.com", date: "2025", outlet: "O" }],
});

describe("parseLaneResponse parseMode", () => {
  it("reports clean for a well-formed response", () => {
    expect(parseLaneResponse(CLEAN)?.parseMode).toBe("clean");
  });

  it("reports clean for a fenced but otherwise well-formed response", () => {
    expect(parseLaneResponse("```json\n" + CLEAN + "\n```")?.parseMode).toBe("clean");
  });

  it("reports repaired when control chars needed escaping", () => {
    const withControlChar = '{"narrative": "line one\nline two", "sources": []}';
    const result = parseLaneResponse(withControlChar);
    expect(result?.parseMode).toBe("repaired");
    expect(result?.narrative).toContain("line one");
  });

  it("reports repaired for XML-string sources", () => {
    const xmlSources = JSON.stringify({
      narrative: "n",
      sources: "<item><title>T</title><significance>S</significance></item>",
    });
    const result = parseLaneResponse(xmlSources);
    expect(result?.parseMode).toBe("repaired");
    expect(result?.sources).toHaveLength(1);
  });

  it("reports repaired for narrative key drift", () => {
    const drifted = JSON.stringify({ research_summary: "A narrative that drifted to another key entirely.", sources: [] });
    expect(parseLaneResponse(drifted)?.parseMode).toBe("repaired");
  });

  it("reports salvaged when only the sources array is recoverable", () => {
    const broken = '{"narrative": "an "unescaped" quote breaks this", "sources": [{"title": "T", "significance": "S"}]}';
    const result = parseLaneResponse(broken);
    expect(result?.parseMode).toBe("salvaged");
    expect(result?.sources).toHaveLength(1);
  });

  it("fallbackLaneResult records fallback", () => {
    const result = fallbackLaneResult("blogs", LANE_CONFIG.blogs, "not json at all", 0, 0, "m");
    expect(result.parseMode).toBe("fallback");
  });
});
