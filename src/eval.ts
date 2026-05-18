import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

export interface EvalDimensions {
  coverage: number;
  sourceQuality: number;
  synthesis: number;
  relevance: number;
}

export interface EvalScore {
  runId: string;
  scoredAt: string;
  overallScore: number;
  dimensions: EvalDimensions;
  dimensionReasons: Record<keyof EvalDimensions, string>;
  factualFlags: string[];
  judgeSummary: string;
  model: string;
  tokensUsed: number;
}

export const JUDGE_MODEL = "claude-haiku-4-5-20251001";

export const EVAL_RUBRIC = `You are an expert research quality judge. You will be given a research brief, a multi-lane summary, and a sources list.

Score the research on four dimensions, each from 1 to 5:

coverage (1=single angle only, 5=clearly distinct perspectives from multiple domains)
sourceQuality (1=no citations or all unnamed, 5=named outlets, dates, URLs where available)
synthesis (1=list of lane outputs pasted together, 5=genuinely integrated narrative with cross-lane insights)
relevance (1=mostly off-topic, 5=tightly matched to the brief throughout)

For each dimension provide a one-sentence reason.

List any specific factual claims you cannot verify or that appear inconsistent as factualFlags (empty array if none).

Write a 2-3 sentence overall verdict as judgeSummary.

Respond with ONLY a JSON block wrapped in <json></json> tags. No other text.

Schema:
<json>
{
  "dimensions": { "coverage": 0, "sourceQuality": 0, "synthesis": 0, "relevance": 0 },
  "dimensionReasons": { "coverage": "", "sourceQuality": "", "synthesis": "", "relevance": "" },
  "factualFlags": [],
  "judgeSummary": ""
}
</json>`;

export class EvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalError";
  }
}

function roundTo1dp(n: number): number {
  return Math.round(n * 10) / 10;
}

function deriveRunId(summaryPath: string): string {
  const base = path.basename(summaryPath);
  return base.replace(/\.md$/i, "").replace(/^summary-/, "");
}

function extractJsonBlock(text: string): string | null {
  const tagMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  let inner = tagMatch ? tagMatch[1] : text;
  // Strip markdown fences (```json ... ``` or ``` ... ```)
  inner = inner.trim();
  const fenceMatch = inner.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenceMatch) inner = fenceMatch[1];
  return inner.trim() || null;
}

interface ParsedJudge {
  dimensions: EvalDimensions;
  dimensionReasons: Record<keyof EvalDimensions, string>;
  factualFlags: string[];
  judgeSummary: string;
}

function parseJudgeResponse(text: string): { ok: true; parsed: ParsedJudge } | { ok: false; error: string } {
  const block = extractJsonBlock(text);
  if (!block) return { ok: false, error: "no <json> block in judge response" };
  try {
    const obj = JSON.parse(block);
    const dims = obj.dimensions || {};
    const reasons = obj.dimensionReasons || {};
    return {
      ok: true,
      parsed: {
        dimensions: {
          coverage: Number(dims.coverage) || 0,
          sourceQuality: Number(dims.sourceQuality) || 0,
          synthesis: Number(dims.synthesis) || 0,
          relevance: Number(dims.relevance) || 0,
        },
        dimensionReasons: {
          coverage: String(reasons.coverage || ""),
          sourceQuality: String(reasons.sourceQuality || ""),
          synthesis: String(reasons.synthesis || ""),
          relevance: String(reasons.relevance || ""),
        },
        factualFlags: Array.isArray(obj.factualFlags) ? obj.factualFlags.map(String) : [],
        judgeSummary: String(obj.judgeSummary || ""),
      },
    };
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as Error).message}` };
  }
}

export function computeOverall(dims: EvalDimensions): number {
  const sum = dims.coverage + dims.sourceQuality + dims.synthesis + dims.relevance;
  return roundTo1dp(sum / 4);
}

export async function evalSweep(opts: {
  summaryPath: string;
  sourcesPath: string;
  briefText: string;
  apiKey: string;
  runId?: string;
}): Promise<EvalScore> {
  if (!fs.existsSync(opts.summaryPath)) {
    throw new EvalError(`EvalError: summary file not found: ${opts.summaryPath}`);
  }
  if (!fs.existsSync(opts.sourcesPath)) {
    throw new EvalError(`EvalError: sources file not found: ${opts.sourcesPath}`);
  }

  const summary = fs.readFileSync(opts.summaryPath, "utf8");
  const sources = fs.readFileSync(opts.sourcesPath, "utf8");
  const runId = opts.runId || deriveRunId(opts.summaryPath);

  const client = new Anthropic({ apiKey: opts.apiKey });

  const userMessage = `# Research brief\n\n${opts.briefText}\n\n# Summary\n\n${summary}\n\n# Sources\n\n${sources}`;

  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 2048,
    system: EVAL_RUBRIC,
    messages: [{ role: "user", content: userMessage }],
  });

  const textParts = response.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text);
  const fullText = textParts.join("\n");

  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
  const scoredAt = new Date().toISOString();

  const parsed = parseJudgeResponse(fullText);

  if (!parsed.ok) {
    const emptyDims: EvalDimensions = { coverage: 0, sourceQuality: 0, synthesis: 0, relevance: 0 };
    return {
      runId,
      scoredAt,
      overallScore: 0,
      dimensions: emptyDims,
      dimensionReasons: { coverage: "", sourceQuality: "", synthesis: "", relevance: "" },
      factualFlags: [],
      judgeSummary: `parse error: ${parsed.error}`,
      model: JUDGE_MODEL,
      tokensUsed,
    };
  }

  return {
    runId,
    scoredAt,
    overallScore: computeOverall(parsed.parsed.dimensions),
    dimensions: parsed.parsed.dimensions,
    dimensionReasons: parsed.parsed.dimensionReasons,
    factualFlags: parsed.parsed.factualFlags,
    judgeSummary: parsed.parsed.judgeSummary,
    model: JUDGE_MODEL,
    tokensUsed,
  };
}
