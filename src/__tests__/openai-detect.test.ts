import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// hasCodexChatGPTAuth() reads ~/.codex/auth.json from the real filesystem, so
// the suite mocks `fs` to make the codex_cli branch deterministic regardless
// of the host's Codex login state. ESM namespaces can't be spied, so we mock
// the module with a mutable flag toggled per test.
let codexPresent = false;

vi.mock("fs", () => ({
  existsSync: (_p: string) => codexPresent,
  readFileSync: (_p: string) =>
    JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "fake-chatgpt-token" } }),
}));

import { detectOpenAIAuthMode } from "../auth/detect";

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  delete process.env.OPENAI_API_KEY;
  codexPresent = false;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

describe("detectOpenAIAuthMode", () => {
  it("returns api_key when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-fake-key";
    expect(detectOpenAIAuthMode()).toBe("api_key");
  });

  it("returns codex_cli when only Codex ChatGPT auth is present", () => {
    codexPresent = true;
    expect(detectOpenAIAuthMode()).toBe("codex_cli");
  });

  it("respects explicit prefer=api_key when both routes are available", () => {
    process.env.OPENAI_API_KEY = "sk-fake-key";
    codexPresent = true;
    expect(detectOpenAIAuthMode("api_key")).toBe("api_key");
  });

  it("respects explicit prefer=codex_cli when both routes are available", () => {
    process.env.OPENAI_API_KEY = "sk-fake-key";
    codexPresent = true;
    expect(detectOpenAIAuthMode("codex_cli")).toBe("codex_cli");
  });

  it("throws when BOTH routes are present and no prefer is given (refuses to guess)", () => {
    process.env.OPENAI_API_KEY = "sk-fake-key";
    codexPresent = true;
    expect(() => detectOpenAIAuthMode()).toThrow(/Refusing to guess/);
  });

  it("throws when prefer=api_key but OPENAI_API_KEY is absent", () => {
    expect(() => detectOpenAIAuthMode("api_key")).toThrow(/OPENAI_API_KEY/);
  });

  it("throws when prefer=codex_cli but no Codex ChatGPT auth is found", () => {
    expect(() => detectOpenAIAuthMode("codex_cli")).toThrow(/Codex/);
  });

  it("throws when no OpenAI auth is configured (never silently bills)", () => {
    expect(() => detectOpenAIAuthMode()).toThrow(/OpenAI auth not configured/);
  });
});
