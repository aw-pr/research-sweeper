#!/usr/bin/env npx ts-node

import * as path from "path";
import * as readline from "readline";
import { parseBriefFile } from "./src/brief";
import { DEPTH_CONFIG, LANE_CONFIG } from "./src/config";
import { runAuthCheck } from "./src/auth-check";
import { loadDotEnv, researchRoot } from "./src/env";
import { saveJob } from "./src/jobs";
import { classifyLaneOutcomes, defaultMinLanes } from "./src/lane-outcomes";
import { computeFileNames, prepareOutputTarget, writeOutput } from "./src/output";
import { getProvider } from "./src/providers";
import { appendRunStats, buildRunStats, displayStats } from "./src/stats";
import { LaneResult, Provider, SweepConfig, SweepJob, TokenBreakdown } from "./src/types";
import { applyAuthFlag, parseAuthOverrides } from "./src/cli/auth-flags";
import { getPollIntervalMs, listBatches, resumeBatch, resubmitFailedBatch, waitAllBatches } from "./src/cli/batches";
import { capLaneSourcesByDepth, reSynthesise } from "./src/cli/synthesis";

type FlagHandler = (config: Partial<SweepConfig>, nextArg: () => string) => void;

function authFlagHandler(flag: string): FlagHandler {
  return (config, nextArg) => {
    applyAuthFlag(config, flag, nextArg());
  };
}

// Every run-mode flag in one place: parseArgs dispatches on this table and
// main() derives its hasRunArgs check from the keys, so adding a flag is a
// single-entry change. Mode selectors (--sync/--batch/--wait/--poll/...) are
// deliberately absent — they are read directly off rawArgs in main().
const RUN_FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--provider": (config, nextArg) => {
    config.provider = nextArg() as Provider;
  },
  "--topic": (config, nextArg) => {
    config.topic = nextArg();
  },
  "--brief-file": (config, nextArg) => {
    config.briefFile = nextArg();
  },
  "--from": (config, nextArg) => {
    config.fromYear = parseInt(nextArg(), 10);
  },
  "--to": (config, nextArg) => {
    config.toYear = parseInt(nextArg(), 10);
  },
  "--lanes": (config, nextArg) => {
    config.lanes = nextArg().split(",").map((lane) => lane.trim()) as SweepConfig["lanes"];
  },
  "--depth": (config, nextArg) => {
    config.depth = nextArg() as SweepConfig["depth"];
  },
  "--folder": (config, nextArg) => {
    config.outputDir = path.join(researchRoot(), nextArg());
  },
  "--output": (config, nextArg) => {
    config.outputDir = nextArg();
  },
  "--breadth": (config) => {
    config.depth = "shallow";
  },
  "--test": (config) => {
    config.test = true;
  },
  "--overwrite": (config) => {
    config.overwrite = true;
  },
  "--no-search": (config) => {
    config.noSearch = true;
  },
  "--lane-model": (config, nextArg) => {
    config.laneModel = nextArg() as SweepConfig["laneModel"];
  },
  "--lane-model-id": (config, nextArg) => {
    config.laneModelId = nextArg();
  },
  "--synthesis-model": (config, nextArg) => {
    config.synthesisModel = nextArg();
  },
  "--min-lanes": (config, nextArg) => {
    const raw = nextArg();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0) throw new Error(`Error: --min-lanes expects a non-negative integer, got "${raw}"`);
    (config as { minLanes?: number }).minLanes = value;
  },
  "--claude-auth": authFlagHandler("--claude-auth"),
  "--gemini-auth": authFlagHandler("--gemini-auth"),
  "--openai-auth": authFlagHandler("--openai-auth"),
};

function parseArgs(): Partial<SweepConfig> {
  const args = process.argv.slice(2);
  const config: Partial<SweepConfig> = { provider: "claude", overwrite: false };
  let i = 0;
  const nextArg = () => args[++i];
  for (i = 0; i < args.length; i++) {
    RUN_FLAG_HANDLERS[args[i]]?.(config, nextArg);
  }
  return config;
}

async function promptUser(question: string, defaultVal?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

async function resolveConfig(partial: Partial<SweepConfig>): Promise<SweepConfig> {
  const parsedBrief = partial.briefFile ? parseBriefFile(partial.briefFile) : undefined;
  const topic = partial.topic || parsedBrief?.topic || (await promptUser("Research topic"));
  const fromYear = partial.fromYear || parseInt(await promptUser("From year", "2019"), 10);

  let toYear: number | null;
  if (partial.toYear !== undefined) toYear = partial.toYear;
  else if (partial.topic || partial.briefFile) toYear = null;
  else {
    const toYearValue = await promptUser("To year (leave empty for present)", "");
    toYear = toYearValue === "" ? null : parseInt(toYearValue, 10);
  }

  let lanes = partial.lanes;
  if (!lanes) {
    const laneStr = await promptUser("Source lanes (financial, frontier, academic, vc, blogs, tech — comma separated)", "financial,frontier,academic,vc,blogs,tech");
    lanes = laneStr.split(",").map((lane) => lane.trim()) as SweepConfig["lanes"];
  }

  const depth = partial.depth || ((await promptUser("Depth (shallow/standard/deep)", "shallow")) as SweepConfig["depth"]);
  let outputDir = partial.outputDir;
  if (!outputDir) {
    const defaultFolder = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const folderName = await promptUser(`Research folder name (under ${researchRoot()}/)`, defaultFolder);
    outputDir = path.join(researchRoot(), folderName);
  }

  return {
    provider: partial.provider || "claude",
    topic,
    briefFile: parsedBrief?.briefFile || partial.briefFile,
    briefTitle: parsedBrief?.title,
    briefing: partial.briefing || parsedBrief?.briefing,
    fromYear,
    toYear,
    lanes,
    depth,
    outputDir,
    test: partial.test ?? false,
    overwrite: partial.overwrite ?? false,
    noSearch: partial.noSearch,
    laneModel: partial.laneModel,
    synthesisModel: partial.synthesisModel,
    laneModelId: partial.laneModelId,
    claudeAuth: partial.claudeAuth,
    geminiAuth: partial.geminiAuth,
    openaiAuth: partial.openaiAuth,
    minLanes: partial.minLanes,
  };
}

async function main(): Promise<void> {
  loadDotEnv();
  const rawArgs = process.argv.slice(2);
  const hasRunArgs = Object.keys(RUN_FLAG_HANDLERS).some((flag) => rawArgs.includes(flag));

  if (rawArgs.includes("--auth-check")) {
    const envFileIndex = rawArgs.indexOf("--env-file");
    const envFile = envFileIndex !== -1 && rawArgs[envFileIndex + 1] ? rawArgs[envFileIndex + 1] : ".env";
    const authCheckIndex = rawArgs.indexOf("--auth-check");
    const maybeTarget = authCheckIndex !== -1 ? rawArgs[authCheckIndex + 1] : undefined;
    const target = maybeTarget && !maybeTarget.startsWith("--") ? maybeTarget : "all";
    await runAuthCheck(envFile, target as Parameters<typeof runAuthCheck>[1]);
    return;
  }

  if (rawArgs.includes("--list")) {
    await listBatches();
    return;
  }

  if (rawArgs.includes("--wait-all") && !hasRunArgs) {
    await waitAllBatches(getPollIntervalMs(rawArgs));
    return;
  }

  const reSynthIndex = rawArgs.indexOf("--re-synthesise");
  if (reSynthIndex !== -1) {
    const folder = rawArgs[reSynthIndex + 1];
    if (!folder || folder.startsWith("--")) throw new Error("Error: --re-synthesise requires a folder name");
    const fromBatchIndex = rawArgs.indexOf("--from-batch");
    await reSynthesise(folder, fromBatchIndex !== -1 ? rawArgs[fromBatchIndex + 1] : undefined, parseAuthOverrides(rawArgs));
    return;
  }

  if (rawArgs.includes("--stats")) {
    displayStats();
    return;
  }

  const resumeIndex = rawArgs.indexOf("--resume");
  if (resumeIndex !== -1) {
    const batchId = rawArgs[resumeIndex + 1];
    if (!batchId || batchId.startsWith("--")) throw new Error("Error: --resume requires a batch ID");
    await resumeBatch(batchId);
    return;
  }

  const resubmitFailedIndex = rawArgs.indexOf("--resubmit-failed");
  if (resubmitFailedIndex !== -1) {
    const batchId = rawArgs[resubmitFailedIndex + 1];
    if (!batchId || batchId.startsWith("--")) throw new Error("Error: --resubmit-failed requires a batch ID");
    await resubmitFailedBatch(batchId);
    return;
  }

  const partial = parseArgs();
  const config = await resolveConfig(partial);
  const provider = getProvider(config.provider);
  provider.requireApiKey(config);

  const validLanes = config.lanes.filter((lane) => Boolean(LANE_CONFIG[lane]));
  if (validLanes.length === 0) throw new Error("Error: no valid lanes specified. Valid options: financial, frontier, academic, vc, blogs, tech");
  config.lanes = validLanes;

  const files = computeFileNames(config.topic);
  const { stubPath } = prepareOutputTarget(config, files, { allowOverwrite: config.overwrite, createStub: true });
  const depthInfo = DEPTH_CONFIG[config.depth];
  if (rawArgs.includes("--batch") && rawArgs.includes("--sync")) {
    throw new Error("Error: --batch and --sync are mutually exclusive");
  }
  const batchMode = rawArgs.includes("--sync") ? false : true;
  if (batchMode && config.claudeAuth === "claude_oauth") {
    throw new Error("Error: --claude-auth claude-oauth is sync-only. The Anthropic batch API requires ANTHROPIC_API_KEY.");
  }
  if (batchMode && config.geminiAuth === "gemini_oauth") {
    throw new Error("Error: --gemini-auth gemini-oauth is sync-only. The Gemini batch API requires GEMINI_API_KEY.");
  }
  if (batchMode && config.openaiAuth === "codex_cli") {
    throw new Error("Error: --openai-auth codex is sync-only. The OpenAI batch API requires OPENAI_API_KEY.");
  }

  if (batchMode) {
    const models = provider.getModels(config, "batch");
    console.log(`
Batch Submit
------------
Provider: ${config.provider}
Topic:    ${config.topic}
Brief:    ${config.briefFile || "(none)"}
Range:    ${config.fromYear} to ${config.toYear ?? "present"}
Lanes:    ${config.lanes.join(", ")}
Depth:    ${config.depth} (${depthInfo.description})
Model:    ${models.lane}${config.test ? " [TEST MODE]" : ""}
Output:   ${config.outputDir}
Stub:     ${stubPath}
`);

    const batchId = await provider.submitBatchLanes(config);
    const job: SweepJob = {
      provider: config.provider,
      batchId,
      config,
      summaryName: files.summaryName,
      sourcesName: files.sourcesName,
      submittedAt: new Date().toISOString(),
      lanes: config.lanes,
    };
    saveJob(job);
    console.log(`Batch submitted: ${batchId}`);
    console.log(`Submitted: ${job.submittedAt}`);

    if (rawArgs.includes("--wait-all")) {
      await waitAllBatches(getPollIntervalMs(rawArgs));
    } else if (rawArgs.includes("--wait")) {
      const pollIntervalMs = getPollIntervalMs(rawArgs);
      const waitStart = Date.now();
      console.log(`\nWaiting for batch to complete (polling every ${Math.round(pollIntervalMs / 1000)}s)...`);
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const status = await provider.getBatchStatus(batchId);
        const elapsed = Math.round((Date.now() - waitStart) / 1000);
        console.log(`  [${new Date().toISOString().slice(11, 19)}] +${elapsed}s  status: ${status.status}  (processing: ${status.counts.processing}, succeeded: ${status.counts.succeeded}, errored: ${status.counts.errored})`);
        if (status.status === "completed" || status.status === "ended") break;
      }
      console.log(`\nBatch complete — resuming...`);
      await resumeBatch(batchId);
    } else {
      console.log(`\nResume with:\n  npx ts-node research-sweep.ts --resume ${batchId}`);
    }
    return;
  }

  const models = provider.getModels(config, "sync");
  console.log(`
Research Sweep
--------------
Provider: ${config.provider}
Topic:    ${config.topic}
Brief:    ${config.briefFile || "(none)"}
Range:    ${config.fromYear} to ${config.toYear ?? "present"}
Lanes:    ${config.lanes.join(", ")}
Depth:    ${config.depth} (${depthInfo.description})
Models:   lanes=${models.lane}, synthesis=${models.synthesis}${config.test ? " [TEST MODE]" : ""}
Output:   ${config.outputDir}

Starting parallel lane sweeps...
`);

  const startTime = Date.now();
  const settled = await Promise.allSettled(validLanes.map((lane) => provider.runLane(config, lane)));
  const outcomes = classifyLaneOutcomes(validLanes, settled);

  // Per-lane summary, classified.
  for (const outcome of outcomes) {
    if (outcome.kind === "success") {
      console.log(`  [lane:${outcome.lane}] OK — ${outcome.result!.sources.length} sources`);
    } else if (outcome.kind === "degraded") {
      console.warn(`  [lane:${outcome.lane}] DEGRADED — ${outcome.reason}`);
    } else {
      console.error(`  [lane:${outcome.lane}] REJECTED — ${outcome.reason}`);
    }
  }

  const successCount = outcomes.filter((entry) => entry.kind === "success").length;
  const minLanes = config.minLanes !== undefined ? config.minLanes : defaultMinLanes(validLanes.length);
  if (successCount < minLanes) {
    console.error(
      `\nAborting before synthesis: only ${successCount} of ${validLanes.length} lanes succeeded (need >=${minLanes}). ` +
        `Override with --min-lanes <n> if you want to force-synthesise.`
    );
    process.exit(2);
  }

  // Build the lane results we will actually feed to synthesis. Include degraded
  // results (they may still carry useful model_context) but exclude rejected
  // lanes, which never produced a LaneResult.
  const laneResults = capLaneSourcesByDepth(
    config,
    outcomes.filter((entry) => entry.result !== undefined).map((entry) => entry.result as LaneResult)
  );
  const laneTotals = laneResults.reduce(
    (acc, result) => ({
      in: acc.in + result.tokensIn,
      out: acc.out + result.tokensOut,
      cacheCreate: acc.cacheCreate + (result.cacheCreateIn || 0),
      cacheRead: acc.cacheRead + (result.cacheReadIn || 0),
      reasoning: acc.reasoning + (result.reasoningOut || 0),
    }),
    { in: 0, out: 0, cacheCreate: 0, cacheRead: 0, reasoning: 0 }
  );
  console.log(`\nAll lanes complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s — lanes total: ${laneTotals.in.toLocaleString()} in / ${laneTotals.out.toLocaleString()} out`);

  const synthesis = await provider.runSynthesis(config, laneResults, files.sourcesName);
  const synthCacheCreate = (synthesis as { cacheCreateIn?: number }).cacheCreateIn || 0;
  const synthCacheRead = (synthesis as { cacheReadIn?: number }).cacheReadIn || 0;
  const synthReasoning = (synthesis as { reasoningOut?: number }).reasoningOut || 0;
  const output = writeOutput(config, synthesis.markdown, laneResults, files, models.synthesis, { allowOverwrite: config.overwrite });
  const totalTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
  const tokens: TokenBreakdown = {
    lanesIn: laneTotals.in,
    lanesOut: laneTotals.out,
    synthesisIn: synthesis.tokensIn,
    synthesisOut: synthesis.tokensOut,
    totalIn: laneTotals.in + synthesis.tokensIn,
    totalOut: laneTotals.out + synthesis.tokensOut,
    cacheCreateIn: laneTotals.cacheCreate + synthCacheCreate,
    cacheReadIn: laneTotals.cacheRead + synthCacheRead,
    reasoningOut: laneTotals.reasoning + synthReasoning,
  };

  // Single observable line proving prompt caching is firing on the API path.
  if (tokens.cacheCreateIn || tokens.cacheReadIn) {
    const lanePricing = provider.provider === "claude" ? 3.0 : 0; // rough placeholder; cost saving is illustrative
    const savedRough = ((tokens.cacheReadIn || 0) / 1e6) * lanePricing * 0.9;
    const fmt = (n: number) => `${(n / 1000).toFixed(1)}k`;
    console.log(`cache: ${fmt(tokens.cacheCreateIn || 0)} created, ${fmt(tokens.cacheReadIn || 0)} read (saved ~$${savedRough.toFixed(4)})`);
  }

  const runAuthMode = provider.getAuthMode?.() ?? undefined;
  appendRunStats(buildRunStats(config, "sync", totalTime, null, tokens, [output.summaryPath, output.sourcesPath, ...output.lanesPaths], runAuthMode));

  console.log(`
Done in ${totalTime}s
Tokens:  ${tokens.totalIn.toLocaleString()} in / ${tokens.totalOut.toLocaleString()} out (total)
Summary: ${output.summaryPath}
Sources: ${output.sourcesPath}
Lanes:   ${path.join(path.dirname(output.sourcesPath), "lanes")} (${output.lanesPaths.length} files + lanes JSON)
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
