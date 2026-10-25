import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Contract test for stage 01 (stage-cards/01-the-wrappers-pass-the-cloud-env-through.md).
// The frozen block below is authored by the orchestrator; the worker makes it
// pass without editing it.

const repoRoot = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf-8");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const detectModule = "../auth/detect";

let savedEnv: NodeJS.ProcessEnv;
beforeEach(() => {
  savedEnv = { ...process.env };
  delete process.env.RESEARCH_SWEEPER_OUTPUT_DIR;
  delete process.env.CODEX_HOME;
});
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

describe("cloud env pass-through", () => {
  // AUTOMETTA-CONTRACT-BEGIN card=stage-cards/01-the-wrappers-pass-the-cloud-env-through.md
  it("researchRoot expands a leading ~ in RESEARCH_SWEEPER_OUTPUT_DIR", async () => {
    const { researchRoot } = await import("../env");
    process.env.RESEARCH_SWEEPER_OUTPUT_DIR = "~/vault/research";
    expect(researchRoot()).toBe(path.join(os.homedir(), "vault", "research"));
    process.env.RESEARCH_SWEEPER_OUTPUT_DIR = "/abs/vault";
    expect(researchRoot()).toBe("/abs/vault");
  });

  it("codexAuthFile honours CODEX_HOME and falls back to ~/.codex", async () => {
    const detect = (await import(detectModule)) as { codexAuthFile: () => string };
    process.env.CODEX_HOME = "/run/secrets/codex";
    expect(detect.codexAuthFile()).toBe(path.join("/run/secrets/codex", "auth.json"));
    delete process.env.CODEX_HOME;
    expect(detect.codexAuthFile()).toBe(path.join(os.homedir(), ".codex", "auth.json"));
  });

  it("every op-fetch exec in both secure wrappers passes the cloud env through", () => {
    for (const script of ["run-secure-sweep.sh", "run-secure-command.sh"]) {
      const text = read(script);
      const execs = count(text, "exec op-fetch");
      expect(execs).toBeGreaterThan(0);
      expect(count(text, "--pass RESEARCH_SWEEPER_OUTPUT_DIR")).toBe(execs);
      expect(count(text, "--pass CODEX_HOME")).toBe(execs);
    }
  });
  // AUTOMETTA-CONTRACT-END
});
