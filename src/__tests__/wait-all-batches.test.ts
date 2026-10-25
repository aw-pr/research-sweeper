import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Contract test for stage 03 (stage-cards/03-the-waiter-is-opt-in-and-survives-a-foreign-job.md).
// The frozen block below is authored by the orchestrator; the worker makes it
// pass without editing it.

const repoRoot = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf-8");
const batchesModule = "../cli/batches";

function runBatchSearchWithStub(args: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-search-"));
  fs.copyFileSync(path.join(repoRoot, "batch-search.sh"), path.join(dir, "batch-search.sh"));
  fs.writeFileSync(path.join(dir, "run-secure-sweep.sh"), '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n');
  fs.chmodSync(path.join(dir, "run-secure-sweep.sh"), 0o755);
  return execFileSync("bash", [path.join(dir, "batch-search.sh"), ...args], { encoding: "utf-8" });
}

describe("the batch waiter is opt-in and survives a foreign job", () => {
  // AUTOMETTA-CONTRACT-BEGIN card=stage-cards/03-the-waiter-is-opt-in-and-survives-a-foreign-job.md
  it("batch-search.sh forwards --wait only when asked and never forces --wait-all", () => {
    const plain = runBatchSearchWithStub(["--topic", "x", "--folder", "y"]).split("\n");
    expect(plain).toContain("--batch");
    expect(plain).not.toContain("--wait-all");
    expect(plain).not.toContain("--wait");
    const waited = runBatchSearchWithStub(["--wait", "--topic", "x"]).split("\n");
    expect(waited).toContain("--wait");
    expect(waited).not.toContain("--wait-all");
  });

  it("partitionJobsByCredential keeps jobs whose route credential is present and reports the rest", async () => {
    const { partitionJobsByCredential } = (await import(batchesModule)) as {
      partitionJobsByCredential: (jobs: never[], providerFor: never) => { ready: { batchId: string }[]; skipped: { job: { batchId: string }; reason: string }[] };
    };
    const jobs = [
      { batchId: "a", provider: "claude", config: { topic: "t1" } },
      { batchId: "b", provider: "gemini", config: { topic: "t2" } },
    ] as never[];
    const providerFor = (name: string) => ({
      requireApiKey: () => {
        if (name === "gemini") throw new Error("GEMINI_API_KEY not set");
        return "key";
      },
    });
    const { ready, skipped } = partitionJobsByCredential(jobs, providerFor as never);
    expect(ready.map((j: { batchId: string }) => j.batchId)).toEqual(["a"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].job.batchId).toBe("b");
    expect(skipped[0].reason).toMatch(/GEMINI_API_KEY/);
  });

  it("the skill pre-flight anchors the grep, covers .env.local and scopes the tmux kill", () => {
    const skill = read("SKILL.md");
    expect(skill).toMatch(/grep -E '\^RESEARCH_SWEEPER_OUTPUT_DIR=' \.env\.local \.env/);
    expect(skill).not.toMatch(/`grep RESEARCH_SWEEPER_OUTPUT_DIR \.env`/);
    expect(skill).toMatch(/\.env\.local/);
    const launcher = read("sweeper-prompt-creation/SKILL.md");
    expect(launcher).toMatch(/tmux kill-session -t sweep-/);
    expect(launcher).not.toMatch(/always passes `--wait-all`/);
  });
  // AUTOMETTA-CONTRACT-END
});
