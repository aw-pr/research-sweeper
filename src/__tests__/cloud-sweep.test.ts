import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const script = path.join(__dirname, "..", "..", "cloud-sweep.sh");
const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  execFileSync("bash", [script, "--dry-run", ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...env, RESEARCH_SWEEPER_OUTPUT_DIR: env.RESEARCH_SWEEPER_OUTPUT_DIR ?? "" },
  }).split("\n");

describe("cloud-sweep.sh", () => {
  it("runs a sync Claude OAuth sweep and rides the result out on a sweeps/<folder> branch", () => {
    const lines = run(["--brief-file", "prompts/x.md", "--folder", "demo", "--depth", "shallow"]);
    expect(lines[0]).toBe("+ npx ts-node research-sweep.ts --sync --provider claude --claude-auth claude-oauth --brief-file prompts/x.md --folder demo --depth shallow");
    expect(lines).toContain("+ git checkout -B sweeps/demo");
    expect(lines).toContain("+ git add -f sweeps/demo");
    expect(lines).toContain("+ git push -u origin sweeps/demo");
    expect(lines.some((l) => l.startsWith("+ git checkout ") && !l.includes("-B"))).toBe(true);
  });

  it("honours --no-push and refuses without --folder", () => {
    expect(run(["--no-push", "--folder", "demo"])).not.toContain("+ git push -u origin sweeps/demo");
    expect(() => run(["--brief-file", "prompts/x.md"])).toThrow(/--folder is required/);
  });

  it("maps SWEEP_CLAUDE_OAUTH_TOKEN onto CLAUDE_CODE_OAUTH_TOKEN and refuses without either", () => {
    const bare: NodeJS.ProcessEnv = { ...process.env, RESEARCH_SWEEPER_OUTPUT_DIR: "" };
    delete bare.CLAUDE_CODE_OAUTH_TOKEN;
    delete bare.SWEEP_CLAUDE_OAUTH_TOKEN;
    expect(() =>
      execFileSync("bash", [script, "--no-push", "--folder", "demo", "--brief-file", "x"], { encoding: "utf-8", env: bare, stdio: "pipe" })
    ).toThrow(/no Claude OAuth token/);
    const source = fs.readFileSync(script, "utf-8");
    expect(source).toMatch(/export CLAUDE_CODE_OAUTH_TOKEN="\$SWEEP_CLAUDE_OAUTH_TOKEN"/);
  });

  it("stages a gitignored brief on the sweep branch and pushes it", () => {
    const lines = run(["--stage", "prompts/x.md", "--folder", "demo"]);
    expect(lines).toContain("+ git checkout -B sweeps/demo");
    expect(lines).toContain("+ git add -f prompts/x.md");
    expect(lines).toContain("+ git push -u origin sweeps/demo");
    expect(lines.some((l) => l.startsWith("+ npx ts-node"))).toBe(false);
  });

  it("collects a branch into the configured output dir and lifts the sweeps/ prefix", () => {
    const lines = run(["--collect", "demo"], { RESEARCH_SWEEPER_OUTPUT_DIR: "/tmp/vault" });
    expect(lines).toContain("+ git fetch origin sweeps/demo");
    expect(lines).toContain("+ git --work-tree=/tmp/vault checkout origin/sweeps/demo -- sweeps/demo");
    expect(lines).toContain("+ mv /tmp/vault/sweeps/demo /tmp/vault/demo");
  });
});
