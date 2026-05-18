#!/usr/bin/env npx ts-node
import * as fs from "fs";
import * as path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { parseBriefFile } from "./brief";
import { DEPTH_CONFIG, LANE_CONFIG } from "./config";
import { deleteJob, jobsDir, loadJob, saveJob } from "./jobs";
import { computeFileNames, prepareOutputTarget, writeOutput } from "./output";
import { getProvider } from "./providers";
import { appendRunStats } from "./stats";
import {
  Depth,
  Lane,
  LaneResult,
  Provider,
  RunStats,
  SweepConfig,
  SweepJob,
} from "./types";
import { loadDotEnv, researchRoot } from "./env";

loadDotEnv();

// ── helpers ─────────────────────────────────────────────────────────────────

function statsFilePath(): string {
  return path.join(__dirname, "..", "runs", "stats.json");
}

// ── tool implementations ─────────────────────────────────────────────────────

async function toolRunSweep(args: Record<string, unknown>): Promise<unknown> {
  const topic = args.topic as string;
  const briefFile = args.brief_file as string | undefined;
  const parsedBrief = briefFile ? parseBriefFile(briefFile) : undefined;
  const fromYear = (args.from_year as number) ?? new Date().getFullYear() - 3;
  const toYear = (args.to_year as number | null) ?? null;
  const depth = ((args.depth as string) ?? "standard") as Depth;
  const lanes = ((args.lanes as string[] | undefined) ?? ["financial", "frontier", "academic", "vc", "blogs", "tech"]) as Lane[];
  const provider: Provider = ((args.provider as string) ?? "claude") as Provider;
  const overwrite = Boolean(args.overwrite);
  const synthesisModel = args.synthesis_model as string | undefined;

  const resolvedTopic = topic || parsedBrief?.topic;
  if (!resolvedTopic) throw new Error("topic is required");
  const folderName = (args.folder as string) ?? resolvedTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  if (!DEPTH_CONFIG[depth]) throw new Error(`Invalid depth: ${depth}. Use shallow, standard, or deep.`);
  const validLanes = lanes.filter((l) => Boolean(LANE_CONFIG[l]));
  if (validLanes.length === 0) throw new Error("No valid lanes specified.");

  const outputDir = path.join(researchRoot(), folderName);
  const config: SweepConfig = {
    provider,
    topic: resolvedTopic,
    briefFile: parsedBrief?.briefFile || briefFile,
    briefTitle: parsedBrief?.title,
    briefing: parsedBrief?.briefing,
    fromYear,
    toYear,
    lanes: validLanes,
    depth,
    outputDir,
    test: false,
    overwrite,
    synthesisModel,
  };
  const files = computeFileNames(resolvedTopic);
  const { stubPath } = prepareOutputTarget(config, files, { allowOverwrite: overwrite, createStub: true });

  const p = getProvider(provider);
  p.requireApiKey(config);
  const batchId = await p.submitBatchLanes(config);

  const job: SweepJob = {
    provider,
    batchId,
    config,
    summaryName: files.summaryName,
    sourcesName: files.sourcesName,
    submittedAt: new Date().toISOString(),
    lanes: validLanes,
  };
  saveJob(job);

  return {
    batchId,
    topic: resolvedTopic,
    depth,
    lanes: validLanes,
    fromYear,
    toYear,
    outputDir,
    stubPath,
    submittedAt: job.submittedAt,
    message: `Sweep submitted. Poll with check_sweep_status batchId="${batchId}", then call resynthesize folder="${folderName}" when complete.`,
  };
}

async function toolCheckSweepStatus(args: Record<string, unknown>): Promise<unknown> {
  const dir = jobsDir();
  if (!fs.existsSync(dir)) return { jobs: [], message: "No pending batch jobs." };

  const batchId = args.batch_id as string | undefined;

  if (batchId) {
    const job = loadJob(batchId);
    const p = getProvider(job.provider);
    const status = await p.getBatchStatus(batchId);
    return {
      batchId,
      topic: job.config.topic,
      provider: job.provider,
      status: status.status,
      counts: status.counts,
      submittedAt: job.submittedAt,
      ready: status.status === "completed" || status.status === "ended",
    };
  }

  // List all pending jobs
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtime.getTime() - fs.statSync(path.join(dir, a)).mtime.getTime());

  if (files.length === 0) return { jobs: [], message: "No pending batch jobs." };

  const results = await Promise.all(
    files.map(async (file) => {
      const id = path.basename(file, ".json");
      const job = loadJob(id);
      try {
        const p = getProvider(job.provider);
        const status = await p.getBatchStatus(id);
        return {
          batchId: id,
          topic: job.config.topic,
          provider: job.provider,
          status: status.status,
          counts: status.counts,
          submittedAt: job.submittedAt,
          ready: status.status === "completed" || status.status === "ended",
        };
      } catch {
        return { batchId: id, topic: job.config.topic, provider: job.provider, status: "fetch_error", submittedAt: job.submittedAt, ready: false };
      }
    })
  );

  return { jobs: results, count: results.length };
}

async function toolResynthesize(args: Record<string, unknown>): Promise<unknown> {
  const folder = args.folder as string;
  if (!folder) throw new Error("folder is required");

  const outputDir = path.join(researchRoot(), folder);
  const lanesDir = path.join(outputDir, "lanes");

  if (!fs.existsSync(outputDir)) throw new Error(`Folder not found: ${outputDir}`);

  const jsonFiles = fs.existsSync(lanesDir)
    ? fs.readdirSync(lanesDir).filter((f) => f.startsWith("lanes-") && f.endsWith(".json"))
    : [];

  if (jsonFiles.length === 0) throw new Error(`No lane cache found in ${lanesDir}. Run a sweep first.`);

  const { config, lanes }: { config: SweepConfig; lanes: LaneResult[] } = JSON.parse(
    fs.readFileSync(path.join(lanesDir, jsonFiles[0]), "utf-8")
  );
  config.provider = config.provider ?? "claude";

  const p = getProvider(config.provider);
  const files = computeFileNames(config.topic);
  const synthesis = await p.runSynthesis(config, lanes, files.sourcesName);
  const output = writeOutput(config, synthesis.markdown, lanes, files, undefined, { allowOverwrite: true });

  return {
    topic: config.topic,
    folder,
    summaryPath: output.summaryPath,
    sourcesPath: output.sourcesPath,
    laneFiles: output.lanesPaths.length,
    tokensIn: synthesis.tokensIn,
    tokensOut: synthesis.tokensOut,
    message: "Re-synthesis complete.",
  };
}

function toolListRuns(args: Record<string, unknown>): unknown {
  const limit = (args.limit as number) ?? 20;
  const filePath = statsFilePath();

  if (!fs.existsSync(filePath)) return { runs: [], totalRuns: 0, totalCostUSD: 0 };

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunStats[];
  if (!Array.isArray(parsed)) return { runs: [], totalRuns: 0, totalCostUSD: 0 };

  const sorted = [...parsed].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const totalCostUSD = parsed.reduce((s, r) => s + r.estimatedCostUSD, 0);
  const totalTokensIn = parsed.reduce((s, r) => s + r.tokens.totalIn, 0);
  const totalTokensOut = parsed.reduce((s, r) => s + r.tokens.totalOut, 0);

  const runs = sorted.slice(0, limit).map((r) => ({
    runId: r.runId,
    timestamp: r.timestamp,
    topic: r.topic,
    depth: r.depth,
    mode: r.mode,
    provider: r.provider,
    lanes: r.lanes,
    fromYear: r.fromYear,
    toYear: r.toYear ?? "present",
    tokensIn: r.tokens.totalIn,
    tokensOut: r.tokens.totalOut,
    estimatedCostUSD: r.estimatedCostUSD,
    models: r.models,
    durationSec: r.durationSec,
    outputFiles: r.outputFiles,
  }));

  return {
    runs,
    returned: runs.length,
    totalRuns: parsed.length,
    totalCostUSD: Math.round(totalCostUSD * 1_000_000) / 1_000_000,
    totalTokensIn,
    totalTokensOut,
  };
}

// ── server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "research-sweeper", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "run_sweep",
      description: "Submit a multi-lane technology research sweep (runs as batch). Returns a batchId to poll with check_sweep_status.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Research topic (e.g. 'AI agent orchestration')" },
          brief_file: { type: "string", description: "Path to a markdown research brief template file. Its topic string and sub-questions are passed through to the run." },
          from_year: { type: "number", description: "Start year for research coverage (default: 3 years ago)" },
          to_year: { type: "number", description: "End year (omit for present)" },
          depth: { type: "string", enum: ["shallow", "standard", "deep"], description: "shallow=5 sources, standard=10, deep=20 (default: standard)" },
          lanes: {
            type: "array",
            items: { type: "string", enum: ["financial", "frontier", "academic", "vc", "blogs", "tech"] },
            description: "Which research lanes to run (default: financial, frontier, academic, vc, blogs, tech)",
          },
          folder: { type: "string", description: "Output folder name under the research output root (RESEARCH_SWEEPER_OUTPUT_DIR, default ~/obsidian/research) (default: derived from topic)" },
          provider: { type: "string", enum: ["claude", "openai"], description: "AI provider (default: claude)" },
          synthesis_model: { type: "string", description: "Optional synthesis model override, e.g. claude-opus-4-7 for especially detailed/expensive runs." },
          overwrite: { type: "boolean", description: "Replace existing summary/sources/lane outputs for the resolved topic slug." },
        },
        required: ["topic"],
      },
    },
    {
      name: "check_sweep_status",
      description: "Check the status of one or all pending batch sweeps.",
      inputSchema: {
        type: "object",
        properties: {
          batch_id: { type: "string", description: "Specific batch ID to check (omit to list all pending jobs)" },
        },
      },
    },
    {
      name: "resynthesize",
      description: "Regenerate the synthesis brief from cached lane data for a completed sweep folder.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Folder name under the research output root (RESEARCH_SWEEPER_OUTPUT_DIR, default ~/obsidian/research) (e.g. 'ai-agent-orchestration')" },
        },
        required: ["folder"],
      },
    },
    {
      name: "list_runs",
      description: "List completed research sweeps sorted by date descending, with token usage and cost.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max runs to return (default: 20)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    let result: unknown;
    if (name === "run_sweep") result = await toolRunSweep(args as Record<string, unknown>);
    else if (name === "check_sweep_status") result = await toolCheckSweepStatus(args as Record<string, unknown>);
    else if (name === "resynthesize") result = await toolResynthesize(args as Record<string, unknown>);
    else if (name === "list_runs") result = toolListRuns(args as Record<string, unknown>);
    else throw new Error(`Unknown tool: ${name}`);

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
