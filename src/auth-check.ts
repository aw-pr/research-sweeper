import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CODEX_AUTH_FILE, hasClaudeOAuthToken } from "./auth/detect";
import { parseEnvFile } from "./env";

const ANTHROPIC_TEST_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_TEST_MODEL = "gpt-5-mini";
const CODEX_TEST_MODEL = "gpt-5.4-mini";
const CLAUDE_OAUTH_TEST_MODEL = "claude-haiku-4-5-20251001";
const MIN_OUTPUT_TOKENS = 16;
type AuthCheckTarget = "all" | "anthropic-api" | "openai-api" | "codex" | "claude-oauth";

const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<{ query: (args: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<{ type: string; [k: string]: unknown }> }>;

type CheckState = "ok" | "missing" | "failed";

interface CheckResult {
  name: string;
  state: CheckState;
  detail: string;
}

async function checkAnthropic(): Promise<CheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { name: "Anthropic API", state: "missing", detail: "ANTHROPIC_API_KEY is not set in the current process." };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: ANTHROPIC_TEST_MODEL,
      max_tokens: MIN_OUTPUT_TOKENS,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join(" ").trim() || "(empty response)";
    return {
      name: "Anthropic API",
      state: "ok",
      detail: `Authenticated with ${ANTHROPIC_TEST_MODEL}; response: ${text.slice(0, 40)}`,
    };
  } catch (error) {
    return {
      name: "Anthropic API",
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkOpenAI(): Promise<CheckResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { name: "OpenAI API", state: "missing", detail: "OPENAI_API_KEY is not set in the current process." };

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: OPENAI_TEST_MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: "Reply with OK." }] }],
      max_output_tokens: MIN_OUTPUT_TOKENS,
    });
    const text = response.output_text?.trim() || "(empty response)";
    return {
      name: "OpenAI API",
      state: "ok",
      detail: `Authenticated with ${OPENAI_TEST_MODEL}; response: ${text.slice(0, 40)}`,
    };
  } catch (error) {
    return {
      name: "OpenAI API",
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkCodex(): Promise<CheckResult> {
  if (!fs.existsSync(CODEX_AUTH_FILE)) {
    return { name: "Codex auth", state: "missing", detail: `No auth file found at ${CODEX_AUTH_FILE}` };
  }

  const outputPath = path.join(os.tmpdir(), `research-sweeper-codex-auth-${Date.now()}.txt`);
  const args = [
    "exec",
    "--json",
    "--model",
    CODEX_TEST_MODEL,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--full-auto",
    "--output-last-message",
    outputPath,
    "Reply with OK.",
  ];

  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });
      const err: Buffer[] = [];
      child.stderr.on("data", (chunk) => err.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(Buffer.concat(err).toString("utf-8") || `codex exec failed with ${code}`));
          return;
        }
        resolve(Buffer.concat(err).toString("utf-8"));
      });
    });
    const text = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf-8").trim() : "";
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    return {
      name: "Codex auth",
      state: "ok",
      detail: `codex exec succeeded with ${CODEX_TEST_MODEL}${text ? `; response: ${text.slice(0, 40)}` : stderr ? `; stderr: ${stderr.slice(0, 40)}` : ""}`,
    };
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    return {
      name: "Codex auth",
      state: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkClaudeOAuth(): Promise<CheckResult> {
  if (!hasClaudeOAuthToken()) {
    return { name: "Claude OAuth", state: "missing", detail: "CLAUDE_CODE_OAUTH_TOKEN is not set. Generate one with `claude setup-token` and export it." };
  }
  try {
    const { query } = await dynamicImport("@anthropic-ai/claude-agent-sdk");
    const iter = query({
      prompt: "Reply with OK.",
      options: {
        model: CLAUDE_OAUTH_TEST_MODEL,
        allowedTools: [],
        disallowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "TodoWrite", "Task"],
        permissionMode: "bypassPermissions",
        maxTurns: 1,
        settingSources: [],
      },
    });
    let text = "";
    let isError = false;
    let errorDetail = "";
    for await (const msg of iter) {
      if (msg.type === "assistant") {
        const content = (msg as { message?: { content?: Array<{ type: string; text?: string }> } }).message?.content ?? [];
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") text += block.text;
        }
      } else if (msg.type === "result") {
        const r = msg as { is_error?: boolean; subtype?: string; message?: string };
        if (r.is_error || (r.subtype && r.subtype !== "success")) {
          isError = true;
          errorDetail = `${r.subtype ?? "error"}${r.message ? `: ${r.message}` : ""}`;
        }
      }
    }
    if (isError) return { name: "Claude OAuth", state: "failed", detail: errorDetail || "Agent SDK returned error result" };
    return { name: "Claude OAuth", state: "ok", detail: `Agent SDK OAuth session active with ${CLAUDE_OAUTH_TEST_MODEL}; response: ${(text.trim() || "(empty)").slice(0, 40)}` };
  } catch (error) {
    return { name: "Claude OAuth", state: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}

function printResult(result: CheckResult): void {
  const label = result.state === "ok" ? "PASS" : result.state === "missing" ? "MISS" : "FAIL";
  console.log(`${label.padEnd(4)} ${result.name.padEnd(14)} ${result.detail}`);
}

export async function runAuthCheck(envFilePath: string, target: AuthCheckTarget = "all"): Promise<void> {
  const envValues = parseEnvFile(envFilePath);
  console.log(`
Auth Check
----------
Env file: ${path.resolve(envFilePath)}${fs.existsSync(envFilePath) ? "" : " (not found)"}
ANTHROPIC_API_KEY source: ${envValues.ANTHROPIC_API_KEY || "(missing in env file)"}
OPENAI_API_KEY source: ${envValues.OPENAI_API_KEY || "(missing in env file)"}
Codex auth file: ${CODEX_AUTH_FILE}${fs.existsSync(CODEX_AUTH_FILE) ? "" : " (missing)"}
CLAUDE_CODE_OAUTH_TOKEN: ${process.env.CLAUDE_CODE_OAUTH_TOKEN ? "(set)" : "(missing)"}
ANTHROPIC_API_KEY in process: ${process.env.ANTHROPIC_API_KEY ? "(set)" : "(absent)"}
Target: ${target}
`);

  const checks: Array<Promise<CheckResult>> = [];
  if (target === "all" || target === "anthropic-api") checks.push(checkAnthropic());
  if (target === "all" || target === "openai-api") checks.push(checkOpenAI());
  if (target === "all" || target === "codex") checks.push(checkCodex());
  if (target === "all" || target === "claude-oauth") checks.push(checkClaudeOAuth());

  if (checks.length === 0) {
    throw new Error(`Unknown auth check target: ${target}`);
  }

  const results = await Promise.all(checks);
  results.forEach(printResult);

  const failures = results.filter((result) => result.state !== "ok");
  if (failures.length > 0) {
    throw new Error(`Auth check failed for: ${failures.map((item) => item.name).join(", ")}`);
  }
}
