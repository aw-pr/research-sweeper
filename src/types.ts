export type Provider = "claude" | "openai";
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
  claudeAuth?: "api_key" | "claude_oauth";
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

export interface LaneResult {
  lane: Lane;
  label: string;
  sources: SourceItem[];
  narrative: string;
  model_context?: string;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreateIn?: number;
  cacheReadIn?: number;
  // OpenAI Responses API: reasoning tokens consumed in the output budget
  // when reasoning.effort is set. Captured separately so they price correctly.
  reasoningOut?: number;
  model: string;
  searchesFired?: number;
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
}

export interface TokenBreakdown {
  lanesIn: number;
  lanesOut: number;
  synthesisIn: number;
  synthesisOut: number;
  totalIn: number;
  totalOut: number;
  // Anthropic prompt-caching tokens. Cache writes bill at 1.25x input price,
  // cache reads at 0.10x input price. Aggregated across lanes + synthesis.
  cacheCreateIn?: number;
  cacheReadIn?: number;
  // OpenAI Responses API reasoning tokens. Billed at the same rate as output
  // tokens. Aggregated across lanes + synthesis.
  reasoningOut?: number;
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
  outputFiles: string[];
  authMode?: "api_key" | "claude_oauth" | "codex_cli";
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
  getAuthMode?(): "api_key" | "claude_oauth" | "codex_cli" | null;
  runLane(config: SweepConfig, lane: Lane): Promise<LaneResult>;
  runSynthesis(
    config: SweepConfig,
    laneResults: LaneResult[],
    sourcesName: string
  ): Promise<{ markdown: string; tokensIn: number; tokensOut: number }>;
  submitBatchLanes(config: SweepConfig): Promise<string>;
  getBatchStatus(batchId: string): Promise<BatchStatus>;
  collectBatchResults(batchId: string, lanes: Lane[], submittedModel?: string): Promise<LaneResult[]>;
  submitBatchSynthesis?(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<string>;
  collectBatchSynthesisResult?(batchId: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number }>;
}
