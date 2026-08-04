import Anthropic from "@anthropic-ai/sdk";
import { ClaudeAuthMode, detectClaudeAuthMode, requireApiKeyModeOrThrow } from "../auth/detect";
import { DEPTH_CONFIG, LANE_CONFIG } from "../config";
import { fallbackLaneResult, parseLaneResponse } from "../parsing";
import { claudeLaneToolConfig, countClaudeSearches, extractClaudeLaneRaw, harvestClaudeSearchSources, mergeLaneSources } from "../lane-schema";
import { buildLanePrompt, buildSynthesisPrompt, buildLaneSystemPrefix } from "../prompts";
import { withTransientRetry } from "../retry";
import {
  appendSynthesisTruncationWarning,
  classifyStopReason,
  markNarrativeTruncated,
  REFUSAL_NARRATIVE,
} from "../stop-reason";
import { assembleLaneResult, emptyLaneResult, finalizeLaneResults } from "../batch-collect";
import { BatchLaneFailure, BatchStatus, Lane, LaneResult, ProviderAdapter, ProviderModels, SweepConfig, UsageCounts } from "../types";

// Model-ID pinning policy (checked against platform.claude.com/docs, 2026-07):
// every Claude model ID is a pinned snapshot, dated or not — Anthropic's docs
// are explicit that starting with the 4.6 generation, dateless IDs are pinned
// snapshots too, not evergreen pointers. LANE_MODEL_HAIKU carries a date
// suffix because it predates that 4.6-generation naming change and the
// Claude API ID for Haiku 4.5 has always been `claude-haiku-4-5-20251001`
// (`claude-haiku-4-5` is the alias). LANE_MODEL_SONNET and SYNTHESIS_MODEL
// are undated because `claude-sonnet-5` / `claude-opus-4-8` ARE the
// documented canonical Claude API IDs for those models — there is no dated
// snapshot variant to pin to instead, so the undated/dated split below is
// deliberate, not an oversight. Re-check platform.claude.com/docs/en/about-
// claude/models/overview if a future release reintroduces dated IDs.
const LANE_MODEL_HAIKU = "claude-haiku-4-5-20251001";
const LANE_MODEL_SONNET = "claude-sonnet-5";
// Synthesis is a single reasoning-dominated call per sweep, so it runs a tier
// above the lanes. Default is Opus 4.8; override with SYNTHESIS_MODEL (read
// lazily so .env.local, loaded in main() after import, still applies) to dial
// it up or down without a code change. The high-volume lanes are unaffected.
const SYNTHESIS_MODEL = "claude-opus-4-8";

// Bound on pause_turn resend loops in runLaneViaApi (server-side web_search
// loop hit its internal round cap and needs a resend to continue). 5 is
// generous headroom over the depth tiers' own searchRounds config while
// still guaranteeing termination.
const MAX_PAUSE_TURN_CONTINUATIONS = 5;

// Loosely-typed Messages API response shape used for the sync lane/synthesis
// calls. The installed SDK's Anthropic.Message.stop_reason type predates
// pause_turn/refusal (see stop-reason.ts), so requestParams and the response
// are threaded through Record<string, unknown> / this interface rather than
// Anthropic.Message to avoid fighting the SDK's stricter typing for a
// runtime value the API can actually send.
interface ClaudeMessageLike {
  content: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  stop_reason: string | null;
}

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

// Shared by submitBatchLanes (full lane set) and submitBatchLanesSubset (the
// --resubmit-failed recovery path) — a single place that turns a lane subset
// into Messages Batches requests so both submit paths build them identically.
export interface ClaudeBatchRequest {
  custom_id: Lane;
  params: Record<string, unknown>;
}

// Minimal shape pulled from a Messages Batches result item — just enough to
// classify success/failure without pulling in the full Anthropic response
// typing, so determineFailedLanes stays a pure function testable without a
// mocked SDK client.
export interface BatchResultTypeItem {
  custom_id: string;
  resultType: string;
}

// Batches API best practice: a completed batch can carry per-request results
// of type "errored" | "expired" | "canceled" alongside "succeeded" — none of
// those are billed, so the caller can resubmit exactly those custom_ids for
// free. `lanes` scopes the check to the lanes the caller cares about (the
// job manifest's lane list), ignoring any unknown/stale custom_ids the same
// way collectBatchResults does. A lane with no result item at all (should not
// happen for a completed batch, but defends against a malformed response) is
// not flagged — there is nothing to resubmit a custom_id for that never
// existed in the batch.
export function determineFailedLanes(items: BatchResultTypeItem[], lanes: Lane[]): BatchLaneFailure[] {
  const resultByLane = new Map(items.map((item) => [item.custom_id, item.resultType]));
  const failures: BatchLaneFailure[] = [];
  for (const lane of lanes) {
    const resultType = resultByLane.get(lane);
    if (resultType && resultType !== "succeeded") {
      failures.push({ lane, resultType });
    }
  }
  return failures;
}

export function buildLaneBatchRequests(config: SweepConfig, lanes: Lane[]): ClaudeBatchRequest[] {
  return lanes.map((lane) => {
    const params: Record<string, unknown> = {
      model: config.test ? LANE_MODEL_HAIKU : resolveLaneModel(config),
      max_tokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
      system: [
        { type: "text", text: buildLaneSystemPrefix(config), cache_control: { type: "ephemeral" } },
        { type: "text", text: LANE_CONFIG[lane].systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildLanePrompt(lane, config) }],
    };
    const { tools, tool_choice } = claudeLaneToolConfig(!!config.noSearch);
    params.tools = tools;
    params.tool_choice = tool_choice;
    return { custom_id: lane, params };
  });
}

// Transient Anthropic API errors worth a bounded retry: 429 (rate limit),
// 500/502 (transient upstream failures), 503/529 (overloaded — 529 arrives as
// InternalServerError since the SDK only special-cases 4xx status codes, but
// its .status field is still the real 529). Anything else (400, 401, 403,
// 404, 422) is a request/auth problem retrying won't fix.
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 529]);

// Exported (alongside withClaudeRetry) for direct unit testing without
// standing up a full mocked Anthropic client.
export function claudeErrorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

export function isTransientClaudeError(err: unknown): boolean {
  const status = claudeErrorStatus(err);
  return status !== undefined && TRANSIENT_STATUSES.has(status);
}

// Anthropic SDK errors expose `.headers` as Record<string, string | null |
// undefined>. Only 429s carry a meaningful retry-after; other transient
// statuses (500/502/503/529) fall back to the computed backoff schedule.
export function claudeRetryAfterMs(err: unknown): number | undefined {
  const status = claudeErrorStatus(err);
  if (status !== 429) return undefined;
  const headers = (err as { headers?: Record<string, string | null | undefined> } | undefined)?.headers;
  const raw = headers?.["retry-after"];
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

// Bounded retry wrapper for Claude Messages API calls. The Anthropic SDK has
// its own internal retry (maxRetries, default 2) for the same status codes;
// getClient() sets maxRetries: 0 so the two retry layers don't multiply
// (SDK-retries-of-3 x our-retries-of-3 would be up to 9 attempts per call).
// This layer exists instead of the SDK's because it lets us honor a 429
// retry-after hint and share the exact backoff/log shape with gemini.ts via
// src/retry.ts.
function withClaudeRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return withTransientRetry(fn, {
    label,
    isTransient: isTransientClaudeError,
    maxAttempts: 3,
    baseDelayMs: 2000,
    getRetryAfterMs: claudeRetryAfterMs,
    getStatus: claudeErrorStatus,
  });
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
        // Our own withClaudeRetry() wraps the lane/synthesis calls with a
        // bounded, retry-after-aware backoff (see withClaudeRetry above).
        // The SDK's built-in retry (default maxRetries: 2) targets the same
        // transient status codes, so leaving it enabled would let both
        // layers retry the same failure — up to 3x more attempts and delay
        // than intended. Disable it here; our layer is the only one that runs.
        maxRetries: 0,
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
          { type: "text", text: buildLaneSystemPrefix(config), cache_control: { type: "ephemeral" } },
          { type: "text", text: definition.systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: buildLanePrompt(lane, config) }],
      };

      const { tools, tool_choice } = claudeLaneToolConfig(!!config.noSearch);
      requestParams.tools = tools;
      requestParams.tool_choice = tool_choice;

      const createFn = client.messages.create.bind(client.messages) as unknown as (params: Record<string, unknown>) => Promise<ClaudeMessageLike>;

      let response = await withClaudeRetry(definition.label, () => createFn(requestParams));

      // pause_turn: the server-side web_search loop hit its internal round
      // cap (default 10) and can be resumed by resending the paused
      // assistant response as-is — do NOT inject a "Continue." user message,
      // the API detects the trailing server_tool_use block on its own.
      // Bounded so a pathological loop can't hang the sweep.
      let continuations = 0;
      const messages = requestParams.messages as Array<Record<string, unknown>>;
      while (classifyStopReason(response.stop_reason) === "pause_turn" && continuations < MAX_PAUSE_TURN_CONTINUATIONS) {
        continuations++;
        messages.push({ role: "assistant", content: response.content });
        response = await withClaudeRetry(definition.label, () => createFn(requestParams));
      }

      const content = response.content;
      const searchesFired = countClaudeSearches(content);
      const rawText = extractClaudeLaneRaw(content);
      const parsed = parseLaneResponse(rawText);
      const tokensIn = response.usage.input_tokens;
      const tokensOut = response.usage.output_tokens;
      const cacheCreateIn = response.usage.cache_creation_input_tokens || 0;
      const cacheReadIn = response.usage.cache_read_input_tokens || 0;
      const stopClass = classifyStopReason(response.stop_reason);
      const continuationLabel = continuations > 0 ? `, ${continuations} pause_turn continuation${continuations !== 1 ? "s" : ""}` : "";

      if (stopClass === "refusal") {
        console.warn(`  [${definition.label}] Warning: model refused this lane request (stop_reason: refusal)`);
        return { lane, label: definition.label, sources: [], narrative: REFUSAL_NARRATIVE, rawText, tokensIn, tokensOut, cacheCreateIn, cacheReadIn, model, searchesFired };
      }

      const truncated = stopClass === "max_tokens";
      if (truncated) {
        console.warn(`  [${definition.label}] Warning: response truncated at max_tokens — findings incomplete`);
      }

      if (!parsed) {
        console.warn(`  [${definition.label}] Warning: could not parse JSON response, using fallback`);
        const fallback = fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, model);
        if (truncated) fallback.narrative = markNarrativeTruncated(fallback.narrative);
        return { ...fallback, cacheCreateIn, cacheReadIn, truncated: truncated || undefined };
      }

      const narrative = truncated ? markNarrativeTruncated(parsed.narrative) : parsed.narrative;
      const sources = mergeLaneSources(parsed.sources, harvestClaudeSearchSources(content));
      const searchLabel = config.noSearch ? "no search" : `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      const cacheLabel = cacheCreateIn || cacheReadIn ? `, cache ${cacheCreateIn.toLocaleString()} w / ${cacheReadIn.toLocaleString()} r` : "";
      console.log(`  [${definition.label}] Complete — ${sources.length} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out${cacheLabel}${continuationLabel})`);
      return { lane, label: definition.label, sources, narrative, model_context: parsed.model_context, parseMode: parsed.parseMode, rawText, tokensIn, tokensOut, cacheCreateIn, cacheReadIn, model, searchesFired, truncated: truncated || undefined };
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
          systemPrompt: `${buildLaneSystemPrefix(config)}\n\n${definition.systemPrompt}`,
          allowedTools: config.noSearch ? [] : LANE_ALLOWED_TOOLS,
          disallowedTools: CLI_DISALLOWED_TOOLS,
          permissionMode: "bypassPermissions",
          // A "search round" routinely spans more than one SDK turn (tool
          // batches, retries, the final write-up), so the cap needs slack
          // beyond searchRounds or lanes die at "maximum number of turns" —
          // three lanes did exactly that on a deep sweep at rounds + 3.
          maxTurns: DEPTH_CONFIG[config.depth].searchRounds * 2 + 5,
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
      return { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, model_context: parsed.model_context, parseMode: parsed.parseMode, rawText, tokensIn, tokensOut, model, searchesFired };
    } catch (error) {
      console.error(`  [${definition.label}] Error:`, error);
      return { lane, label: definition.label, sources: [], narrative: `Error during sweep: ${error}`, rawText: "", tokensIn: 0, tokensOut: 0, model };
    }
  }

  private async runSynthesisViaApi(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    const client = this.getClient();
    console.log("\n  [Synthesis] Assembling research brief...");
    const response = await withClaudeRetry("Synthesis", () =>
      client.messages.create({
        model: this.getModels(config, "sync").synthesis,
        max_tokens: DEPTH_CONFIG[config.depth].synthesisMaxTokens,
        // Deliberately uncached: the synthesis prompt has no shared prefix
        // across a sweep (see stats.ts), so a cache_control breakpoint here
        // would only pay the 1.25x write premium for ~zero reads.
        messages: [
          { role: "user", content: buildSynthesisPrompt(config, laneResults, sourcesName) },
        ],
      } as unknown as Anthropic.MessageCreateParamsNonStreaming)
    );
    let markdown = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    const stopClass = classifyStopReason(response.stop_reason);
    if (stopClass === "refusal") {
      throw new Error("Synthesis refused by Claude (stop_reason: refusal).");
    }
    if (stopClass === "max_tokens") {
      console.warn("  [Synthesis] Warning: response truncated at max_tokens — synthesis incomplete");
      markdown = appendSynthesisTruncationWarning(markdown);
    }
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
    const requests = buildLaneBatchRequests(config, config.lanes);
    // `requests[].params` is built from Record<string, unknown> above because
    // claudeLaneToolConfig()'s tools/tool_choice are loosely typed (see
    // lane-schema.ts) — the same boundary cast used for the sync path's
    // client.messages.create call just above. batches.create itself is fully
    // typed; only this one cast is needed.
    const batch = await client.messages.batches.create({ requests } as unknown as Anthropic.Messages.BatchCreateParams);
    return batch.id;
  }

  // --resubmit-failed recovery path: submit a follow-up batch covering only
  // the lanes the caller has already determined failed (see
  // getBatchLaneFailures). Requests are built identically to a fresh
  // submission via buildLaneBatchRequests.
  async submitBatchLanesSubset(config: SweepConfig, lanes: Lane[]): Promise<string> {
    requireApiKeyModeOrThrow("claude", this.resolveAuthMode(config));
    const client = this.getClient();
    const requests = buildLaneBatchRequests(config, lanes);
    const batch = await client.messages.batches.create({ requests } as unknown as Anthropic.Messages.BatchCreateParams);
    return batch.id;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    // Batch status is API-only — if the provider was constructed in claude_oauth
    // mode, guard here; otherwise read via the SDK client.
    if (this.authMode === "claude_oauth") {
      requireApiKeyModeOrThrow("claude", this.authMode);
    }
    const client = this.getClient();
    const batch = await client.messages.batches.retrieve(batchId);
    return { id: batchId, status: batch.processing_status, counts: usageCounts(batch.request_counts) };
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
          // Deliberately uncached — see runSynthesisViaApi and stats.ts.
          messages: [
            { role: "user", content: buildSynthesisPrompt(config, laneResults, sourcesName) },
          ],
        },
      },
    ];
    const batch = await client.messages.batches.create({ requests } as unknown as Anthropic.Messages.BatchCreateParams);
    return batch.id;
  }

  async collectBatchSynthesisResult(batchId: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    if (this.authMode === "claude_oauth") {
      requireApiKeyModeOrThrow("claude", this.authMode);
    }
    const client = this.getClient();
    for await (const item of await client.messages.batches.results(batchId)) {
      if (item.custom_id === "synthesis" && item.result.type === "succeeded") {
        const message = item.result.message;
        let markdown = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
        const stopClass = classifyStopReason(message.stop_reason);
        if (stopClass === "refusal") {
          throw new Error(`Synthesis batch ${batchId} refused by Claude (stop_reason: refusal).`);
        }
        if (stopClass === "max_tokens") {
          console.warn("  [Synthesis] Warning: batch response truncated at max_tokens — synthesis incomplete");
          markdown = appendSynthesisTruncationWarning(markdown);
        }
        return { markdown, tokensIn: message.usage.input_tokens, tokensOut: message.usage.output_tokens };
      }
    }
    throw new Error("Synthesis batch result not found or failed");
  }

  // --resubmit-failed recovery path: surface which of `lanes` did NOT succeed
  // in a completed batch, and what result.type they carry (errored/expired/
  // canceled), without paying the cost of fully parsing every succeeded
  // lane's content the way collectBatchResults does.
  async getBatchLaneFailures(batchId: string, lanes: Lane[]): Promise<BatchLaneFailure[]> {
    if (this.authMode === "claude_oauth") {
      requireApiKeyModeOrThrow("claude", this.authMode);
    }
    const client = this.getClient();
    const items: BatchResultTypeItem[] = [];
    for await (const item of await client.messages.batches.results(batchId)) {
      items.push({ custom_id: item.custom_id, resultType: item.result.type });
    }
    return determineFailedLanes(items, lanes);
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
    for await (const item of await client.messages.batches.results(batchId)) {
      const lane = item.custom_id as Lane;
      const definition = LANE_CONFIG[lane];
      if (!definition) {
        console.warn(`  [${lane}] Unknown lane in batch result — skipping (likely a stale batch from before a rename)`);
        continue;
      }
      if (item.result.type !== "succeeded") {
        laneResultMap.set(lane, emptyLaneResult(lane, definition.label, `Batch result: ${item.result.type}`, fallbackModel));
        continue;
      }
      const message = item.result.message;
      // Anthropic batch results include the actual model used per-result in message.model
      const batchModel: string = message.model || submittedModel || fallbackModel;
      const content = message.content;
      const searchesFired = countClaudeSearches(content);
      const rawText = extractClaudeLaneRaw(content);
      const tokensIn = message.usage.input_tokens;
      const tokensOut = message.usage.output_tokens;
      const cacheCreateIn = message.usage.cache_creation_input_tokens || 0;
      const cacheReadIn = message.usage.cache_read_input_tokens || 0;
      const stopClass = classifyStopReason(message.stop_reason);

      if (stopClass === "refusal") {
        console.warn(`  [${definition.label}] Warning: model refused this lane request (stop_reason: refusal)`);
        laneResultMap.set(lane, { lane, label: definition.label, sources: [], narrative: REFUSAL_NARRATIVE, rawText, tokensIn, tokensOut, cacheCreateIn, cacheReadIn, model: batchModel, searchesFired });
        continue;
      }

      const truncated = stopClass === "max_tokens";
      if (truncated) {
        console.warn(`  [${definition.label}] Warning: batch response truncated at max_tokens — findings incomplete`);
      }

      laneResultMap.set(lane, assembleLaneResult(lane, definition, {
        rawText,
        tokensIn,
        tokensOut,
        model: batchModel,
        searchesFired,
        cacheCreateIn,
        cacheReadIn,
        truncated,
        harvestedSources: harvestClaudeSearchSources(content),
      }));
    }
    return finalizeLaneResults(lanes, laneResultMap, fallbackModel, (lane) => LANE_CONFIG[lane]?.label ?? lane);
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
