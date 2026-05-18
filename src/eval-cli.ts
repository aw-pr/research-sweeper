#!/usr/bin/env npx ts-node
import * as fs from "fs";
import * as path from "path";
import { evalSweep, EvalScore } from "./eval";

interface CliArgs {
  summary?: string;
  sources?: string;
  brief?: string;
  runId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--summary" && next) { args.summary = next; i++; }
    else if (a === "--sources" && next) { args.sources = next; i++; }
    else if (a === "--brief" && next) { args.brief = next; i++; }
    else if (a === "--run-id" && next) { args.runId = next; i++; }
  }
  return args;
}

function formatScore(score: EvalScore): string {
  const lines: string[] = [];
  lines.push(`★ ${score.overallScore.toFixed(1)} / 5`);
  lines.push("");
  lines.push(`coverage:      ${score.dimensions.coverage}  — ${score.dimensionReasons.coverage}`);
  lines.push(`sourceQuality: ${score.dimensions.sourceQuality}  — ${score.dimensionReasons.sourceQuality}`);
  lines.push(`synthesis:     ${score.dimensions.synthesis}  — ${score.dimensionReasons.synthesis}`);
  lines.push(`relevance:     ${score.dimensions.relevance}  — ${score.dimensionReasons.relevance}`);
  lines.push("");
  if (score.factualFlags.length) {
    lines.push("Factual flags:");
    for (const f of score.factualFlags) lines.push(`  - ${f}`);
  } else {
    lines.push("Factual flags: none");
  }
  lines.push("");
  lines.push(`Verdict: ${score.judgeSummary}`);
  lines.push("");
  lines.push(`(model=${score.model}, tokens=${score.tokensUsed}, runId=${score.runId})`);
  return lines.join("\n");
}

function persistScore(score: EvalScore): void {
  const statsPath = path.resolve(process.cwd(), "runs", "stats.json");
  let updated = false;
  if (fs.existsSync(statsPath)) {
    try {
      const raw = fs.readFileSync(statsPath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry && typeof entry === "object" && entry.runId === score.runId) {
            entry.eval = score;
            updated = true;
            break;
          }
        }
        if (updated) {
          fs.writeFileSync(statsPath, JSON.stringify(data, null, 2) + "\n");
        }
      }
    } catch {
      // fall through to standalone write
    }
  }
  if (!updated) {
    const runsDir = path.resolve(process.cwd(), "runs");
    if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true });
    const outPath = path.join(runsDir, `eval-${score.runId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(score, null, 2) + "\n");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.summary || !args.sources || !args.brief) {
    process.stderr.write("Usage: eval-cli --summary <path> --sources <path> --brief <path> [--run-id <id>]\n");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    process.stderr.write("ANTHROPIC_API_KEY is not set. Inject it before running eval-cli.\n");
    process.exit(1);
  }
  const briefText = fs.readFileSync(args.brief, "utf8");
  const score = await evalSweep({
    summaryPath: args.summary,
    sourcesPath: args.sources,
    briefText,
    apiKey,
    runId: args.runId,
  });
  process.stdout.write(formatScore(score) + "\n");
  persistScore(score);
}

main().catch((err: Error) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
