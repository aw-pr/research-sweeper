import OpenAI from "openai";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectOpenAIAuthMode, OpenAIAuthMode, requireApiKeyModeOrThrow } from "../auth/detect";
import { DEPTH_CONFIG, LANE_CONFIG } from "../config";
import { fallbackLaneResult, parseLaneResponse } from "../parsing";
import { buildLanePrompt, buildSynthesisPrompt } from "../prompts";
import { BatchStatus, Lane, LaneResult, ProviderAdapter, ProviderModels, SweepConfig, UsageCounts } from "../types";

const LANE_MODEL = "gpt-5.4-mini";
const LANE_MODEL_BATCH = "gpt-5.4-mini";
const SYNTHESIS_MODEL = "gpt-5.5";
const TEST_MODEL = "gpt-5-mini";
const LANE_REASONING_EFFORT = "low";
const SYNTHESIS_REASONING_EFFORT = "high";
const EXEC_MAX_BUFFER = 1024 * 1024 * 128; // 128MB

interface CodexExecResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

function countsFromBatch(batch: { request_counts?: { completed?: number; failed?: number; total?: number }; status?: string }): UsageCounts {
  const total = batch.request_counts?.total || 0;
  const succeeded = batch.request_counts?.completed || 0;
  const errored = batch.request_counts?.failed || 0;
  return { processing: Math.max(total - succeeded - errored, 0), succeeded, errored };
}

function responseInputItem(text: string) {
  return [{ role: "user" as const, content: [{ type: "input_text" as const, text }] }];
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  return response.output_text || "";
}

function tempBatchFilePath(): string {
  return path.join(os.tmpdir(), `research-sweeper-openai-batch-${Date.now()}.jsonl`);
}

export class OpenAIProvider implements ProviderAdapter {
  readonly provider = "openai" as const;
  private client: OpenAI | null = null;
  private authMode: OpenAIAuthMode | null = null;

  requireApiKey(config?: SweepConfig): string {
    const mode = this.resolveAuthMode(config);
    if (mode === "api_key") {
      const apiKey = this.getStoredApiKey();
      if (!apiKey) throw new Error("Error: OPENAI_API_KEY not set. Start via ./run-secure-sweep.sh or ./run-secure-command.sh so the helper injects it.");
      return apiKey;
    }
    return "codex-cli-auth";
  }

  private getClient(): OpenAI {
    if (this.resolveAuthMode() !== "api_key") {
      throw new Error("OpenAI SDK client unavailable in codex-cli auth mode");
    }
    if (!this.client) this.client = new OpenAI({ apiKey: this.requireApiKey() });
    return this.client;
  }

  private getStoredApiKey(): string | null {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    return null;
  }

  getAuthMode(): OpenAIAuthMode | null {
    return this.authMode;
  }

  private authPrefer?: OpenAIAuthMode;

  private resolveAuthMode(config?: SweepConfig): OpenAIAuthMode {
    if (config?.openaiAuth) this.authPrefer = config.openaiAuth;
    if (this.authMode) return this.authMode;
    this.authMode = detectOpenAIAuthMode(this.authPrefer);
    return this.authMode;
  }

  private parseCodexUsage(jsonl: string): { tokensIn: number; tokensOut: number } {
    let tokensIn = 0;
    let tokensOut = 0;
    for (const line of jsonl.split("\n").map((item) => item.trim()).filter(Boolean)) {
      try {
        const event = JSON.parse(line) as { type?: string; usage?: { input_tokens?: number; output_tokens?: number } };
        if (event.type === "turn.completed") {
          tokensIn += event.usage?.input_tokens || 0;
          tokensOut += event.usage?.output_tokens || 0;
        }
      } catch {
        // Ignore non-JSON event noise.
      }
    }
    return { tokensIn, tokensOut };
  }

  private async runViaCodexCli(prompt: string, model: string, useSearch: boolean, reasoningEffort: string): Promise<CodexExecResult> {
    const allowedEfforts = ["minimal", "low", "medium", "high"];
    if (!allowedEfforts.includes(reasoningEffort)) {
      throw new Error(
        `Invalid reasoning effort "${reasoningEffort}"; expected one of ${allowedEfforts.join(", ")}. ` +
          "Check config/depths.json — this value is interpolated into the codex argv."
      );
    }
    delete process.env.OPENAI_API_KEY;
    const outputPath = tempBatchFilePath() + ".out.txt";
    const args = [
      ...(useSearch ? ["--search"] : []),
      "exec",
      "--json",
      "--model",
      model,
      "-c",
      `model_reasoning_effort="${reasoningEffort}"`,
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-last-message",
      outputPath,
      prompt,
    ];

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const env = { ...process.env };
        delete env.OPENAI_API_KEY;
        const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"], env });
        const out: Buffer[] = [];
        const err: Buffer[] = [];

        child.stdout.on("data", (chunk) => out.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        child.stderr.on("data", (chunk) => err.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        child.on("error", reject);
        child.on("close", (code) => {
          const stdoutText = Buffer.concat(out).toString("utf-8");
          const stderrText = Buffer.concat(err).toString("utf-8");
          if (Buffer.byteLength(stdoutText, "utf-8") > EXEC_MAX_BUFFER) {
            reject(new Error("codex exec output exceeded max buffer"));
            return;
          }
          if (code !== 0) {
            reject(new Error(`codex exec failed (${code}): ${stderrText || "no stderr"}`));
            return;
          }
          resolve(stdoutText);
        });
      });
      const text = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf-8") : "";
      const usage = this.parseCodexUsage(stdout || "");
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      return { text, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut };
    } catch (error) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw error;
    }
  }

  getModels(config: SweepConfig, mode: "sync" | "batch"): ProviderModels {
    return {
      lane: config.test ? TEST_MODEL : mode === "batch" ? LANE_MODEL_BATCH : LANE_MODEL,
      synthesis: config.test ? TEST_MODEL : config.synthesisModel || SYNTHESIS_MODEL,
    };
  }

  async runLane(config: SweepConfig, lane: Lane): Promise<LaneResult> {
    const definition = LANE_CONFIG[lane];
    console.log(`  [${definition.label}] Starting sweep...`);
    try {
      const model = config.test ? TEST_MODEL : LANE_MODEL;
      let rawText = "";
      let tokensIn = 0;
      let tokensOut = 0;
      let searchesFired: number | undefined;

      let reasoningOut = 0;
      if (this.resolveAuthMode(config) === "api_key") {
        const client = this.getClient();
        const response = await client.responses.create({
          model,
          input: responseInputItem(buildLanePrompt(lane, config)),
          instructions: definition.systemPrompt,
          tools: [{ type: "web_search" }],
          reasoning: { effort: LANE_REASONING_EFFORT },
          max_output_tokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
        });
        rawText = extractOutputText(response);
        tokensIn = response.usage?.input_tokens || 0;
        tokensOut = response.usage?.output_tokens || 0;
        reasoningOut = (response.usage as unknown as { output_tokens_details?: { reasoning_tokens?: number } })?.output_tokens_details?.reasoning_tokens || 0;
        const outputItems = (response.output ?? []) as Array<{ type?: string }>;
        searchesFired = outputItems.filter((o) => typeof o.type === "string" && o.type.startsWith("web_search")).length;
      } else {
        const combinedPrompt = `${definition.systemPrompt}\n\n${buildLanePrompt(lane, config)}`;
        const result = await this.runViaCodexCli(combinedPrompt, model, true, LANE_REASONING_EFFORT);
        rawText = result.text;
        tokensIn = result.tokensIn;
        tokensOut = result.tokensOut;
      }

      const parsed = parseLaneResponse(rawText);

      if (!parsed) {
        console.warn(`  [${definition.label}] Warning: could not parse JSON response, using fallback`);
        return { ...fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, model), reasoningOut, searchesFired };
      }

      const searchLabel = searchesFired === undefined ? "" : `, ${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      const reasoningLabel = reasoningOut ? `, ${reasoningOut.toLocaleString()} reasoning` : "";
      console.log(`  [${definition.label}] Complete — ${parsed.sources.length} sources${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out${reasoningLabel})`);
      return { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, rawText, tokensIn, tokensOut, reasoningOut, model, searchesFired };
    } catch (error) {
      console.error(`  [${definition.label}] Error:`, error);
      return { lane, label: definition.label, sources: [], narrative: `Error during sweep: ${error}`, rawText: "", tokensIn: 0, tokensOut: 0, model: config.test ? TEST_MODEL : LANE_MODEL };
    }
  }

  async runSynthesis(config: SweepConfig, laneResults: LaneResult[], sourcesName: string): Promise<{ markdown: string; tokensIn: number; tokensOut: number; reasoningOut?: number }> {
    console.log("\n  [Synthesis] Assembling research brief...");
    const model = this.getModels(config, "sync").synthesis;
    let markdown = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let reasoningOut = 0;

    if (this.resolveAuthMode(config) === "api_key") {
      const client = this.getClient();
      const response = await client.responses.create({
        model,
        input: responseInputItem(buildSynthesisPrompt(config, laneResults, sourcesName)),
        reasoning: { effort: SYNTHESIS_REASONING_EFFORT },
        max_output_tokens: 8192,
      });
      markdown = extractOutputText(response);
      tokensIn = response.usage?.input_tokens || 0;
      tokensOut = response.usage?.output_tokens || 0;
      reasoningOut = (response.usage as unknown as { output_tokens_details?: { reasoning_tokens?: number } })?.output_tokens_details?.reasoning_tokens || 0;
    } else {
      const result = await this.runViaCodexCli(buildSynthesisPrompt(config, laneResults, sourcesName), model, false, SYNTHESIS_REASONING_EFFORT);
      markdown = result.text;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
    }

    const reasoningLabel = reasoningOut ? `, ${reasoningOut.toLocaleString()} reasoning` : "";
    console.log(`  [Synthesis] Complete (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out${reasoningLabel})`);
    return { markdown, tokensIn, tokensOut, reasoningOut };
  }

  async submitBatchLanes(config: SweepConfig): Promise<string> {
    requireApiKeyModeOrThrow("openai", this.resolveAuthMode(config));
    const client = this.getClient();
    const requests = config.lanes.map((lane) => ({
      custom_id: lane,
      method: "POST" as const,
      url: "/v1/responses",
      body: {
        model: config.test ? TEST_MODEL : LANE_MODEL_BATCH,
        input: responseInputItem(buildLanePrompt(lane, config)),
        instructions: LANE_CONFIG[lane].systemPrompt,
        tools: [{ type: "web_search" }],
        reasoning: { effort: LANE_REASONING_EFFORT },
        max_output_tokens: DEPTH_CONFIG[config.depth].laneMaxTokens,
      },
    }));
    const batchFilePath = tempBatchFilePath();
    fs.writeFileSync(batchFilePath, requests.map((request) => JSON.stringify(request)).join("\n") + "\n", "utf-8");
    const uploadedFile = await client.files.create({ file: fs.createReadStream(batchFilePath), purpose: "batch" });
    fs.unlinkSync(batchFilePath);
    const batch = await client.batches.create({ endpoint: "/v1/responses", completion_window: "24h", input_file_id: uploadedFile.id });
    return batch.id;
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    requireApiKeyModeOrThrow("openai", this.resolveAuthMode());
    const client = this.getClient();
    const batch = await client.batches.retrieve(batchId);
    return { id: batchId, status: batch.status, counts: countsFromBatch(batch) };
  }

  async collectBatchResults(batchId: string, lanes: Lane[]): Promise<LaneResult[]> {
    requireApiKeyModeOrThrow("openai", this.resolveAuthMode());
    const client = this.getClient();
    const batch = await client.batches.retrieve(batchId);
    if (!batch.output_file_id) return [];
    const fileResponse = await client.files.content(batch.output_file_id);
    const outputText = await fileResponse.text();
    const items = outputText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { custom_id: string; response?: { body?: OpenAI.Responses.Response }; error?: { message?: string } });
    const laneMap = new Map<Lane, LaneResult>();

    for (const item of items) {
      const lane = item.custom_id as Lane;
      const definition = LANE_CONFIG[lane];
      if (!definition) {
        console.warn(`  [${lane}] Unknown lane in batch result — skipping (likely a stale batch from before a rename)`);
        continue;
      }
      const batchModel = LANE_MODEL_BATCH;
      if (item.error) {
        laneMap.set(lane, { lane, label: definition.label, sources: [], narrative: `Batch result: ${item.error.message}`, rawText: "", tokensIn: 0, tokensOut: 0, model: batchModel });
        continue;
      }
      const responseBody = item.response?.body as OpenAI.Responses.Response | undefined;
      if (!responseBody) {
        laneMap.set(lane, { lane, label: definition.label, sources: [], narrative: "Batch result: missing response body", rawText: "", tokensIn: 0, tokensOut: 0, model: batchModel });
        continue;
      }
      const rawText = extractOutputText(responseBody);
      const parsed = parseLaneResponse(rawText);
      const tokensIn = responseBody.usage?.input_tokens || 0;
      const tokensOut = responseBody.usage?.output_tokens || 0;
      const reasoningOut = (responseBody.usage as unknown as { output_tokens_details?: { reasoning_tokens?: number } })?.output_tokens_details?.reasoning_tokens || 0;
      const outputItems = (responseBody.output ?? []) as Array<{ type?: string }>;
      const searchesFired = outputItems.filter((o) => typeof o.type === "string" && o.type.startsWith("web_search")).length;
      const searchLabel = `${searchesFired} search${searchesFired !== 1 ? "es" : ""}`;
      const reasoningLabel = reasoningOut ? `, ${reasoningOut.toLocaleString()} reasoning` : "";
      console.log(`  [${definition.label}] Collected — ${parsed?.sources.length ?? 0} sources, ${searchLabel} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out${reasoningLabel})`);
      laneMap.set(
        lane,
        parsed
          ? { lane, label: definition.label, sources: parsed.sources, narrative: parsed.narrative, rawText, tokensIn, tokensOut, reasoningOut, model: batchModel, searchesFired }
          : { ...fallbackLaneResult(lane, definition, rawText, tokensIn, tokensOut, batchModel), reasoningOut, searchesFired }
      );
    }

    return lanes.map((lane) => laneMap.get(lane)).filter((item): item is LaneResult => item !== undefined);
  }
}
