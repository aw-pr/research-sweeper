#!/usr/bin/env npx ts-node

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { parseBriefFile } from "./src/brief";
import { DEPTH_CONFIG, LANE_CONFIG } from "./src/config";
import { runAuthCheck } from "./src/auth-check";
import { loadDotEnv, researchRoot } from "./src/env";
import { deleteJob, jobsDir, loadJob, saveJob } from "./src/jobs";
import { classifyLaneOutcomes, defaultMinLanes } from "./src/lane-outcomes";
import { computeFileNames, prepareOutputTarget, writeOutput } from "./src/output";
import { getProvider } from "./src/providers";
import { appendRunStats, buildRunStats, displayStats } from "./src/stats";
import { LaneResult, Provider, SweepConfig, SweepJob, TokenBreakdown } from "./src/types";

function parseArgs(): Partial<SweepConfig> {
  const args = process.argv.slice(2);
  const config: Partial<SweepConfig> = { provider: "claude", overwrite: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--provider":
        config.provider = args[++i] as Provider;
        break;
      case "--topic":
        config.topic = args[++i];
        break;
      case "--brief-file":
        config.briefFile = args[++i];
        break;
      case "--from":
        config.fromYear = parseInt(args[++i], 10);
        break;
      case "--to":
        config.toYear = parseInt(args[++i], 10);
        break;
      case "--lanes":
        config.lanes = args[++i].split(",").map((lane) => lane.trim()) as SweepConfig["lanes"];
        break;
      case "--depth":
        config.depth = args[++i] as SweepConfig["depth"];
        break;
      case "--folder":
        config.outputDir = path.join(researchRoot(), args[++i]);
        break;
      case "--output":
        config.outputDir = args[++i];
        break;
      case "--breadth":
        config.depth = "shallow";
        break;
      case "--test":
        config.test = true;
        break;
      case "--overwrite":
        config.overwrite = true;
        break;
      case "--no-search":
        config.noSearch = true;
        break;
      case "--lane-model":
        config.laneModel = args[++i] as SweepConfig["laneModel"];
        break;
      case "--synthesis-model":
        config.synthesisModel = args[++i];
        break;
      case "--min-lanes": {
        const raw = args[++i];
        const value = parseInt(raw, 10);
        if (Number.isNaN(value) || value < 0) throw new Error(`Error: --min-lanes expects a non-negative integer, got "${raw}"`);
        (config as { minLanes?: number }).minLanes = value;
        break;
      }
      case "--claude-auth": {
        const raw = args[++i];
        if (raw === "api-key" || raw === "api_key") config.claudeAuth = "api_key";
        else if (raw === "claude-oauth" || raw === "claude_oauth" || raw === "agent-sdk" || raw === "agent_sdk" || raw === "claude-cli" || raw === "claude_cli") config.claudeAuth = "claude_oauth";
        else throw new Error(`Error: --claude-auth expects "api-key" or "claude-oauth", got "${raw}"`);
        break;
      }
    }
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
    claudeAuth: partial.claudeAuth,
    minLanes: partial.minLanes,
  };
}

function getPollIntervalMs(rawArgs: string[]): number {
  const idx = rawArgs.indexOf("--poll");
  if (idx !== -1 && rawArgs[idx + 1]) return parseInt(rawArgs[idx + 1], 10) * 1000;
  return 30_000;
}

function readFolderConfig(outputDir: string): SweepConfig {
  const files = fs.readdirSync(outputDir).filter((file) => file.startsWith("summary-") && file.endsWith(".md"));
  if (files.length === 0) throw new Error(`No summary file found in: ${outputDir}`);
  const raw = fs.readFileSync(path.join(outputDir, files[0]), "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error("Could not parse frontmatter");
  const frontmatter = fmMatch[1];
  const get = (key: string) => {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : "";
  };

  const provider = (get("provider") || "claude") as Provider;
  const topic = unquoteYamlScalar(get("topic"));
  const briefTitleRaw = get("brief_title");
  const briefFileRaw = get("brief_file");
  const fromYear = parseInt(get("from"), 10) || 2021;
  const toRaw = get("to");
  const toYear = toRaw === "present" ? null : parseInt(toRaw, 10);
  const depth = (get("depth") || "standard") as SweepConfig["depth"];
  const lanes = get("lanes").replace(/[\[\]]/g, "").split(",").map((lane) => lane.trim()).filter(Boolean) as SweepConfig["lanes"];
  return {
    provider,
    topic,
    briefFile: briefFileRaw ? unquoteYamlScalar(briefFileRaw) : undefined,
    briefTitle: briefTitleRaw ? unquoteYamlScalar(briefTitleRaw) : undefined,
    briefing: undefined,
    fromYear,
    toYear,
    lanes,
    depth,
    outputDir,
    test: false,
    overwrite: false,
  };
}

function unquoteYamlScalar(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  return value;
}

function capLaneSourcesByDepth(config: SweepConfig, laneResults: LaneResult[]): LaneResult[] {
  const maxSources = DEPTH_CONFIG[config.depth].sourcesPerLane;
  return laneResults.map((result) => ({
    ...result,
    sources: result.sources.slice(0, maxSources),
  }));
}

async function runSynthesisOptimised(
  provider: ReturnType<typeof getProvider>,
  config: SweepConfig,
  laneResults: LaneResult[],
  sourcesName: string
): Promise<{ markdown: string; tokensIn: number; tokensOut: number }> {
  if (!provider.submitBatchSynthesis || !provider.collectBatchSynthesisResult) {
    return provider.runSynthesis(config, laneResults, sourcesName);
  }

  console.log("\n  [Synthesis] Submitting as batch job...");
  const synthBatchId = await provider.submitBatchSynthesis(config, laneResults, sourcesName);
  const pollMs = 10_000;

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const status = await provider.getBatchStatus(synthBatchId);
    if (status.status === "completed" || status.status === "ended") break;
    console.log(`  [Synthesis] Waiting... (${status.status})`);
  }

  console.log("  [Synthesis] Collecting result...");
  const result = await provider.collectBatchSynthesisResult(synthBatchId);
  console.log(`  [Synthesis] Complete (${result.tokensIn.toLocaleString()} in / ${result.tokensOut.toLocaleString()} out)`);
  return result;
}

async function resumeBatch(batchId: string): Promise<void> {
  const job = loadJob(batchId);
  const provider = getProvider(job.provider);
  const status = await provider.getBatchStatus(batchId);

  if (status.status !== "completed" && status.status !== "ended") {
    console.log(`Batch ${batchId} — provider: ${job.provider} — status: ${status.status}`);
    console.log(`  processing: ${status.counts.processing}, succeeded: ${status.counts.succeeded}, errored: ${status.counts.errored}`);
    console.log(`  submitted: ${job.submittedAt}`);
    console.log(`\nResume with:\n  npx ts-node research-sweep.ts --resume ${batchId}`);
    return;
  }

  console.log(`Batch complete — retrieving results...`);
  const submittedLaneModel = provider.getModels(job.config, "batch").lane;
  const laneResults = capLaneSourcesByDepth(job.config, await provider.collectBatchResults(batchId, job.lanes, submittedLaneModel));
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
  const synthesis = await runSynthesisOptimised(provider, job.config, laneResults, job.sourcesName);
  const files = computeFileNames(job.config.topic);
  const synthModel = provider.getModels(job.config, "batch").synthesis;
  const output = writeOutput(job.config, synthesis.markdown, laneResults, files, synthModel, { allowOverwrite: job.config.overwrite });
  deleteJob(batchId);

  const tokens: TokenBreakdown = {
    lanesIn: laneTotals.in,
    lanesOut: laneTotals.out,
    synthesisIn: synthesis.tokensIn,
    synthesisOut: synthesis.tokensOut,
    totalIn: laneTotals.in + synthesis.tokensIn,
    totalOut: laneTotals.out + synthesis.tokensOut,
    cacheCreateIn: laneTotals.cacheCreate,
    cacheReadIn: laneTotals.cacheRead,
    reasoningOut: laneTotals.reasoning,
  };
  appendRunStats(buildRunStats(job.config, "batch", null, job.submittedAt, tokens, [output.summaryPath, output.sourcesPath, ...output.lanesPaths], "api_key"));

  console.log(`
Tokens:  ${tokens.totalIn.toLocaleString()} in / ${tokens.totalOut.toLocaleString()} out (total)
Summary: ${output.summaryPath}
Sources: ${output.sourcesPath}
Lanes:   ${path.join(path.dirname(output.sourcesPath), "lanes")} (${output.lanesPaths.length} files + lanes JSON)
`);
}

async function listBatches(): Promise<void> {
  const dir = jobsDir();
  if (!fs.existsSync(dir)) {
    console.log("No batch jobs found.");
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtime.getTime() - fs.statSync(path.join(dir, a)).mtime.getTime());

  if (files.length === 0) {
    console.log("No batch jobs found.");
    return;
  }

  console.log(`\nBatch Jobs (${files.length})\n`);
  console.log(`${"#".padEnd(3)}  ${"Provider".padEnd(8)}  ${"ID".padEnd(32)}  ${"Submitted".padEnd(19)}  ${"Status".padEnd(12)}  ${"ok/err/run".padEnd(12)}  Topic`);
  console.log("─".repeat(120));

  let index = 1;
  for (const file of files) {
    const job = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as SweepJob;
    let status = "unknown";
    let counts = "";
    try {
      const provider = getProvider(job.provider);
      const batchStatus = await provider.getBatchStatus(job.batchId);
      status = batchStatus.status === "ended" ? "complete" : batchStatus.status;
      counts = `${batchStatus.counts.succeeded}/${batchStatus.counts.errored}/${batchStatus.counts.processing}`;
    } catch {
      status = "fetch error";
    }
    console.log(`${String(index).padEnd(3)}  ${job.provider.padEnd(8)}  ${job.batchId.padEnd(32)}  ${job.submittedAt.replace("T", " ").slice(0, 19).padEnd(19)}  ${status.padEnd(12)}  ${counts.padEnd(12)}  ${job.config.topic.slice(0, 45)}`);
    index++;
  }
  console.log();
}

async function waitAllBatches(pollIntervalMs: number): Promise<void> {
  const dir = jobsDir();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
  if (files.length === 0) {
    console.log("No pending batch jobs.");
    return;
  }

  const pending = new Map<string, SweepJob>();
  for (const file of files) {
    const batchId = path.basename(file, ".json");
    pending.set(batchId, loadJob(batchId));
  }

  console.log(`\nMonitoring ${pending.size} batch ${pending.size === 1 ? "job" : "jobs"} — polling every ${Math.round(pollIntervalMs / 1000)}s`);
  for (const [batchId, job] of pending) {
    console.log(`  • [${batchId.slice(-8)}] (${job.provider}) ${job.config.topic.slice(0, 60)}`);
  }

  const waitStart = Date.now();
  while (pending.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const elapsed = Math.round((Date.now() - waitStart) / 1000);
    const ts = new Date().toISOString().slice(11, 19);

    for (const [batchId, job] of [...pending.entries()]) {
      const provider = getProvider(job.provider);
      const status = await provider.getBatchStatus(batchId);
      const label = job.config.topic.slice(0, 34).padEnd(34);
      console.log(`  [${ts}] +${String(elapsed).padStart(5)}s  [${batchId.slice(-8)}] (${job.provider}) ${label}  ${status.status}  (${status.counts.processing} active / ${status.counts.succeeded} done)`);
      if (status.status === "completed" || status.status === "ended") {
        console.log(`\n  Resuming: ${job.config.topic}`);
        await resumeBatch(batchId);
        pending.delete(batchId);
        if (pending.size > 0) console.log(`\n  ${pending.size} job(s) still pending...\n`);
      }
    }
  }

  console.log("\nAll batches complete.");
}

async function reSynthesise(folder: string, batchId?: string): Promise<void> {
  const outputDir = path.join(researchRoot(), folder);
  const lanesDir = path.join(outputDir, "lanes");
  let config: SweepConfig;
  let lanes: LaneResult[];
  let source: string;

  const jsonFiles = fs.existsSync(lanesDir) ? fs.readdirSync(lanesDir).filter((file) => file.startsWith("lanes-") && file.endsWith(".json")) : [];
  if (jsonFiles.length > 0) {
    ({ config, lanes } = JSON.parse(fs.readFileSync(path.join(lanesDir, jsonFiles[0]), "utf-8")));
    config.provider = config.provider || "claude";
    source = "local cache";
  } else if (batchId) {
    const job = loadJob(batchId);
    const provider = getProvider(job.provider);
    config = readFolderConfig(outputDir);
    lanes = capLaneSourcesByDepth(config, await provider.collectBatchResults(batchId, config.lanes, provider.getModels(config, "batch").lane));
    source = `${job.provider} API (cached locally for future use)`;
  } else {
    throw new Error(`No lane cache found for "${folder}". Provide --from-batch <batchId> for pre-cache runs.`);
  }

  lanes = capLaneSourcesByDepth(config, lanes);
  const provider = getProvider(config.provider);
  const files = computeFileNames(config.topic);
  console.log(`
Re-synthesise
-------------
Provider: ${config.provider}
Topic:    ${config.topic}
Folder:   ${folder}
Lanes:    ${lanes.length} (${lanes.map((lane) => lane.label).join(", ")})
Depth:    ${config.depth}
Source:   ${source}
`);
  const synthesis = await runSynthesisOptimised(provider, config, lanes, files.sourcesName);
  const output = writeOutput(config, synthesis.markdown, lanes, files, undefined, { allowOverwrite: true });
  console.log(`Done (${synthesis.tokensIn.toLocaleString()} in / ${synthesis.tokensOut.toLocaleString()} out)`);
  console.log(`Summary: ${output.summaryPath}`);
}

async function main(): Promise<void> {
  loadDotEnv();
  const rawArgs = process.argv.slice(2);
  const hasRunArgs = ["--topic", "--brief-file", "--from", "--to", "--lanes", "--depth", "--folder", "--output", "--provider", "--test", "--breadth", "--overwrite", "--claude-auth", "--no-search", "--lane-model", "--synthesis-model", "--min-lanes"].some((flag) =>
    rawArgs.includes(flag)
  );

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
    await reSynthesise(folder, fromBatchIndex !== -1 ? rawArgs[fromBatchIndex + 1] : undefined);
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
