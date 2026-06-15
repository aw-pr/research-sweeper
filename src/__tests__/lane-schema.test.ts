import { describe, expect, it } from "vitest";
import { parseLaneResponse } from "../parsing";
import {
  CLAUDE_LANE_TOOL_NAME,
  claudeLaneToolConfig,
  countClaudeSearches,
  extractClaudeLaneRaw,
  OPENAI_LANE_SCHEMA,
  OPENAI_LANE_TEXT_FORMAT,
} from "../lane-schema";

describe("OpenAI lane schema", () => {
  it("is strict-mode compliant: additionalProperties false and every property required", () => {
    expect(OPENAI_LANE_TEXT_FORMAT.format.strict).toBe(true);
    const obj = OPENAI_LANE_SCHEMA;
    expect(obj.additionalProperties).toBe(false);
    expect([...obj.required].sort()).toEqual(Object.keys(obj.properties).sort());
    const item = obj.properties.sources.items;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
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
