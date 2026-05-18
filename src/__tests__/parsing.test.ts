import { describe, it, expect } from "vitest";
import { extractText, parseLaneResponse, fallbackLaneResult } from "../parsing";
import type { LaneDefinition } from "../types";

describe("extractText", () => {
  it("concatenates text blocks joined by newlines", () => {
    const blocks = [
      { type: "text", text: "alpha" },
      { type: "tool_use", text: "ignored" },
      { type: "text", text: "beta" },
    ];
    expect(extractText(blocks)).toBe("alpha\nbeta");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("ignores blocks without text property", () => {
    const blocks = [{ type: "text" }, { type: "text", text: "kept" }];
    expect(extractText(blocks as any)).toBe("kept");
  });
});

describe("parseLaneResponse", () => {
  it("parses a valid JSON-embedded lane response", () => {
    const raw = `prelude noise {"sources":[{"title":"Paper A","significance":"matters","url":"https://x","date":"2024-01-01","outlet":"arXiv"}],"narrative":"a summary","model_context":"bg"} trailing`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].title).toBe("Paper A");
    expect(result!.sources[0].outlet).toBe("arXiv");
    expect(result!.narrative).toBe("a summary");
    expect(result!.model_context).toBe("bg");
  });

  it("returns null for empty input", () => {
    expect(parseLaneResponse("")).toBeNull();
  });

  it("returns null when no JSON object is present", () => {
    expect(parseLaneResponse("just prose, no braces here")).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    expect(parseLaneResponse("{ not valid json")).toBeNull();
  });

  it("drops source items missing required fields", () => {
    const raw = `{"sources":[{"title":"keep","significance":"yes"},{"title":"drop"},"string-item"],"narrative":"n"}`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].title).toBe("keep");
  });

  it("returns empty sources / empty narrative when fields are missing entirely", () => {
    const result = parseLaneResponse(`{"foo":"bar"}`);
    expect(result).not.toBeNull();
    expect(result!.sources).toEqual([]);
    expect(result!.narrative).toBe("");
    expect(result!.model_context).toBeUndefined();
  });
});

describe("fallbackLaneResult", () => {
  const definition: LaneDefinition = {
    label: "Frontier",
    outlets: [],
    searchFocus: "f",
    systemPrompt: "p",
  };

  it("packages raw text + counts into a LaneResult", () => {
    const result = fallbackLaneResult("frontier", definition, "raw body", 12, 34, "claude-haiku-4-5-20251001");
    expect(result.lane).toBe("frontier");
    expect(result.label).toBe("Frontier");
    expect(result.sources).toEqual([]);
    expect(result.narrative).toBe("raw body");
    expect(result.rawText).toBe("raw body");
    expect(result.tokensIn).toBe(12);
    expect(result.tokensOut).toBe(34);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("defaults model to empty string", () => {
    const result = fallbackLaneResult("blogs", definition, "", 0, 0);
    expect(result.model).toBe("");
    expect(result.narrative).toBe("");
  });
});
