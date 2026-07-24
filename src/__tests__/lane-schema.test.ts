import { describe, expect, it } from "vitest";
import { parseLaneResponse } from "../parsing";
import {
  CLAUDE_LANE_TOOL,
  CLAUDE_LANE_TOOL_NAME,
  claudeLaneToolConfig,
  countClaudeSearches,
  extractClaudeLaneRaw,
  harvestClaudeSearchSources,
  LANE_RESPONSE_SCHEMA,
  mergeLaneSources,
  OPENAI_LANE_TEXT_FORMAT,
} from "../lane-schema";
import { SourceItem } from "../types";

describe("lane response schema", () => {
  it("is strict-mode compliant: additionalProperties false and every property required", () => {
    expect(OPENAI_LANE_TEXT_FORMAT.format.strict).toBe(true);
    const obj = LANE_RESPONSE_SCHEMA;
    expect(obj.additionalProperties).toBe(false);
    expect([...obj.required].sort()).toEqual(Object.keys(obj.properties).sort());
    const item = obj.properties.sources.items;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
  });

  it("is shared by the Claude strict tool", () => {
    expect(CLAUDE_LANE_TOOL.strict).toBe(true);
    expect(CLAUDE_LANE_TOOL.input_schema).toBe(LANE_RESPONSE_SCHEMA);
  });
});

describe("claudeLaneToolConfig", () => {
  it("offers web_search + submit tool and forces tool use when searching", () => {
    const { tools, tool_choice } = claudeLaneToolConfig(false);
    expect(tool_choice).toEqual({ type: "any" });
    const names = (tools as Array<{ name?: string }>).map((t) => t.name);
    expect(names).toContain("web_search");
    expect(names).toContain(CLAUDE_LANE_TOOL_NAME);
  });

  it("forces the submit tool directly when search is disabled", () => {
    const { tools, tool_choice } = claudeLaneToolConfig(true);
    expect(tool_choice).toEqual({ type: "tool", name: CLAUDE_LANE_TOOL_NAME });
    expect(tools).toHaveLength(1);
  });
});

describe("extractClaudeLaneRaw", () => {
  it("returns the submit tool input as JSON, round-trippable through the parser", () => {
    const content = [
      { type: "server_tool_use", name: "web_search", input: { query: "x" } },
      { type: "tool_use", name: CLAUDE_LANE_TOOL_NAME, input: { narrative: "A solid lane narrative.", sources: [{ title: "T", significance: "S", url: "https://e.com" }] } },
    ];
    const raw = extractClaudeLaneRaw(content);
    const parsed = parseLaneResponse(raw);
    expect(parsed!.narrative).toBe("A solid lane narrative.");
    expect(parsed!.sources).toEqual([{ title: "T", significance: "S", url: "https://e.com", date: undefined, outlet: undefined }]);
  });

  it("falls back to text blocks when the submit tool was not called", () => {
    const content = [{ type: "text", text: '{"narrative":"n","sources":[]}' }];
    expect(extractClaudeLaneRaw(content)).toBe('{"narrative":"n","sources":[]}');
  });
});

describe("countClaudeSearches", () => {
  it("counts web searches but excludes the submit tool call", () => {
    const content = [
      { type: "server_tool_use", name: "web_search" },
      { type: "server_tool_use", name: "web_search" },
      { type: "tool_use", name: CLAUDE_LANE_TOOL_NAME },
      { type: "text", text: "noise" },
    ];
    expect(countClaudeSearches(content)).toBe(2);
  });
});

describe("harvestClaudeSearchSources", () => {
  const wr = (results: Array<Record<string, unknown>>) => ({ type: "web_search_tool_result", content: results });
  const result = (url: string, title = "T", page_age?: string) => ({ type: "web_search_result", url, title, page_age });

  it("extracts sources from web_search_tool_result blocks with outlet + date", () => {
    const content = [
      wr([result("https://www.example.com/a", "Report A", "May 1, 2025")]),
      { type: "tool_use", name: CLAUDE_LANE_TOOL_NAME, input: { narrative: "n", sources: [] } },
    ];
    const sources = harvestClaudeSearchSources(content);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ title: "Report A", url: "https://www.example.com/a", date: "May 1, 2025", outlet: "example.com" });
    expect(sources[0].significance).toBeTruthy();
  });

  it("dedupes across blocks by normalised URL (fragment and trailing slash ignored)", () => {
    const content = [
      wr([result("https://x.com/p"), result("https://x.com/p/#top")]),
      wr([result("https://x.com/p/"), result("https://y.com/q")]),
    ];
    const urls = harvestClaudeSearchSources(content).map((s) => s.url);
    expect(urls).toEqual(["https://x.com/p", "https://y.com/q"]);
  });

  it("skips non-result items and results without a URL", () => {
    const content = [wr([{ type: "web_search_result", title: "no url" }, result("https://z.com/r")])];
    expect(harvestClaudeSearchSources(content).map((s) => s.url)).toEqual(["https://z.com/r"]);
  });

  it("returns nothing when there are no search-result blocks", () => {
    expect(harvestClaudeSearchSources([{ type: "text", text: "x" }])).toEqual([]);
  });
});

describe("mergeLaneSources", () => {
  const model: SourceItem = { title: "Model", url: "https://a.com/x", significance: "annotated by model" };
  const harvested: SourceItem = { title: "Harvest", url: "https://a.com/x/", significance: "from search" };

  it("keeps the model entry (its annotation) when a harvested URL duplicates it", () => {
    const merged = mergeLaneSources([model], [harvested]);
    expect(merged).toHaveLength(1);
    expect(merged[0].significance).toBe("annotated by model");
  });

  it("appends harvested sources not already present, model first", () => {
    const extra: SourceItem = { title: "Extra", url: "https://b.com/y", significance: "from search" };
    const merged = mergeLaneSources([model], [harvested, extra]);
    expect(merged.map((s) => s.url)).toEqual(["https://a.com/x", "https://b.com/y"]);
  });

  it("recovers sources when the model returned an empty array", () => {
    const merged = mergeLaneSources([], [harvested]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Harvest");
  });
});
