export type Provider = "claude" | "openai" | "gemini";
export type Lane = "financial" | "frontier" | "academic" | "vc" | "blogs" | "tech";
export type Depth = "shallow" | "standard" | "deep";

export interface SweepConfig {
  provider: Provider;
  topic: string;
  briefFile?: string;
  briefTitle?: string;
  briefing?: string;
  fromYear: number;
  toYear: number | null;
  lanes: Lane[];
  depth: Depth;
  outputDir: string;
  test: boolean;
  overwrite: boolean;
  noSearch?: boolean;
  laneModel?: "haiku" | "sonnet";
  synthesisModel?: string;
  // Generic explicit lane-model id override (provider-specific string, e.g.
  // "gemini-2.5-flash-lite"). Honoured by the Gemini provider; lets a deep
  // sweep run on a free-tier-eligible model. Claude/OpenAI ignore it.
  laneModelId?: string;
  claudeAuth?: "api_key" | "claude_oauth";
  geminiAuth?: "api_key" | "gemini_oauth";
  openaiAuth?: "api_key" | "codex_cli";
  // Minimum number of lanes that must return at least one source for the sweep
  // to proceed to synthesis. Default is Math.ceil(lanes.length / 2) (>50%).
  minLanes?: number;
}

export interface SourceItem {
  title: string;
  url?: string;
  date?: string;
  outlet?: string;
  significance: string;
}

// How the lane's raw response became a LaneResult. "clean" = first JSON.parse
// succeeded with canonical field shapes; "repaired" = one of the parser's
// repair strategies fired (control-char escaping, balanced-brace re-extraction,
// XML-string sources, narrative key drift); "salvaged" = whole-object parse
// failed and fields were recovered loosely; "fallback" = nothing parsed, the
// raw text was dumped into narrative. Recorded per lane in runs/stats.json so
// repair frequency per provider/route stays observable.
export type LaneParseMode = "clean" | "repaired" | "salvaged" | "fallback";

export interface LaneResult {
  lane: Lane;
  label: string;
  sources: SourceItem[];
  narrative: string;
  model_context?: string;
  parseMode?: LaneParseMode;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreateIn?: number;
  cacheReadIn?: number;
  // OpenAI Responses API: reasoning tokens consumed within output_tokens when
  // reasoning.effort is set. Kept for observability; do not bill them twice.
  reasoningOut?: number;
  // OpenAI Responses API prompt-cache hits. The provider records these when
  // usage.input_tokens_details.cached_tokens is available.
  openaiCachedIn?: number;
  // OpenAI Responses API prompt-cache writes, also included in input_tokens.
  // The installed SDK types lag this field, so providers read it defensively.
  openaiCacheWriteIn?: number;
  model: string;
  searchesFired?: number;
  // True when the Claude response hit stop_reason: "max_tokens" before the
  // model finished — narrative carries stop-reason.ts's TRUNCATION_MARKER
  // prefix so downstream synthesis can see the gap instead of treating a
  // partial submit_lane_findings input as a complete lane.
  truncated?: boolean;
}

export interface LaneDefinition {
  label: string;
  outlets: string[];
  searchFocus: string;
  systemPrompt: string;
}

export interface DepthDefinition {
  searchRounds: number;
  sourcesPerLane: number;
  laneMaxTokens: number;
  synthesisMaxTokens: number;
  description: string;
  synthGuide: string;
}

export interface SweepJob {
  provider: Provider;
  batchId: string;
  config: SweepConfig;
  summaryName: string;
  sourcesName: string;
  submittedAt: string;
  lanes: Lane[];
  // Set on a job manifest created by `--resubmit-failed <oldBatchId>`. `lanes`
  // on this manifest covers only the lanes that were resubmitted, not the
  // original job's full lane set — see resumeBatch's merge-guidance output.
  resubmittedFrom?: string;
}

export interface TokenBreakdown {
  lanesIn: number;
  lanesOut: number;
  synthesisIn: number;
  synthesisOut: number;
  totalIn: number;
  totalOut: number;
  // Anthropic prompt-caching tokens. Cache writes bill at 1.25x input price,
  // cache reads at 0.10x input price. Aggregated across lanes only — the
  // synthesis pass is deliberately uncached (see providers/claude.ts).
  cacheCreateIn?: number;
  cacheReadIn?: number;
  // OpenAI Responses API reasoning tokens, already included in totalOut and
  // therefore not a separately billable component. Aggregated for telemetry.
  reasoningOut?: number;
  // OpenAI prompt-cache hits, held separately because lanes and synthesis can
  // use differently priced models. Absent means the route did not expose this
  // usage detail; it must not be treated as a confirmed zero.
  openaiLaneCachedIn?: number;
  openaiSynthesisCachedIn?: number;
  openaiLaneCacheWriteIn?: number;
  openaiSynthesisCacheWriteIn?: number;
  // Number of OpenAI web_search calls. Absent means unavailable, rather than
  // zero, so cost reporting can state that tool fees were not observed.
  openaiWebSearchCalls?: number;
}

export interface RunStats {
  runId: string;
  timestamp: string;
  provider: Provider;
  mode: "sync" | "batch";
  topic: string;
  depth: Depth;
  lanes: Lane[];
  fromYear: number;
  toYear: number | null;
  test: boolean;
  durationSec: number | null;
  submittedAt: string | null;
  tokens: TokenBreakdown;
  models: { lane: string; synthesis: string };
  estimatedCostUSD: number;
  // Additive caveats for estimates that lack provider usage telemetry. Older
  // records intentionally omit this field and remain valid RunStats data.
  costEstimateNotes?: string[];
  outputFiles: string[];
  authMode?: "api_key" | "claude_oauth" | "codex_cli" | "gemini_oauth";
  parseModes?: Partial<Record<Lane, LaneParseMode>>;
  // False on a batch run whose provider has no batch-synthesis endpoint, so
  // the synthesis half billed at full price. Drives the cost estimate.
  synthesisBatched?: boolean;
}

export interface FileNames {
  slug: string;
  summaryName: string;
  sourcesName: string;
}

export interface UsageCounts {
  processing: number;
  succeeded: number;
  errored: number;
}

export interface BatchStatus {
  id: string;
  status: string;
  counts: UsageCounts;
}

export interface ProviderModels {
  lane: string;
  synthesis: string;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  getModels(config: SweepConfig, mode: "sync" | "batch"): ProviderModels;
  requireApiKey(config?: SweepConfig): string;
  getAuthMode?(): "api_key" | "claude_oauth" | "codex_cli" | "gemini_oauth" | null;
  runLane(config: SweepConfig, lane: Lane): Promise<LaneResult>;
  runSynthesis(
    config: SweepConfig,
    laneResults: LaneResult[],
    sourcesName: string
  ): Promise<{ markdown: string; tokensIn: number; tokensOut: number; reasoningOut?: number; openaiCachedIn?: number; openaiCacheWriteIn?: number }>;
  submitBatchLanes(config: SweepConfig): Promise<string>;
  getBatchStatus(batchId: string): Promise<BatchStatus>;
  collectBatchResults(batchId: string, lanes: Lane[], submittedModel?: string): Promise<LaneResult[]>;
  submitBatchSynthesis?(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<string>;
  collectBatchSynthesisResult?(batchId: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number; reasoningOut?: number; openaiCachedIn?: number; openaiCacheWriteIn?: number }>;
  // Batch-recovery path (`--resubmit-failed`). Claude-only for now — the
  // Batches API best practice of resubmitting exactly the failed custom_ids
  // (errored/expired/canceled are unbilled) doesn't map onto the OpenAI/Gemini
  // adapters' batch shapes yet. Both are optional so callers must feature-test
  // rather than assume every provider supports recovery; the CLI prints a
  // clear "provider does not support --resubmit-failed" error when absent.
  getBatchLaneFailures?(batchId: string, lanes: Lane[]): Promise<BatchLaneFailure[]>;
  submitBatchLanesSubset?(config: SweepConfig, lanes: Lane[]): Promise<string>;
}

export interface BatchLaneFailure {
  lane: Lane;
  resultType: string;
}
