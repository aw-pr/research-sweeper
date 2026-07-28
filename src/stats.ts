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

const MODEL_PRICING: Record<Provider, Record<string, { inPer1M: number; outPer1M: number }>> = {
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
    "gpt-5.6-sol": { inPer1M: 2.5, outPer1M: 15.0 },
    "gpt-5.6-terra": { inPer1M: 1.25, outPer1M: 7.5 },
    "gpt-5.6-luna": { inPer1M: 0.5, outPer1M: 3.0 },
    "gpt-5.4-mini": { inPer1M: 0.75, outPer1M: 4.5 },
    "gpt-5-mini": { inPer1M: 0.25, outPer1M: 2.0 },
    "gpt-5.4": { inPer1M: 2.5, outPer1M: 15.0 },
    "gpt-5.5": { inPer1M: 5.0, outPer1M: 30.0 },
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

// A batch run always batches its lanes, but synthesis is a separate decision:
// claude and gemini submit it as its own batch job, while openai has no
// batch-synthesis endpoint wired up and runs it synchronously at full price.
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
  // Base lane + synthesis token costs.
  const laneCost = ((tokens.lanesIn / 1e6) * lanePricing.inPer1M + (tokens.lanesOut / 1e6) * lanePricing.outPer1M) * discount;
  const synthesisCost = ((tokens.synthesisIn / 1e6) * synthesisPricing.inPer1M + (tokens.synthesisOut / 1e6) * synthesisPricing.outPer1M) * synthesisDiscount;
  // Anthropic prompt-caching adjustments. The aggregated cache token counts
  // come from lanes only — the synthesis pass is deliberately uncached (no
  // shared prefix across a sweep to cache; see providers/claude.ts), priced
  // at the lane-model's input rate.
  const cacheCreate = ((tokens.cacheCreateIn || 0) / 1e6) * lanePricing.inPer1M * CACHE_WRITE_MULT * discount;
  const cacheRead = ((tokens.cacheReadIn || 0) / 1e6) * lanePricing.inPer1M * CACHE_READ_MULT * discount;
  // OpenAI Responses API reasoning tokens bill at the output rate. Most of
  // the reasoning spend comes from the synthesis pass (gpt-5.6-sol with
  // reasoning.effort=high), so price reasoning at the synthesis output rate.
  const reasoningCost = ((tokens.reasoningOut || 0) / 1e6) * synthesisPricing.outPer1M;
  return Math.round((laneCost + synthesisCost + cacheCreate + cacheRead + reasoningCost) * 1_000_000) / 1_000_000;
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
