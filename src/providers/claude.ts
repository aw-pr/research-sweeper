import Anthropic from "@anthropic-ai/sdk";
import { ClaudeAuthMode, detectClaudeAuthMode, requireApiKeyModeOrThrow } from "../auth/detect";
import { DEPTH_CONFIG, LANE_CONFIG } from "../config";
import { fallbackLaneResult, parseLaneResponse } from "../parsing";
import { buildLanePrompt, buildSynthesisPrompt, SHARED_LANE_SCAFFOLDING } from "../prompts";
import { BatchStatus, Lane, LaneResult, ProviderAdapter, ProviderModels, SweepConfig, UsageCounts } from "../types";

const LANE_MODEL_HAIKU = "claude-haiku-4-5-20251001";
const LANE_MODEL_SONNET = "claude-sonnet-4-6";
// Synthesis is a single reasoning-dominated call per sweep, so it runs a tier
// above the lanes. Default is Fable 5; override with SYNTHESIS_MODEL (read
// lazily so .env.local, loaded in main() after import, still applies) to dial
// it back without a code change. The high-volume lanes are unaffected.
const SYNTHESIS_MODEL = "claude-fable-5";

// Tool allow/deny lists for the Agent SDK OAuth route. Lanes run with
// only WebSearch available; synthesis runs with no tools at all. Everything
// filesystem-adjacent is explicitly denied so model drift can't touch disk.
const LANE_ALLOWED_TOOLS = ["WebSearch"];
const SYNTH_ALLOWED_TOOLS: string[] = [];
const CLI_DISALLOWED_TOOLS = [
  "Read", "Write", "Edit", "MultiEdit", "Bash", "BashOutput", "KillShell",
  "Glob", "Grep", "NotebookEdit", "TodoWrite", "Task", "SlashCommand",
  "WebFetch", "ListMcpResources",
];

// ESM-only dynamic import bridge — the Agent SDK ships as ESM, the repo is
// CommonJS. `new Function` keeps the import opaque to TS's commonjs emitter so
// it resolves as a real ESM dynamic import at runtime.
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<{ query: ClaudeAgentQuery }>;

type ClaudeAgentQuery = (args: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<ClaudeSdkMessage>;

type ClaudeSdkMessage =
  | { type: "assistant"; message: { content: Array<{ type: string; text?: string }> } }
  | { type: "result"; subtype: string; usage?: { input_tokens?: number; output_tokens?: number }; total_cost_usd?: number; is_error?: boolean; message?: string }
  | { type: string; [key: string]: unknown };

function resolveLaneModel(config: SweepConfig): string {
  if (config.laneModel === "sonnet") return LANE_MODEL_SONNET;
  if (config.laneModel === "haiku") return LANE_MODEL_HAIKU;
  return config.depth === "deep" ? LANE_MODEL_SONNET : LANE_MODEL_HAIKU;
}

function usageCounts(input: { processing?: number; succeeded?: number; errored?: number }): UsageCounts {
  return { processing: input.processing || 0, succeeded: input.succeeded || 0, errored: input.errored || 0 };
}

export class ClaudeProvider implements ProviderAdapter {
  readonly provider = "claude" as const;
  private client: Anthropic | null = null;
  private authMode: ClaudeAuthMode | null = null;
  private queryFn: ClaudeAgentQuery | null = null;

  requireApiKey(config?: SweepConfig): string {
    const mode = config ? this.resolveAuthMode(config) : this.authMode ?? (process.env.ANTHROPIC_API_KEY ? "api_key" : null);
    if (mode === "claude_oauth") return "claude-oauth-auth";
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Error: ANTHROPIC_API_KEY not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
    return apiKey;
  }

  getAuthMode(): ClaudeAuthMode | null {
    return this.authMode;
  }

  private resolveAuthMode(config: SweepConfig): ClaudeAuthMode {
    if (this.authMode) return this.authMode;
    this.authMode = detectClaudeAuthMode(config.claudeAuth);
    if (this.authMode === "claude_oauth") {
      delete process.env.ANTHROPIC_API_KEY;
    }
    return this.authMode;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Error: ANTHROPIC_API_KEY not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
      this.client = new Anthropic({
        apiKey,
        defaultHeaders: {
          "anthropic-beta": "token-efficient-tools-2025-02-19,prompt-caching-2024-07-31",
        },
      });
    }
    return this.client;
  }

  private async getQueryFn(): Promise<ClaudeAgentQuery> {
    if (this.queryFn) return this.queryFn;
    const mod = await dynamicImport("@anthropic-ai/claude-agent-sdk");
    this.queryFn = mod.query;
    return this.queryFn;
  }

  getModels(config: SweepConfig, mode: "sync" | "batch"): ProviderModels {
    return {
      lane: config.test ? LANE_MODEL_HAIKU : resolveLaneModel(config),
      synthesis: config.test ? LANE_MODEL_HAIKU : config.synthesisModel || process.env.SYNTHESIS_MODEL || SYNTHESIS_MODEL,
    };
  }

  async runLane(config: SweepConfig, lane: Lane): Promise<LaneResult> {
    const mode = this.resolveAuthMode(config);
    return mode === "api_key" ? this.runLaneViaApi(config, lane) : this.runLaneViaClaudeOAuth(config, lane);
  }

  async runSynthesis(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    const mode = this.resolveAuthMode(config);
    return mode === "api_key"
      ? this.runSynthesisViaApi(config, laneResults, sourcesName)
      : this.runSynthesisViaClaudeOAuth(config, laneResults, sourcesName);
  }

  private async runLaneViaApi(config: SweepConfig, lane: Lane): Promise<LaneResult> {
    const client = this.getClient();
    const definition = LANE_CONFIG[lane];
    console.log(`  [${definition.label}] Starting sweep...`);

    const model = config.test ? LANE_MODEL_HAIKU : resolveLaneModel(config);

    try {
      const requestParams: Record<string, unknown> = {
        model,
        max_tokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
        // Two-block system array: the shared scaffolding clears 1024 tokens
        // (Sonnet/Opus minimum) and is the real cache target across all six
        // lanes of the sweep. The lane systemPrompt is a small per-lane
        // addendum and gets its own ephemeral marker as a second cacheable
        // block (useful when the same lane runs back-to-back).
        system: [
          { type: "text", text: SHARED_LANE_SCAFFOLDING, cache_control: { type: "ephemeral" } },
          { type: "text", text: definition.systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: buildLanePrompt(lane, config) }],
      };

      if (!config.noSearch) {
        requestParams.tools = [{ type: "web_search_20250305", name: "web_search" }];
        requestParams.tool_choice = { type: "any" };
      }

      const response = await (client.messages.create as unknown as (params: Record<string, unknown>) => Promise<Anthropic.Message>)(requestParams);

      const searchesFired = (response.content as Array<{ type: string }>).filter((block) => block.type === "server_tool_use" || block.type === "tool_use").length;
      const rawText = response.content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
      const parsed = parseLaneResponse(rawText);
      const tokensIn = response.usage.input_tokens;
      const tokensOut = response.usage.output_tokens;
      const usageExt = response.usage as unknown as { cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
      const cacheCreateIn = usageExt.cache_creation_input_tokens || 0;
      const cacheReadIn = usageExt.cache_read_input_tokens || 0;

      if (!parsed) {
        console.warn(`  [${definition.label}] Warning: could not parse JSON response, using fallback`);
        return { ...fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, model), cacheCreateIn, cacheReadIn };
      }

      const searchLabel = config.noSearch ? "no search" : `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      const cacheLabel = cacheCreateIn || cacheReadIn ? `, cache ${cacheCreateIn.toLocaleString()} w / ${cacheReadIn.toLocaleString()} r` : "";
      console.log(`  [${definition.label}] Complete — ${parsed.sources.length} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out${cacheLabel})`);
      return { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, model_context: parsed.model_context, rawText, tokensIn, tokensOut, cacheCreateIn, cacheReadIn, model, searchesFired };
    } catch (error) {
      console.error(`  [${definition.label}] Error:`, error);
      return { lane, label: definition.label, sources: [], narrative: `Error during sweep: ${error}`, rawText: "", tokensIn: 0, tokensOut: 0, model };
    }
  }

  private async runLaneViaClaudeOAuth(config: SweepConfig, lane: Lane): Promise<LaneResult> {
    const definition = LANE_CONFIG[lane];
    const model = config.test ? LANE_MODEL_HAIKU : resolveLaneModel(config);
    console.log(`  [${definition.label}] Starting sweep (claude-oauth)...`);

    try {
      const query = await this.getQueryFn();
      const iter = query({
        prompt: buildLanePrompt(lane, config),
        options: {
          model,
          // Agent SDK accepts a single systemPrompt string. Concatenate the
          // shared scaffolding with the lane-specific block so the SDK can
          // still apply its internal caching if available. Explicit
          // cache_control blocks are not exposed by the Agent SDK's options
          // surface, so we rely on the SDK's own caching here.
          systemPrompt: `${SHARED_LANE_SCAFFOLDING}\n\n${definition.systemPrompt}`,
          allowedTools: config.noSearch ? [] : LANE_ALLOWED_TOOLS,
          disallowedTools: CLI_DISALLOWED_TOOLS,
          permissionMode: "bypassPermissions",
          maxTurns: DEPTH_CONFIG[config.depth].searchRounds + 3,
          settingSources: [],
        },
      });

      const { rawText, tokensIn, tokensOut, searchesFired, error } = await consumeClaudeSdkStream(iter);
      if (error) throw new Error(error);

      const parsed = parseLaneResponse(rawText);
      if (!parsed) {
        console.warn(`  [${definition.label}] Warning: could not parse JSON response, using fallback`);
        return { ...fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, model), searchesFired };
      }

      const searchLabel = config.noSearch ? "no search" : `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      console.log(`  [${definition.label}] Complete — ${parsed.sources.length} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out)`);
      return { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, model_context: parsed.model_context, rawText, tokensIn, tokensOut, model, searchesFired };
    } catch (error) {
      console.error(`  [${definition.label}] Error:`, error);
      return { lane, label: definition.label, sources: [], narrative: `Error during sweep: ${error}`, rawText: "", tokensIn: 0, tokensOut: 0, model };
    }
  }

  private async runSynthesisViaApi(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    const client = this.getClient();
    console.log("\n  [Synthesis] Assembling research brief...");
    const response = await client.messages.create({
      model: this.getModels(config, "sync").synthesis,
      max_tokens: DEPTH_CONFIG[config.depth].synthesisMaxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildSynthesisPrompt(config, laneResults, sourcesName), cache_control: { type: "ephemeral" } },
          ],
        },
      ],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    const markdown = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    console.log(`  [Synthesis] Complete (${response.usage.input_tokens.toLocaleString()} in / ${response.usage.output_tokens.toLocaleString()} out)`);
    return { markdown, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens };
  }

  private async runSynthesisViaClaudeOAuth(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    console.log("\n  [Synthesis] Assembling research brief (claude-oauth)...");
    const query = await this.getQueryFn();
    const model = this.getModels(config, "sync").synthesis;
    const iter = query({
      prompt: buildSynthesisPrompt(config, laneResults, sourcesName),
      options: {
        model,
        allowedTools: SYNTH_ALLOWED_TOOLS,
        disallowedTools: [...CLI_DISALLOWED_TOOLS, "WebSearch"],
        permissionMode: "bypassPermissions",
        maxTurns: 1,
        settingSources: [],
      },
    });

    const { rawText, tokensIn, tokensOut, error } = await consumeClaudeSdkStream(iter);
    if (error) throw new Error(`Synthesis failed: ${error}`);
    console.log(`  [Synthesis] Complete (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out)`);
    return { markdown: rawText, tokensIn, tokensOut };
  }

  async submitBatchLanes(config: SweepConfig): Promise<string> {
    requireApiKeyModeOrThrow("claude", this.resolveAuthMode(config));
    const client = this.getClient();
    const requests = config.lanes.map((lane) => {
      const params: Record<string, unknown> = {
        model: config.test ? LANE_MODEL_HAIKU : resolveLaneModel(config),
        max_tokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
        system: [
          { type: "text", text: SHARED_LANE_SCAFFOLDING, cache_control: { type: "ephemeral" } },
          { type: "text", text: LANE_CONFIG[lane].systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: buildLanePrompt(lane, config) }],
      };
      if (!config.noSearch) {
        params.tools = [{ type: "web_search_20250305", name: "web_search" }];
        params.tool_choice = { type: "any" };
      }
      return { custom_id: lane, params };
    });
    const batch = await (client.messages.batches as any).create({ requests });
    return batch.id as string;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    // Batch status is API-only — if the provider was constructed in claude_oauth
    // mode, guard here; otherwise read via the SDK client.
    if (this.authMode === "claude_oauth") {
      requireApiKeyModeOrThrow("claude", this.authMode);
    }
    const client = this.getClient();
    const batch = await (client.messages.batches as any).retrieve(batchId);
    return { id: batchId, status: batch.processing_status as string, counts: usageCounts(batch.request_counts) };
  }

  async submitBatchSynthesis(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<string> {
    requireApiKeyModeOrThrow("claude", this.resolveAuthMode(config));
    const client = this.getClient();
    const model = this.getModels(config, "batch").synthesis;
    const requests = [
      {
        custom_id: "synthesis",
        params: {
          model,
          max_tokens: DEPTH_CONFIG[config.depth].synthesisMaxTokens,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildSynthesisPrompt(config, laneResults, sourcesName), cache_control: { type: "ephemeral" } },
              ],
            },
          ],
        },
      },
    ];
    const batch = await (client.messages.batches as any).create({ requests });
    return batch.id as string;
  }

  async collectBatchSynthesisResult(batchId: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    if (this.authMode === "claude_oauth") {
      requireApiKeyModeOrThrow("claude", this.authMode);
    }
    const client = this.getClient();
    for await (const item of await (client.messages.batches as any).results(batchId)) {
      if (item.custom_id === "synthesis" && item.result.type === "succeeded") {
        const message = item.result.message;
        const markdown = message.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
        return { markdown, tokensIn: message.usage.input_tokens, tokensOut: message.usage.output_tokens };
      }
    }
    throw new Error("Synthesis batch result not found or failed");
  }

  async collectBatchResults(batchId: string, lanes: Lane[], submittedModel?: string): Promise<LaneResult[]> {
    if (this.authMode === "claude_oauth") {
      requireApiKeyModeOrThrow("claude", this.authMode);
    }
    const client = this.getClient();
    const laneResultMap = new Map<Lane, LaneResult>();
    // Fallback model used only when a non-succeeded result gives us nothing to read
    // and the caller didn't pass the submitted model — keep this honest, not Sonnet.
    const fallbackModel = submittedModel || LANE_MODEL_HAIKU;
    for await (const item of await (client.messages.batches as any).results(batchId)) {
      const lane = item.custom_id as Lane;
      const definition = LANE_CONFIG[lane];
      if (!definition) {
        console.warn(`  [${lane}] Unknown lane in batch result — skipping (likely a stale batch from before a rename)`);
        continue;
      }
      if (item.result.type !== "succeeded") {
        laneResultMap.set(lane, { lane, label: definition.label, sources: [], narrative: `Batch result: ${item.result.type}`, rawText: "", tokensIn: 0, tokensOut: 0, model: fallbackModel });
        continue;
      }
      const message = item.result.message;
      // Anthropic batch results include the actual model used per-result in message.model
      const batchModel: string = (message.model as string | undefined) || submittedModel || fallbackModel;
      const searchesFired = message.content.filter((block: { type: string }) => block.type === "server_tool_use" || block.type === "tool_use").length;
      const rawText = message.content.filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("\n");
      const parsed = parseLaneResponse(rawText);
      const tokensIn = message.usage.input_tokens;
      const tokensOut = message.usage.output_tokens;
      const usageExt = message.usage as { cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
      const cacheCreateIn = usageExt.cache_creation_input_tokens || 0;
      const cacheReadIn = usageExt.cache_read_input_tokens || 0;
      const searchLabel = `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      const cacheLabel = cacheCreateIn || cacheReadIn ? `, cache ${cacheCreateIn.toLocaleString()} w / ${cacheReadIn.toLocaleString()} r` : "";
      console.log(`  [${definition.label}] Collected — ${parsed?.sources.length ?? 0} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out${cacheLabel})`);
      laneResultMap.set(
        lane,
        parsed
          ? { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, model_context: parsed.model_context, rawText, tokensIn, tokensOut, cacheCreateIn, cacheReadIn, model: batchModel, searchesFired }
          : { ...fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, batchModel), cacheCreateIn, cacheReadIn, searchesFired }
      );
    }
    return lanes.map((lane) => laneResultMap.get(lane)).filter((item): item is LaneResult => item !== undefined);
  }
}

async function consumeClaudeSdkStream(iter: AsyncIterable<ClaudeSdkMessage>): Promise<{ rawText: string; tokensIn: number; tokensOut: number; searchesFired: number; error: string | null }> {
  let rawText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let searchesFired = 0;
  let error: string | null = null;

  for await (const msg of iter) {
    if (msg.type === "assistant") {
      const content = (msg as { message?: { content?: Array<{ type: string; text?: string }> } }).message?.content ?? [];
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          rawText += (rawText ? "\n" : "") + block.text;
        } else if (block.type === "tool_use" || block.type === "server_tool_use") {
          searchesFired++;
        }
      }
    } else if (msg.type === "result") {
      const r = msg as { usage?: { input_tokens?: number; output_tokens?: number }; is_error?: boolean; subtype?: string; message?: string };
      tokensIn = r.usage?.input_tokens ?? tokensIn;
      tokensOut = r.usage?.output_tokens ?? tokensOut;
      if (r.is_error || (r.subtype && r.subtype !== "success")) {
        error = `${r.subtype ?? "error"}${r.message ? `: ${r.message}` : ""}`;
      }
    }
  }

  return { rawText, tokensIn, tokensOut, searchesFired, error };
}
