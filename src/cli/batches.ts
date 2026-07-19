// Batch-job lifecycle flows: --resume, --resubmit-failed, --list, --wait-all.

import * as fs from "fs";
import * as path from "path";
import { LANE_CONFIG } from "../config";
import { deleteJob, jobsDir, loadJob, saveJob } from "../jobs";
import { defaultMinLanes } from "../lane-outcomes";
import { computeFileNames, writeOutput } from "../output";
import { getProvider } from "../providers";
import { appendRunStats, buildRunStats, collectParseModes } from "../stats";
import { SweepConfig, SweepJob, TokenBreakdown } from "../types";
import { capLaneSourcesByDepth, runSynthesisOptimised } from "./synthesis";

export function getPollIntervalMs(rawArgs: string[]): number {
  const idx = rawArgs.indexOf("--poll");
  if (idx !== -1 && rawArgs[idx + 1]) return parseInt(rawArgs[idx + 1], 10) * 1000;
  return 30_000;
}

export async function resumeBatch(batchId: string): Promise<void> {
  const job = loadJob(batchId);
  const provider = getProvider(job.provider);
  provider.requireApiKey(job.config);
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
  const successCount = laneResults.filter((result) => result.sources.length > 0).length;
  const minLanes = job.config.minLanes !== undefined ? job.config.minLanes : defaultMinLanes(job.lanes.length);
  if (successCount < minLanes) {
    throw new Error(
      `Aborting before synthesis: only ${successCount} of ${job.lanes.length} batch lanes returned sources (need >=${minLanes}). ` +
        `The batch job has been retained so collection can be retried after fixing the parser.`
    );
  }
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
  appendRunStats(buildRunStats(job.config, "batch", null, job.submittedAt, tokens, [output.summaryPath, output.sourcesPath, ...output.lanesPaths], "api_key", collectParseModes(laneResults)));

  console.log(`
Tokens:  ${tokens.totalIn.toLocaleString()} in / ${tokens.totalOut.toLocaleString()} out (total)
Summary: ${output.summaryPath}
Sources: ${output.sourcesPath}
Lanes:   ${path.join(path.dirname(output.sourcesPath), "lanes")} (${output.lanesPaths.length} files + lanes JSON)
`);

  if (job.resubmittedFrom) {
    console.log(`
This was a --resubmit-failed run (resubmitted from ${job.resubmittedFrom}) covering only lane(s):
  ${job.lanes.join(", ")}
It was written to its own folder, not merged into the original run's output. To combine: copy the
lane markdown/JSON files above into the original folder's lanes/ directory (replacing the failed-lane
placeholders there), then re-run:
  npx ts-node research-sweep.ts --re-synthesise <original-folder>
`);
  }
}

// Batches API best practice: resubmit only the custom_ids that came back
// errored/expired/canceled — those requests were never billed, so
// resubmitting them is free of double-cost. Builds and submits a follow-up
// batch covering just those lanes, and saves a new job manifest pointed at a
// dedicated output folder so `--resume <newBatchId>` can never clobber the
// original run's already-written summary/sources/lane files. Combining the
// two runs is left to the user (see the guidance printed here and in
// resumeBatch) rather than an automatic merge — see CLAUDE.md.
export async function resubmitFailedBatch(batchId: string): Promise<void> {
  const job = loadJob(batchId);
  const provider = getProvider(job.provider);
  if (!provider.getBatchLaneFailures || !provider.submitBatchLanesSubset) {
    throw new Error(
      `Error: provider "${job.provider}" does not support --resubmit-failed. This is currently Claude-only — ` +
        `the Batches API best practice of resubmitting exactly the failed custom_ids doesn't map onto the ${job.provider} batch shape yet.`
    );
  }
  provider.requireApiKey(job.config);

  const status = await provider.getBatchStatus(batchId);
  if (status.status !== "completed" && status.status !== "ended") {
    console.log(`Batch ${batchId} — provider: ${job.provider} — status: ${status.status}`);
    console.log(`  processing: ${status.counts.processing}, succeeded: ${status.counts.succeeded}, errored: ${status.counts.errored}`);
    console.log(`\n--resubmit-failed requires a terminal batch. Wait for it to finish, or check progress with:\n  npx ts-node research-sweep.ts --resume ${batchId}`);
    return;
  }

  console.log(`Batch complete — checking for failed lanes...`);
  const failures = await provider.getBatchLaneFailures(batchId, job.lanes);

  if (failures.length === 0) {
    console.log(`No failed lanes in batch ${batchId} — every lane succeeded. Nothing to resubmit.`);
    return;
  }

  console.log(`\nFailed lanes (${failures.length} of ${job.lanes.length}):`);
  for (const failure of failures) {
    const label = LANE_CONFIG[failure.lane]?.label || failure.lane;
    console.log(`  • ${failure.lane} (${label}) — ${failure.resultType}`);
  }

  const failedLanes = failures.map((failure) => failure.lane);
  const newBatchId = await provider.submitBatchLanesSubset(job.config, failedLanes);

  // Dedicated folder — never the original job's outputDir — so resuming the
  // resubmission can never overwrite the original run's summary/sources.
  const resubmitDir = `${job.config.outputDir}-resubmit-${newBatchId.slice(-8).replace(/[^A-Za-z0-9]/g, "")}`;
  const resubmitConfig: SweepConfig = { ...job.config, lanes: failedLanes, outputDir: resubmitDir, overwrite: true };
  const files = computeFileNames(job.config.topic);
  const newJob: SweepJob = {
    provider: job.provider,
    batchId: newBatchId,
    config: resubmitConfig,
    summaryName: files.summaryName,
    sourcesName: files.sourcesName,
    submittedAt: new Date().toISOString(),
    lanes: failedLanes,
    resubmittedFrom: batchId,
  };
  saveJob(newJob);

  console.log(`
Resubmitted ${failedLanes.length} failed lane${failedLanes.length === 1 ? "" : "s"} as a new batch: ${newBatchId}
Resubmitted from: ${batchId} (original job manifest kept until you resolve it)
Will write to:    ${resubmitDir} (kept separate from the original run's output)

Resume with:
  npx ts-node research-sweep.ts --resume ${newBatchId}

The resumed output will cover only the resubmitted lane(s) (${failedLanes.join(", ")}). This CLI does not
auto-merge lane results across batches — after both runs are collected, combine them yourself, e.g. by
copying the resubmitted lane markdown/JSON files from ${resubmitDir}/lanes/ into the original folder's
lanes/ directory (replacing the failed-lane placeholders) and re-running:
  npx ts-node research-sweep.ts --re-synthesise <original-folder>
`);
}

export async function listBatches(): Promise<void> {
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
      provider.requireApiKey(job.config);
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

export async function waitAllBatches(pollIntervalMs: number): Promise<void> {
  const dir = jobsDir();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
  if (files.length === 0) {
    console.log("No pending batch jobs.");
    return;
  }

  const pending = new Map<string, SweepJob>();
  for (const file of files) {
    // Use the real batchId from file content, not the (sanitised) filename —
    // Gemini ids contain "/" so filename != batchId.
    const job = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as SweepJob;
    pending.set(job.batchId, job);
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
      provider.requireApiKey(job.config);
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
