import { GoogleGenAI } from "@google/genai";
import { detectGeminiAuthMode, GeminiAuthMode, requireApiKeyModeOrThrow } from "../auth/detect";
import { DEPTH_CONFIG, LANE_CONFIG } from "../config";
import { fallbackLaneResult, parseLaneResponse } from "../parsing";
import { buildLanePrompt, buildSynthesisPrompt, SHARED_LANE_SCAFFOLDING } from "../prompts";
import { BatchStatus, Lane, LaneResult, ProviderAdapter, ProviderModels, SweepConfig, UsageCounts } from "../types";

// Model IDs verified May 2026 against ai.google.dev/gemini-api/docs/pricing.
// gemini-2.5-* are the stable, non-preview production IDs.
const LANE_MODEL_FLASH_LITE = "gemini-2.5-flash-lite"; // shallow/standard lanes
const LANE_MODEL_FLASH = "gemini-2.5-flash"; // deep lanes
const SYNTHESIS_MODEL = "gemini-2.5-pro";
const TEST_MODEL = "gemini-2.5-flash-lite";

// Terminal and in-progress Gemini batch job states.
const TERMINAL_STATES = new Set([
  "JOB_STATE_SUCCEEDED",
  "JOB_STATE_FAILED",
  "JOB_STATE_CANCELLED",
  "JOB_STATE_EXPIRED",
]);

function resolveLaneModel(config: SweepConfig): string {
  // Explicit --lane-model-id wins (e.g. force flash-lite for a deep sweep on a
  // free-tier project). Gemini ignores --lane-model (that's Claude-specific).
  if (config.laneModelId) return config.laneModelId;
  return config.depth === "deep" ? LANE_MODEL_FLASH : LANE_MODEL_FLASH_LITE;
}

// `GenerateContentResponse.text` is a class getter. Sync calls return a real
// instance, but batch `inlinedResponses[].response` is deserialized JSON with no
// getter — so read `.text` if present, else reconstruct from candidate parts.
function extractText(resp: unknown): string {
  const r = resp as {
    text?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | undefined;
  if (!r) return "";
  if (typeof r.text === "string" && r.text.length > 0) return r.text;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

function batchStateToStatus(state: string | undefined): string {
  if (!state) return "unknown";
  if (state === "JOB_STATE_SUCCEEDED") return "ended";
  if (state === "JOB_STATE_FAILED" || state === "JOB_STATE_CANCELLED" || state === "JOB_STATE_EXPIRED") return "errored";
  // JOB_STATE_PENDING | JOB_STATE_RUNNING and any unknown states
  return "in_progress";
}

// @google/genai throws an ApiError with a numeric `.status` and a message that
// embeds the JSON `"status"` enum (e.g. UNAVAILABLE, RESOURCE_EXHAUSTED).
function errInfo(err: unknown): { status: number; message: string } {
  const e = err as { status?: number; message?: string } | undefined;
  return { status: typeof e?.status === "number" ? e.status : 0, message: String(e?.message ?? err ?? "") };
}

// Transient: 503 UNAVAILABLE (capacity spikes) and 429 RESOURCE_EXHAUSTED
// (rate limit). Worth a bounded retry — these killed an otherwise-good sweep.
function isTransient(err: unknown): boolean {
  const { status, message } = errInfo(err);
  return status === 503 || status === 429 || /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message);
}

// 400 FAILED_PRECONDITION on a batch/generate call is Google's opaque "this
// account/project is not on a billing-enabled paid tier" gate. Surface a
// clear, actionable message instead of "Precondition check failed."
function rethrowIfBillingGate(err: unknown, op: string): never | void {
  const { status, message } = errInfo(err);
  if (status === 400 && /FAILED_PRECONDITION|Precondition check failed/.test(message)) {
    throw new Error(
      `Gemini ${op} was rejected with FAILED_PRECONDITION. This almost always means the ` +
        `API key / GCP project is not on a billing-enabled paid tier. The Gemini Batch API, ` +
        `Gemini 2.5 Pro, and Google Search grounding all require billing. Enable prepaid ` +
        `billing in Google AI Studio, or use a billing-attached GCP project via the OAuth ` +
        `route (--gemini-auth gemini-oauth with GOOGLE_ACCESS_TOKEN). Original error: ${message}`
    );
  }
}

const RETRY_DELAYS_MS = [2000, 6000, 18000]; // 3 bounded retries, ~26s worst case

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length || !isTransient(err)) break;
      const wait = RETRY_DELAYS_MS[attempt];
      const { status } = errInfo(err);
      console.warn(`  [${label}] Transient error (${status || "?"}); retrying in ${wait / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * Gemini provider. Two auth routes:
 *  - api_key:      GEMINI_API_KEY (default).
 *  - gemini_oauth: Google OAuth access token (GOOGLE_ACCESS_TOKEN) passed as a
 *                  Bearer header via the @google/genai SDK httpOptions. NOTE:
 *                  GCP-billed (Generative Language API + billing required for
 *                  grounding), NOT consumer-subscription quota. Sync-only;
 *                  batch mode requires api_key.
 */
export class GeminiProvider implements ProviderAdapter {
  readonly provider = "gemini" as const;
  private authMode: GeminiAuthMode | null = null;
  private client: GoogleGenAI | null = null;

  requireApiKey(config?: SweepConfig): string {
    const mode = config ? this.resolveAuthMode(config) : this.authMode ?? (process.env.GEMINI_API_KEY ? "api_key" : null);
    if (mode === "gemini_oauth") return "gemini-oauth-auth";
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Error: GEMINI_API_KEY not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
    return apiKey;
  }

  getAuthMode(): GeminiAuthMode | null {
    return this.authMode;
  }

  private resolveAuthMode(config: SweepConfig): GeminiAuthMode {
    if (this.authMode) return this.authMode;
    this.authMode = detectGeminiAuthMode(config.geminiAuth);
    if (this.authMode === "gemini_oauth") {
      // Billing safeguard: never let the OAuth route silently fall back to
      // API-key billing (mirrors the openai.ts / claude.ts pattern).
      delete process.env.GEMINI_API_KEY;
    }
    return this.authMode;
  }

  private getClient(mode: GeminiAuthMode): GoogleGenAI {
    if (this.client) return this.client;
    if (mode === "gemini_oauth") {
      const token = process.env.GOOGLE_ACCESS_TOKEN;
      if (!token) throw new Error("Error: GOOGLE_ACCESS_TOKEN not set for gemini_oauth route.");
      this.client = new GoogleGenAI({
        httpOptions: { headers: { Authorization: `Bearer ${token}` } },
      });
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Error: GEMINI_API_KEY not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  getModels(config: SweepConfig, _mode: "sync" | "batch"): ProviderModels {
    return {
      lane: config.test ? TEST_MODEL : resolveLaneModel(config),
      synthesis: config.test ? TEST_MODEL : config.synthesisModel || SYNTHESIS_MODEL,
    };
  }

  // ---------------------------------------------------------------------------
  // Sync lane
  // ---------------------------------------------------------------------------

  async runLane(config: SweepConfig, lane: Lane): Promise<LaneResult> {
    const mode = this.resolveAuthMode(config);
    const ai = this.getClient(mode);
    const definition = LANE_CONFIG[lane];
    const model = config.test ? TEST_MODEL : resolveLaneModel(config);

    console.log(`  [${definition.label}] Starting sweep...`);

    try {
      // Build the generate config. systemInstruction carries the shared
      // scaffolding + per-lane system prompt (mirrors how claude.ts sets system).
      const generateConfig: Record<string, unknown> = {
        maxOutputTokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
        temperature: 0.2,
        systemInstruction: `${SHARED_LANE_SCAFFOLDING}\n\n${definition.systemPrompt}`,
      };

      // Google Search grounding cannot be forced — model decides. When noSearch
      // is set we omit the tools array entirely per the spec.
      if (!config.noSearch) {
        generateConfig.tools = [{ googleSearch: {} }];
      }

      const response = await withRetry(definition.label, () =>
        ai.models.generateContent({
          model,
          contents: buildLanePrompt(lane, config),
          config: generateConfig,
        })
      );

      const rawText = response.text ?? "";
      const tokensIn = response.usageMetadata?.promptTokenCount ?? 0;
      const tokensOut = response.usageMetadata?.candidatesTokenCount ?? 0;

      // Grounding citations — map groundingChunks to SourceItems if parseLaneResponse fails
      const groundingChunks =
        (response.candidates?.[0]?.groundingMetadata as { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } | undefined)
          ?.groundingChunks ?? [];

      // searchesFired: number of distinct web queries issued during grounding
      const webSearchQueries =
        (response.candidates?.[0]?.groundingMetadata as { webSearchQueries?: string[] } | undefined)
          ?.webSearchQueries ?? [];
      const searchesFired = config.noSearch ? 0 : webSearchQueries.length;

      const parsed = parseLaneResponse(rawText);

      if (!parsed) {
        console.warn(`  [${definition.label}] Warning: could not parse JSON response, using fallback`);
        // If grounding returned citations, try to incorporate them into the fallback
        const fallback = fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, model);
        if (groundingChunks.length > 0) {
          fallback.sources = groundingChunks
            .filter((c) => c.web?.uri)
            .map((c) => ({
              title: c.web?.title || c.web?.uri || "",
              url: c.web?.uri,
              significance: "Grounding citation from Google Search",
            }));
        }
        return { ...fallback, searchesFired };
      }

      const searchLabel = config.noSearch ? "no search" : `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      console.log(`  [${definition.label}] Complete — ${parsed.sources.length} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out)`);
      return {
        lane,
        label: definition.label,
        sources: parsed.sources,
        narrative: parsed.narrative,
        model_context: parsed.model_context,
        rawText,
        tokensIn,
        tokensOut,
        model,
        searchesFired,
      };
    } catch (error) {
      console.error(`  [${definition.label}] Error:`, error);
      return { lane, label: definition.label, sources: [], narrative: `Error during sweep: ${error}`, rawText: "", tokensIn: 0, tokensOut: 0, model };
    }
  }

  // ---------------------------------------------------------------------------
  // Sync synthesis
  // ---------------------------------------------------------------------------

  async runSynthesis(
    config: SweepConfig,
    laneResults: LaneResult[],
    sourcesName: string
  ): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    const mode = this.resolveAuthMode(config);
    const ai = this.getClient(mode);
    const model = this.getModels(config, "sync").synthesis;

    console.log("\n  [Synthesis] Assembling research brief...");

    const response = await withRetry("Synthesis", () =>
      ai.models.generateContent({
        model,
        contents: buildSynthesisPrompt(config, laneResults, sourcesName),
        config: {
          maxOutputTokens: DEPTH_CONFIG[config.depth].synthesisMaxTokens,
          temperature: 0.3,
          // Synthesis gets no tools — no grounding needed, mirrors claude.ts synthesis
        },
      })
    );

    const markdown = response.text ?? "";
    const tokensIn = response.usageMetadata?.promptTokenCount ?? 0;
    const tokensOut = response.usageMetadata?.candidatesTokenCount ?? 0;
    console.log(`  [Synthesis] Complete (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out)`);
    return { markdown, tokensIn, tokensOut };
  }

  // ---------------------------------------------------------------------------
  // Batch lanes
  // ---------------------------------------------------------------------------

  async submitBatchLanes(config: SweepConfig): Promise<string> {
    requireApiKeyModeOrThrow("gemini", this.resolveAuthMode(config));
    const ai = this.getClient("api_key");
    const model = config.test ? TEST_MODEL : resolveLaneModel(config);

    const requests = config.lanes.map((lane) => {
      const generateConfig: Record<string, unknown> = {
        maxOutputTokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
        temperature: 0.2,
        systemInstruction: `${SHARED_LANE_SCAFFOLDING}\n\n${LANE_CONFIG[lane].systemPrompt}`,
      };
      if (!config.noSearch) {
        generateConfig.tools = [{ googleSearch: {} }];
      }
      return {
        contents: buildLanePrompt(lane, config),
        config: generateConfig,
        // Tag each request so results can be matched by lane rather than by
        // fragile positional ordering. InlinedResponse.metadata round-trips.
        metadata: { lane },
      };
    });

    let job: { name?: string };
    try {
      job = await withRetry("Batch submit", () =>
        (ai as any).batches.create({
          model,
          src: requests,
          config: { displayName: `research-sweeper-lanes-${config.topic.slice(0, 40)}-${Date.now()}` },
        })
      );
    } catch (err) {
      rethrowIfBillingGate(err, "batch submit");
      throw err;
    }

    const batchName: string = job.name as string;
    console.log(`  [Batch] Gemini lanes batch submitted: ${batchName}`);
    return batchName;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const ai = this.getClient(this.authMode ?? "api_key");
    const job = await (ai as any).batches.get({ name: batchId });
    const state: string = job.state as string ?? "unknown";
    const isTerminal = TERMINAL_STATES.has(state);

    // Gemini batch API does not expose per-request counts in the same shape as
    // Anthropic. We derive a coarse UsageCounts from what we know.
    const counts: UsageCounts = {
      processing: isTerminal ? 0 : 1,
      succeeded: state === "JOB_STATE_SUCCEEDED" ? 1 : 0,
      errored: (state === "JOB_STATE_FAILED" || state === "JOB_STATE_CANCELLED" || state === "JOB_STATE_EXPIRED") ? 1 : 0,
    };

    return { id: batchId, status: batchStateToStatus(state), counts };
  }

  async collectBatchResults(batchId: string, lanes: Lane[], submittedModel?: string): Promise<LaneResult[]> {
    const ai = this.getClient(this.authMode ?? "api_key");
    const job = await (ai as any).batches.get({ name: batchId });
    const fallbackModel = submittedModel || LANE_MODEL_FLASH_LITE;

    if (job.state !== "JOB_STATE_SUCCEEDED") {
      throw new Error(`Gemini batch ${batchId} is not in a succeeded state (current: ${job.state})`);
    }

    // Prefer matching results to lanes by the metadata.lane tag set at submit
    // time; fall back to positional pairing if metadata is absent.
    const inlinedResponses: Array<{ response?: unknown; error?: { message?: string }; metadata?: Record<string, string> }> =
      (job.dest?.inlinedResponses as Array<{ response?: unknown; error?: { message?: string }; metadata?: Record<string, string> }>) ?? [];

    if (inlinedResponses.length !== lanes.length) {
      console.warn(`  [Batch] Warning: ${inlinedResponses.length} responses for ${lanes.length} lanes — pairing best-effort.`);
    }

    const byLane = new Map<string, (typeof inlinedResponses)[number]>();
    for (const r of inlinedResponses) {
      if (r.metadata?.lane) byLane.set(r.metadata.lane, r);
    }

    const laneResultMap = new Map<Lane, LaneResult>();

    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const definition = LANE_CONFIG[lane];
      if (!definition) {
        console.warn(`  [${lane}] Unknown lane — skipping`);
        continue;
      }

      const item = byLane.get(lane) ?? inlinedResponses[i];
      if (!item || item.error) {
        const errMsg = item?.error?.message ?? "missing batch response";
        laneResultMap.set(lane, { lane, label: definition.label, sources: [], narrative: `Batch result: ${errMsg}`, rawText: "", tokensIn: 0, tokensOut: 0, model: fallbackModel });
        continue;
      }

      // item.response has same shape as a generateContent response
      const resp = item.response as {
        text?: string;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        candidates?: Array<{
          groundingMetadata?: {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
            webSearchQueries?: string[];
          };
        }>;
      };

      const rawText = extractText(resp);
      const tokensIn = resp.usageMetadata?.promptTokenCount ?? 0;
      const tokensOut = resp.usageMetadata?.candidatesTokenCount ?? 0;
      const webSearchQueries = resp.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];
      const searchesFired = webSearchQueries.length;

      const parsed = parseLaneResponse(rawText);
      const searchLabel = `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      console.log(`  [${definition.label}] Collected — ${parsed?.sources.length ?? 0} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out)`);

      laneResultMap.set(
        lane,
        parsed
          ? { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, model_context: parsed.model_context, rawText, tokensIn, tokensOut, model: fallbackModel, searchesFired }
          : { ...fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, fallbackModel), searchesFired }
      );
    }

    // Never silently shrink the lane set. Any requested lane still missing here
    // (e.g. unknown lane, or a future code path that skipped insertion) gets an
    // explicit empty placeholder + a warning, so synthesis sees a stable lane
    // count and the drop is visible rather than swallowed by a filter.
    return lanes.map((lane) => {
      const result = laneResultMap.get(lane);
      if (result) return result;
      const definition = LANE_CONFIG[lane];
      const label = definition?.label ?? lane;
      console.warn(`  [${label}] Warning: no batch result for this lane — emitting empty placeholder so synthesis sees the gap.`);
      return { lane, label, sources: [], narrative: "Batch result: lane produced no collectable response.", rawText: "", tokensIn: 0, tokensOut: 0, model: fallbackModel };
    });
  }

  // ---------------------------------------------------------------------------
  // Batch synthesis
  // ---------------------------------------------------------------------------

  async submitBatchSynthesis(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<string> {
    requireApiKeyModeOrThrow("gemini", this.resolveAuthMode(config));
    const ai = this.getClient("api_key");
    const model = this.getModels(config, "batch").synthesis;

    let job: { name?: string };
    try {
      job = await withRetry("Batch synthesis submit", () =>
        (ai as any).batches.create({
          model,
          src: [
            {
              contents: buildSynthesisPrompt(config, laneResults, sourcesName),
              config: {
                maxOutputTokens: DEPTH_CONFIG[config.depth].synthesisMaxTokens,
                temperature: 0.3,
              },
            },
          ],
          config: { displayName: `research-sweeper-synthesis-${config.topic.slice(0, 40)}-${Date.now()}` },
        })
      );
    } catch (err) {
      rethrowIfBillingGate(err, "batch synthesis submit");
      throw err;
    }

    const batchName: string = job.name as string;
    console.log(`  [Batch] Gemini synthesis batch submitted: ${batchName}`);
    return batchName;
  }

  async collectBatchSynthesisResult(batchId: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
    const ai = this.getClient(this.authMode ?? "api_key");
    const job = await (ai as any).batches.get({ name: batchId });

    if (job.state !== "JOB_STATE_SUCCEEDED") {
      throw new Error(`Gemini synthesis batch ${batchId} is not succeeded (current: ${job.state})`);
    }

    const inlinedResponses: Array<{ response?: unknown; error?: { message?: string } }> =
      (job.dest?.inlinedResponses as Array<{ response?: unknown; error?: { message?: string } }>) ?? [];

    const item = inlinedResponses[0];
    if (!item || item.error) {
      throw new Error(`Synthesis batch result error: ${item?.error?.message ?? "missing response"}`);
    }

    const resp = item.response as {
      text?: string;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    return {
      markdown: extractText(resp),
      tokensIn: resp.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: resp.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
