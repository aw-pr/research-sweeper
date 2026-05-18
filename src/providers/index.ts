import { Provider, ProviderAdapter } from "../types";
import { ClaudeProvider } from "./claude";
import { OpenAIProvider } from "./openai";

const providers: Record<Provider, ProviderAdapter> = {
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
};

export function getProvider(provider: Provider): ProviderAdapter {
  return providers[provider];
}
