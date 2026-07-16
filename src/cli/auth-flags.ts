// Single source of truth for the per-provider auth-route flags. Shared by the
// run-arg parser and the standalone override parser used by --re-synthesise,
// so alias lists and error text can't drift between the two.

import { SweepConfig } from "../types";

export type AuthOverrides = Pick<Partial<SweepConfig>, "claudeAuth" | "geminiAuth" | "openaiAuth">;

interface AuthFlagSpec {
  field: keyof AuthOverrides;
  expected: string;
  aliases: Record<string, string>;
}

const AUTH_FLAGS: Record<string, AuthFlagSpec> = {
  "--claude-auth": {
    field: "claudeAuth",
    expected: '"api-key" or "claude-oauth"',
    aliases: {
      "api-key": "api_key",
      api_key: "api_key",
      "claude-oauth": "claude_oauth",
      claude_oauth: "claude_oauth",
      "agent-sdk": "claude_oauth",
      agent_sdk: "claude_oauth",
      "claude-cli": "claude_oauth",
      claude_cli: "claude_oauth",
    },
  },
  "--gemini-auth": {
    field: "geminiAuth",
    expected: '"api-key" or "gemini-oauth"',
    aliases: {
      "api-key": "api_key",
      api_key: "api_key",
      "gemini-oauth": "gemini_oauth",
      gemini_oauth: "gemini_oauth",
      oauth: "gemini_oauth",
    },
  },
  "--openai-auth": {
    field: "openaiAuth",
    expected: '"api-key" or "codex"',
    aliases: {
      "api-key": "api_key",
      api_key: "api_key",
      codex: "codex_cli",
      "codex-cli": "codex_cli",
      codex_cli: "codex_cli",
      chatgpt: "codex_cli",
    },
  },
};

export const AUTH_FLAG_NAMES = Object.keys(AUTH_FLAGS);

// Applies one auth flag to the overrides object. Returns false when the flag
// is not an auth flag; throws on an unrecognised value.
export function applyAuthFlag(overrides: AuthOverrides, flag: string, raw: string | undefined): boolean {
  const spec = AUTH_FLAGS[flag];
  if (!spec) return false;
  const mode = raw !== undefined ? spec.aliases[raw] : undefined;
  if (!mode) throw new Error(`Error: ${flag} expects ${spec.expected}, got "${raw}"`);
  (overrides as Record<string, string>)[spec.field] = mode;
  return true;
}

export function parseAuthOverrides(args: string[]): AuthOverrides {
  const overrides: AuthOverrides = {};
  for (let i = 0; i < args.length; i++) {
    if (applyAuthFlag(overrides, args[i], args[i + 1])) i++;
  }
  return overrides;
}
