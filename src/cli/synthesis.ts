// Synthesis orchestration shared by the sync run, batch resume, and
// --re-synthesise flows.

import * as fs from "fs";
import * as path from "path";
import { DEPTH_CONFIG } from "../config";
import { researchRoot } from "../env";
import { loadJob } from "../jobs";
import { computeFileNames, writeOutput } from "../output";
import { getProvider } from "../providers";
import { LaneResult, SweepConfig } from "../types";
import { AuthOverrides } from "./auth-flags";
import { readFolderConfig } from "./folder-config";

export function capLaneSourcesByDepth(config: SweepConfig, laneResults: LaneResult[]): LaneResult[] {
  const maxSources = DEPTH_CONFIG[config.depth].sourcesPerLane;
  return laneResults.map((result) => ({
    ...result,
    sources: result.sources.slice(0, maxSources),
  }));
}

export async function runSynthesisOptimised(
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

export async function reSynthesise(folder: string, batchId?: string, authOverrides: AuthOverrides = {}): Promise<void> {
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
  if (authOverrides.claudeAuth) config.claudeAuth = authOverrides.claudeAuth;
  if (authOverrides.geminiAuth) config.geminiAuth = authOverrides.geminiAuth;
  if (authOverrides.openaiAuth) config.openaiAuth = authOverrides.openaiAuth;
  const provider = getProvider(config.provider);
  const files = computeFileNames(config.topic);
  const synthesisModel = provider.getModels(config, "sync").synthesis;
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
  const output = writeOutput(config, synthesis.markdown, lanes, files, synthesisModel, { allowOverwrite: true });
  console.log(`Done (${synthesis.tokensIn.toLocaleString()} in / ${synthesis.tokensOut.toLocaleString()} out)`);
  console.log(`Summary: ${output.summaryPath}`);
}
