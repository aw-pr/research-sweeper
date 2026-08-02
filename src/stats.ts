import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Store output paths relative to the home dir so runs/stats.json stays
// publish-safe regardless of whether the output dir resolved to an absolute
// path or a literal "~". Without this, runs under $HOME leak machine paths.
export function toHomeRelative(filePath: string): string {
  const home = os.homedir();
  if (filePath === home) return "~";
  if (filePath.startsWith(home + path.sep)) return "~" + filePath.slice(home.length);
  // Paths outside $HOME (e.g. a scratchpad under /private/tmp) carry a
  // machine-specific, often uid-tagged prefix. Keep only the basename so run
  // records never leak the absolute location.
  return path.isAbsolute(filePath) ? path.basename(filePath) : filePath;
}
import { getProvider } from "./providers";
import { LaneResult, Provider, ProviderModels, RunStats, SweepConfig, TokenBreakdown } from "./types";

interface ModelPricing {
  inPer1M: number;
  outPer1M: number;
  // OpenAI prices prompt-cache reads separately. Other providers keep their
  // cache accounting in cacheCreateIn/cacheReadIn below.
  cachedInPer1M?: number;
  cacheWriteInPer1M?: number;
}

const MODEL_PRICING: Record<Provider, Record<string, ModelPricing>> = {
  claude: {
    "claude-haiku-4-5-20251001": { inPer1M: 1.0, outPer1M: 5.0 },
    "claude-sonnet-4-6": { inPer1M: 3.0, outPer1M: 15.0 },
    // Sonnet 5 standard rate matches 4-6; the intro $2/$10 runs through
    // 2026-08-31, and its newer tokenizer emits ~30% more tokens per unit text.
    "claude-sonnet-5": { inPer1M: 3.0, outPer1M: 15.0 },
    "claude-opus-4-5": { inPer1M: 5.0, outPer1M: 25.0 },
    "claude-opus-4-7": { inPer1M: 5.0, outPer1M: 25.0 },
    "claude-opus-4-8": { inPer1M: 5.0, outPer1M: 25.0 },
    "claude-fable-5": { inPer1M: 10.0, outPer1M: 50.0 },
  },
  openai: {
    // List (non-batch) rates. computeRunCost applies the published 50% Batch
    // API discount once, per lane/synthesis leg. These used to be batch rates
    // and were discounted again, understating OpenAI batch spend by half.
    "gpt-5.6-sol": { inPer1M: 5.0, cachedInPer1M: 0.5, cacheWriteInPer1M: 6.25, outPer1M: 30.0 },
    // Terra/Luna reflect the 2026-07-30 OpenAI price cut (Terra -20%, Luna -80%).
    "gpt-5.6-terra": { inPer1M: 2.0, cachedInPer1M: 0.2, cacheWriteInPer1M: 2.5, outPer1M: 12.0 },
    "gpt-5.6-luna": { inPer1M: 0.2, cachedInPer1M: 0.02, cacheWriteInPer1M: 0.25, outPer1M: 1.2 },
    "gpt-5.4-mini": { inPer1M: 0.75, cachedInPer1M: 0.075, outPer1M: 4.5 },
    "gpt-5-mini": { inPer1M: 0.25, cachedInPer1M: 0.025, outPer1M: 2.0 },
    "gpt-5.4": { inPer1M: 2.5, cachedInPer1M: 0.25, outPer1M: 15.0 },
    "gpt-5.5": { inPer1M: 5.0, cachedInPer1M: 0.5, outPer1M: 30.0 },
  },
  // Verified May 2026 against ai.google.dev/gemini-api/docs/pricing.
  // gemini-2.5-pro uses tiered pricing (>200K context costs more); the
  // <=200K-context rate is recorded here as the common case.
  gemini: {
    "gemini-2.5-flash-lite": { inPer1M: 0.10, outPer1M: 0.40 },
    "gemini-2.5-flash": { inPer1M: 0.30, outPer1M: 2.50 },
    "gemini-2.5-pro": { inPer1M: 1.25, outPer1M: 10.0 },
  },
};

function runsDir(): string {
  return path.join(__dirname, "..", "runs");
}

function statsFilePath(): string {
  return path.join(runsDir(), "stats.json");
}

export function generateRunId(config: SweepConfig, mode: "sync" | "batch"): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = config.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  return `${ts}-${config.provider}-${mode}-${slug}`;
}

// Anthropic prompt-caching multipliers, applied against the model's input rate.
// Cache writes (first-time creation of an ephemeral block) bill at 1.25x input.
// Cache reads (subsequent requests that match the cached prefix) bill at 0.10x.
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.10;
const OPENAI_WEB_SEARCH_PER_CALL_USD = 0.01;

// Usage arrives from provider responses and batch payloads. Ignore malformed
// optional telemetry rather than letting a negative/NaN/Infinity cache count
// corrupt the estimate.
function clampOptionalUsage(value: number | undefined, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || value === undefined || value <= 0 || maximum <= 0) return 0;
  return Math.min(value, maximum);
}

function nonNegativeFinite(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0;
}

// A batch run always batches its lanes, but synthesis is a separate decision.
// Callers that know which path ran pass synthesisBatched explicitly; the
// default assumes it followed the lanes.
export function computeRunCost(
  provider: Provider,
  tokens: TokenBreakdown,
  models: ProviderModels,
  isBatch: boolean,
  synthesisBatched: boolean = isBatch
): number {
  const pricing = MODEL_PRICING[provider];
  const lanePricing = pricing[models.lane];
  const synthesisPricing = pricing[models.synthesis];
  if (!lanePricing || !synthesisPricing) return 0;
  const discount = isBatch ? 0.5 : 1;
  const synthesisDiscount = synthesisBatched ? 0.5 : 1;
  // Base lane + synthesis token costs. OpenAI cache-hit input is included in
  // input_tokens, so replace its normal-rate component rather than add it.
  const laneCachedIn = provider === "openai" ? clampOptionalUsage(tokens.openaiLaneCachedIn, tokens.lanesIn) : 0;
  const synthesisCachedIn = provider === "openai" ? clampOptionalUsage(tokens.openaiSynthesisCachedIn, tokens.synthesisIn) : 0;
  // Cache reads and writes are both already part of input_tokens. Clamp writes
  // against the remainder after reads so bad/mixed telemetry never prices more
  // than the input total.
  const laneCacheWriteIn = provider === "openai" ? clampOptionalUsage(tokens.openaiLaneCacheWriteIn, tokens.lanesIn - laneCachedIn) : 0;
  const synthesisCacheWriteIn = provider === "openai" ? clampOptionalUsage(tokens.openaiSynthesisCacheWriteIn, tokens.synthesisIn - synthesisCachedIn) : 0;
  const laneInputCost =
    ((tokens.lanesIn - laneCachedIn - laneCacheWriteIn) / 1e6) * lanePricing.inPer1M +
    (laneCachedIn / 1e6) * (lanePricing.cachedInPer1M ?? lanePricing.inPer1M) +
    (laneCacheWriteIn / 1e6) * (lanePricing.cacheWriteInPer1M ?? lanePricing.inPer1M);
  const synthesisInputCost =
    ((tokens.synthesisIn - synthesisCachedIn - synthesisCacheWriteIn) / 1e6) * synthesisPricing.inPer1M +
    (synthesisCachedIn / 1e6) * (synthesisPricing.cachedInPer1M ?? synthesisPricing.inPer1M) +
    (synthesisCacheWriteIn / 1e6) * (synthesisPricing.cacheWriteInPer1M ?? synthesisPricing.inPer1M);
  const laneCost = (laneInputCost + (tokens.lanesOut / 1e6) * lanePricing.outPer1M) * discount;
  const synthesisCost = (synthesisInputCost + (tokens.synthesisOut / 1e6) * synthesisPricing.outPer1M) * synthesisDiscount;
  // Anthropic prompt-caching adjustments. The aggregated cache token counts
  // come from lanes only — the synthesis pass is deliberately uncached (no
  // shared prefix across a sweep to cache; see providers/claude.ts), priced
  // at the lane-model's input rate.
  const cacheCreate = ((tokens.cacheCreateIn || 0) / 1e6) * lanePricing.inPer1M * CACHE_WRITE_MULT * discount;
  const cacheRead = ((tokens.cacheReadIn || 0) / 1e6) * lanePricing.inPer1M * CACHE_READ_MULT * discount;
  // Responses usage.output_tokens already includes reasoning tokens. Retain
  // reasoningOut as a quality/effort signal, but never charge it twice.
  const openaiWebSearchCost = provider === "openai" ? nonNegativeFinite(tokens.openaiWebSearchCalls) * OPENAI_WEB_SEARCH_PER_CALL_USD : 0;
  return Math.round((laneCost + synthesisCost + cacheCreate + cacheRead + openaiWebSearchCost) * 1_000_000) / 1_000_000;
}

function openAICostEstimateNotes(tokens: TokenBreakdown): string[] | undefined {
  const notes: string[] = [];
  if (
    tokens.openaiLaneCachedIn === undefined ||
    tokens.openaiSynthesisCachedIn === undefined ||
    tokens.openaiLaneCacheWriteIn === undefined ||
    tokens.openaiSynthesisCacheWriteIn === undefined
  ) {
    notes.push("OpenAI cache read/write usage was unavailable; unreported input is priced at the normal input rate.");
  }
  if (tokens.openaiWebSearchCalls === undefined) {
    notes.push("OpenAI web-search call count was unavailable; web-search tool fees are excluded.");
  }
  return notes.length > 0 ? notes : undefined;
}

// Per-lane parse modes for the run record, so how often the tolerant parser's
// repair/salvage strategies fire stays observable per provider/route.
export function collectParseModes(laneResults: LaneResult[]): RunStats["parseModes"] {
  const modes: NonNullable<RunStats["parseModes"]> = {};
  for (const result of laneResults) {
    if (result.parseMode) modes[result.lane] = result.parseMode;
  }
  return Object.keys(modes).length > 0 ? modes : undefined;
}

export function buildRunStats(
  config: SweepConfig,
  mode: "sync" | "batch",
  durationSec: number | null,
  submittedAt: string | null,
  tokens: TokenBreakdown,
  outputFiles: string[],
  authMode?: RunStats["authMode"],
  parseModes?: RunStats["parseModes"],
  synthesisBatched: boolean = mode === "batch"
): RunStats {
  const provider = getProvider(config.provider);
  const models = provider.getModels(config, mode);
  return {
    runId: generateRunId(config, mode),
    timestamp: new Date().toISOString(),
    provider: config.provider,
    mode,
    topic: config.topic,
    depth: config.depth,
    lanes: config.lanes,
    fromYear: config.fromYear,
    toYear: config.toYear,
    test: config.test,
    durationSec,
    submittedAt,
    tokens,
    models,
    estimatedCostUSD: computeRunCost(config.provider, tokens, models, mode === "batch", synthesisBatched),
    ...(config.provider === "openai" ? { costEstimateNotes: openAICostEstimateNotes(tokens) } : {}),
    outputFiles: outputFiles.map(toHomeRelative),
    authMode,
    parseModes,
    synthesisBatched,
  };
}

export function appendRunStats(stats: RunStats): void {
  const dir = runsDir();
  const filePath = statsFilePath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let existing: RunStats[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = [];
    }
  }
  existing.push(stats);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
}

export function displayStats(): void {
  const filePath = statsFilePath();
  if (!fs.existsSync(filePath)) {
    console.log("No stats recorded yet. Run a sweep first.");
    return;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunStats[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.log("Stats file exists but contains no runs.");
    return;
  }

  const runs = parsed.map((run) => ({ ...run, provider: run.provider || "claude" }));
  const totalCost = runs.reduce((sum, run) => sum + run.estimatedCostUSD, 0);
  const totalTokensIn = runs.reduce((sum, run) => sum + run.tokens.totalIn, 0);
  const totalTokensOut = runs.reduce((sum, run) => sum + run.tokens.totalOut, 0);

  console.log(`
Research Sweep — Run Stats
==========================

Summary
-------
Total runs:     ${runs.length}
Total tokens:   ${totalTokensIn.toLocaleString()} in / ${totalTokensOut.toLocaleString()} out
Est. cost:      $${totalCost.toFixed(4)}
`);

  const recent = [...runs].reverse().slice(0, 20);
  const width = 130;
  console.log(`Recent Runs (last ${recent.length})
${"─".repeat(width)}
${"#".padEnd(3)}  ${"Timestamp".padEnd(19)}  ${"Prov".padEnd(6)}  ${"Mode".padEnd(5)}  ${"Dep".padEnd(3)}  ${"Topic".padEnd(32)}  ${"Tokens In".padStart(10)}  ${"Tokens Out".padStart(10)}  ${"Cost USD".padStart(9)}
${"─".repeat(width)}`);

  recent.forEach((run, index) => {
    console.log(
      `${String(recent.length - index).padEnd(3)}  ${run.timestamp.replace("T", " ").slice(0, 19)}  ${run.provider.padEnd(6)}  ${run.mode.padEnd(5)}  ${run.depth.slice(0, 3).padEnd(3)}  ${run.topic.slice(0, 32).padEnd(32)}  ${run.tokens.totalIn.toLocaleString().padStart(10)}  ${run.tokens.totalOut.toLocaleString().padStart(10)}  ${`$${run.estimatedCostUSD.toFixed(4)}`.padStart(9)}`
    );
  });
  console.log("─".repeat(width));
}
