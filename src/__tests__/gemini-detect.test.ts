import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectGeminiAuthMode, hasGeminiOAuthToken } from "../auth/detect";

// Save and restore process.env around each test so mutations don't leak.
let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  // Start each test with both Gemini credentials absent.
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_ACCESS_TOKEN;
});

afterEach(() => {
  // Restore original env.
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

describe("hasGeminiOAuthToken", () => {
  it("returns false when GOOGLE_ACCESS_TOKEN is absent", () => {
    expect(hasGeminiOAuthToken()).toBe(false);
  });

  it("returns true when GOOGLE_ACCESS_TOKEN is set", () => {
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.fake-access-token";
    expect(hasGeminiOAuthToken()).toBe(true);
  });
});

describe("detectGeminiAuthMode", () => {
  it("returns api_key when only GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "AIza-fake-key";
    expect(detectGeminiAuthMode()).toBe("api_key");
  });

  it("returns gemini_oauth when only GOOGLE_ACCESS_TOKEN is set", () => {
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.fake-access-token";
    expect(detectGeminiAuthMode()).toBe("gemini_oauth");
  });

  it("respects explicit prefer=api_key when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "AIza-fake-key";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.fake-access-token";
    expect(detectGeminiAuthMode("api_key")).toBe("api_key");
  });

  it("respects explicit prefer=gemini_oauth when GOOGLE_ACCESS_TOKEN is set", () => {
    process.env.GEMINI_API_KEY = "AIza-fake-key";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.fake-access-token";
    expect(detectGeminiAuthMode("gemini_oauth")).toBe("gemini_oauth");
  });

  it("throws when prefer=api_key but GEMINI_API_KEY is absent", () => {
    expect(() => detectGeminiAuthMode("api_key")).toThrow(/GEMINI_API_KEY/);
  });

  it("throws when prefer=gemini_oauth but GOOGLE_ACCESS_TOKEN is absent", () => {
    expect(() => detectGeminiAuthMode("gemini_oauth")).toThrow(/GOOGLE_ACCESS_TOKEN/);
  });

  it("throws when BOTH credentials are set and no prefer is given (refuses to guess)", () => {
    process.env.GEMINI_API_KEY = "AIza-fake-key";
    process.env.GOOGLE_ACCESS_TOKEN = "ya29.fake-access-token";
    expect(() => detectGeminiAuthMode()).toThrow(/Refusing to guess/);
  });

  it("throws when neither credential is set", () => {
    expect(() => detectGeminiAuthMode()).toThrow(/Gemini auth not configured/);
  });
});
