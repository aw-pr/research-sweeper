import { describe, expect, it } from "vitest";
import { usesSyncOnlyAuth, withBatchApiKeyAuth } from "../cli/synthesis";
import { SweepConfig } from "../types";

const baseConfig: SweepConfig = {
  provider: "openai",
  topic: "Agentic harnesses from July 2025-July 2026",
  fromYear: 2025,
  toYear: 2026,
  lanes: ["frontier"],
  depth: "standard",
  outputDir: "/tmp/research-sweep-test",
  test: false,
  overwrite: false,
};

describe("synthesis auth routing", () => {
  it("treats subscription and OAuth routes as sync-only for synthesis", () => {
    expect(usesSyncOnlyAuth({ ...baseConfig, openaiAuth: "codex_cli" })).toBe(true);
    expect(usesSyncOnlyAuth({ ...baseConfig, provider: "claude", claudeAuth: "claude_oauth" })).toBe(true);
    expect(usesSyncOnlyAuth({ ...baseConfig, provider: "gemini", geminiAuth: "gemini_oauth" })).toBe(true);
    expect(usesSyncOnlyAuth({ ...baseConfig, openaiAuth: "api_key" })).toBe(false);
  });

  it("forces batch collection back to the provider API-key route", () => {
    expect(withBatchApiKeyAuth({ ...baseConfig, openaiAuth: "codex_cli" }, "openai").openaiAuth).toBe("api_key");
    expect(withBatchApiKeyAuth({ ...baseConfig, provider: "claude", claudeAuth: "claude_oauth" }, "claude").claudeAuth).toBe("api_key");
    expect(withBatchApiKeyAuth({ ...baseConfig, provider: "gemini", geminiAuth: "gemini_oauth" }, "gemini").geminiAuth).toBe("api_key");
  });
});
