import type { ModelReasoningEffort } from "@openai/codex-sdk";

const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("@openai/codex-sdk")>;
let codexSdk: Promise<typeof import("@openai/codex-sdk")> | undefined;

const reasoningEfforts = new Set<ModelReasoningEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "persistent",
]);

function loadCodexSdk(): Promise<typeof import("@openai/codex-sdk")> {
  codexSdk ??= dynamicImport("@openai/codex-sdk");
  return codexSdk;
}

export function codexChildEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key !== "OPENAI_API_KEY" && key !== "CODEX_API_KEY" && value !== undefined) childEnv[key] = value;
  }
  return childEnv;
}

export async function runCodexTurn(opts: {
  prompt: string;
  model: string;
  reasoningEffort: string;
  useSearch: boolean;
  outputSchema?: object;
  sandbox?: "read-only";
}): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  if (!reasoningEfforts.has(opts.reasoningEffort as ModelReasoningEffort)) {
    throw new Error(`Invalid reasoning effort "${opts.reasoningEffort}"; expected one of ${[...reasoningEfforts].join(", ")}.`);
  }

  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_API_KEY;
  const { Codex } = await loadCodexSdk();
  const codex = new Codex({ env: codexChildEnv(process.env) });
  const thread = codex.startThread({
    model: opts.model,
    sandboxMode: opts.sandbox ?? "read-only",
    skipGitRepoCheck: true,
    modelReasoningEffort: opts.reasoningEffort as ModelReasoningEffort,
    webSearchEnabled: opts.useSearch,
  });
  const turn = await thread.run(opts.prompt, opts.outputSchema === undefined ? undefined : { outputSchema: opts.outputSchema });

  return {
    text: turn.finalResponse,
    tokensIn: turn.usage?.input_tokens ?? 0,
    tokensOut: turn.usage?.output_tokens ?? 0,
  };
}
