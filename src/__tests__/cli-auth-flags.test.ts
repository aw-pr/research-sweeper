import { describe, expect, it } from "vitest";
import { applyAuthFlag, parseAuthOverrides } from "../cli/auth-flags";

describe("parseAuthOverrides", () => {
  it("maps canonical values for all three providers", () => {
    expect(parseAuthOverrides(["--claude-auth", "api-key", "--gemini-auth", "gemini-oauth", "--openai-auth", "codex"])).toEqual({
      claudeAuth: "api_key",
      geminiAuth: "gemini_oauth",
      openaiAuth: "codex_cli",
    });
  });

  it("accepts the legacy claude aliases", () => {
    for (const alias of ["claude-oauth", "claude_oauth", "agent-sdk", "agent_sdk", "claude-cli", "claude_cli"]) {
      expect(parseAuthOverrides(["--claude-auth", alias])).toEqual({ claudeAuth: "claude_oauth" });
    }
  });

  it("accepts the gemini and openai aliases", () => {
    expect(parseAuthOverrides(["--gemini-auth", "oauth"])).toEqual({ geminiAuth: "gemini_oauth" });
    for (const alias of ["codex", "codex-cli", "codex_cli", "chatgpt"]) {
      expect(parseAuthOverrides(["--openai-auth", alias])).toEqual({ openaiAuth: "codex_cli" });
    }
  });

  it("ignores unrelated flags and returns empty overrides", () => {
    expect(parseAuthOverrides(["--re-synthesise", "some-folder", "--from-batch", "abc"])).toEqual({});
  });

  it("throws on an unrecognised value", () => {
    expect(() => parseAuthOverrides(["--claude-auth", "bogus"])).toThrow('--claude-auth expects "api-key" or "claude-oauth"');
    expect(() => parseAuthOverrides(["--openai-auth"])).toThrow('--openai-auth expects "api-key" or "codex"');
  });
});

describe("applyAuthFlag", () => {
  it("returns false for non-auth flags without touching overrides", () => {
    const overrides = {};
    expect(applyAuthFlag(overrides, "--depth", "deep")).toBe(false);
    expect(overrides).toEqual({});
  });
});
