import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type ClaudeAuthMode = "api_key" | "claude_oauth";
export type OpenAIAuthMode = "api_key" | "codex_cli";
export type AnyAuthMode = ClaudeAuthMode | OpenAIAuthMode;

export const CODEX_AUTH_FILE = path.join(os.homedir(), ".codex", "auth.json");

export function hasClaudeOAuthToken(): boolean {
  // The Agent SDK reads CLAUDE_CODE_OAUTH_TOKEN from env. On macOS the `claude`
  // CLI stores credentials in the keychain rather than a flat file, so the env
  // var is the portable signal we can detect without reading secrets.
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

export function hasCodexChatGPTAuth(): boolean {
  try {
    if (!fs.existsSync(CODEX_AUTH_FILE)) return false;
    const raw = fs.readFileSync(CODEX_AUTH_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { auth_mode?: unknown; tokens?: { access_token?: unknown } };
    return parsed.auth_mode === "chatgpt" && typeof parsed.tokens?.access_token === "string" && parsed.tokens.access_token.length > 0;
  } catch {
    return false;
  }
}

export function detectClaudeAuthMode(prefer?: ClaudeAuthMode): ClaudeAuthMode {
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOAuth = hasClaudeOAuthToken();

  if (prefer === "api_key") {
    if (!hasApiKey) throw new Error("Error: --claude-auth api-key requested but ANTHROPIC_API_KEY is not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
    return "api_key";
  }
  if (prefer === "claude_oauth") {
    if (!hasOAuth) throw new Error("Error: --claude-auth claude-oauth requested but CLAUDE_CODE_OAUTH_TOKEN is not set. Generate one with `claude setup-token` and export it into the shell before running.");
    return "claude_oauth";
  }

  if (hasApiKey) return "api_key";
  if (hasOAuth) return "claude_oauth";
  throw new Error("Error: Claude auth not configured. Provide ANTHROPIC_API_KEY via the secure helper, or generate a subscription token with `claude setup-token` and export CLAUDE_CODE_OAUTH_TOKEN.");
}

export function detectOpenAIAuthMode(): OpenAIAuthMode {
  if (process.env.OPENAI_API_KEY) return "api_key";
  if (hasCodexChatGPTAuth()) return "codex_cli";
  throw new Error("Error: OpenAI auth not configured. Use the secure helper for OPENAI_API_KEY-backed runs, or login with Codex (chatgpt mode) for the Codex auth route.");
}

export function requireApiKeyModeOrThrow(provider: "claude" | "openai", authMode: AnyAuthMode): void {
  if (authMode === "api_key") return;
  throw new Error(`${provider} batch mode requires API-key auth; ${authMode} supports synchronous sweeps only.`);
}
