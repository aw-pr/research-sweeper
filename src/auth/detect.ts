import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type ClaudeAuthMode = "api_key" | "claude_oauth";
export type OpenAIAuthMode = "api_key" | "codex_cli";
export type GeminiAuthMode = "api_key" | "gemini_oauth";
export type AnyAuthMode = ClaudeAuthMode | OpenAIAuthMode | GeminiAuthMode;

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

  if (hasApiKey && hasOAuth) {
    throw new Error(
      "Error: both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are set and no --claude-auth route was given. " +
        "Refusing to guess (the API-key route bills credits). Pass --claude-auth api-key or --claude-auth claude-oauth, " +
        "or run via ./run-secure-sweep.sh / ./run-secure-command.sh which inject only the selected route's credential."
    );
  }
  if (hasApiKey) return "api_key";
  if (hasOAuth) return "claude_oauth";
  throw new Error("Error: Claude auth not configured. Provide ANTHROPIC_API_KEY via the secure helper, or generate a subscription token with `claude setup-token` and export CLAUDE_CODE_OAUTH_TOKEN.");
}

export function detectOpenAIAuthMode(prefer?: OpenAIAuthMode): OpenAIAuthMode {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  const hasCodex = hasCodexChatGPTAuth();

  if (prefer === "api_key") {
    if (!hasApiKey) throw new Error("Error: --openai-auth api-key requested but OPENAI_API_KEY is not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
    return "api_key";
  }
  if (prefer === "codex_cli") {
    if (!hasCodex) throw new Error("Error: --openai-auth codex requested but no Codex ChatGPT auth was found. Run `codex login` (chatgpt mode) so ~/.codex/auth.json holds a chatgpt access token.");
    return "codex_cli";
  }

  if (hasApiKey && hasCodex) {
    throw new Error(
      "Error: both OPENAI_API_KEY and Codex ChatGPT auth are present and no --openai-auth route was given. " +
        "Refusing to guess (the API-key route bills credits). Pass --openai-auth api-key or --openai-auth codex, " +
        "or run via ./run-secure-sweep.sh / ./run-secure-command.sh which inject only the selected route's credential."
    );
  }
  if (hasApiKey) return "api_key";
  if (hasCodex) return "codex_cli";
  throw new Error("Error: OpenAI auth not configured. Use the secure helper for OPENAI_API_KEY-backed runs, or login with Codex (chatgpt mode) for the Codex auth route.");
}

export function hasGeminiOAuthToken(): boolean {
  // The @google/genai SDK can authenticate with a Google OAuth access token
  // passed as a Bearer header instead of an API key. We detect the portable
  // env-var signal (GOOGLE_ACCESS_TOKEN); ADC-based refresh is a future add.
  return Boolean(process.env.GOOGLE_ACCESS_TOKEN);
}

export function detectGeminiAuthMode(prefer?: GeminiAuthMode): GeminiAuthMode {
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOAuth = hasGeminiOAuthToken();

  if (prefer === "api_key") {
    if (!hasApiKey) throw new Error("Error: --gemini-auth api-key requested but GEMINI_API_KEY is not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
    return "api_key";
  }
  if (prefer === "gemini_oauth") {
    if (!hasOAuth) throw new Error("Error: --gemini-auth gemini-oauth requested but GOOGLE_ACCESS_TOKEN is not set. Mint a token (e.g. `gcloud auth print-access-token`) for a GCP project with the Generative Language API enabled and billing attached, then export GOOGLE_ACCESS_TOKEN.");
    return "gemini_oauth";
  }

  if (hasApiKey && hasOAuth) {
    throw new Error(
      "Error: both GEMINI_API_KEY and GOOGLE_ACCESS_TOKEN are set and no --gemini-auth route was given. " +
        "Refusing to guess (the API-key route bills credits). Pass --gemini-auth api-key or --gemini-auth gemini-oauth, " +
        "or run via ./run-secure-sweep.sh / ./run-secure-command.sh which inject only the selected route's credential."
    );
  }
  if (hasApiKey) return "api_key";
  if (hasOAuth) return "gemini_oauth";
  throw new Error("Error: Gemini auth not configured. Provide GEMINI_API_KEY via the secure helper, or export GOOGLE_ACCESS_TOKEN for a billing-attached GCP project for the OAuth route.");
}

export function requireApiKeyModeOrThrow(provider: "claude" | "openai" | "gemini", authMode: AnyAuthMode): void {
  if (authMode === "api_key") return;
  throw new Error(`${provider} batch mode requires API-key auth; ${authMode} supports synchronous sweeps only.`);
}
