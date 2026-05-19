import { Provider, ProviderAdapter } from "../types";
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";

const providers: Record<Provider, ProviderAdapter> = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
};

export function getProvider(provider: Provider): ProviderAdapter {
  const adapter = providers[provider];
  if (!adapter) {
    throw new Error(`Error: unknown provider "${provider}". Valid providers: ${Object.keys(providers).join(", ")}.`);
  }
  return adapter;
}
