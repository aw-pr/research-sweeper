import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Contract test for stage 02 (stage-cards/02-the-codex-route-rides-the-sdk.md).
// The frozen block below is authored by the orchestrator; the worker makes it
// pass without editing it. The shared module is imported through a variable
// path so the type-checker does not fail while the module does not exist yet.

const repoRoot = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf-8");
const codexSdkModule = "../codex-sdk";

describe("codex route rides the SDK", () => {
  // AUTOMETTA-CONTRACT-BEGIN card=stage-cards/02-the-codex-route-rides-the-sdk.md
  it("depends on @openai/codex-sdk", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["@openai/codex-sdk"]).toBeTruthy();
  });

  it("neither the provider nor the auth check spawns the codex binary by hand", () => {
    for (const file of ["src/providers/openai.ts", "src/auth-check.ts"]) {
      const text = read(file);
      expect(text).not.toMatch(/from "child_process"/);
      expect(text).not.toMatch(/\bspawn\(/);
      expect(text).toMatch(/from "\.\.?\/codex-sdk"/);
    }
    expect(read("src/codex-sdk.ts")).toMatch(/from "@openai\/codex-sdk"/);
  });

  it("the shared module exposes one turn runner and a child env with no API key", async () => {
    const mod = (await import(codexSdkModule)) as {
      runCodexTurn: unknown;
      codexChildEnv: (env: NodeJS.ProcessEnv) => Record<string, string>;
    };
    expect(typeof mod.runCodexTurn).toBe("function");
    const env = mod.codexChildEnv({ OPENAI_API_KEY: "sk-leak", PATH: "/bin", HOME: "/h", CODEX_HOME: "/c" });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/h");
    expect(env.CODEX_HOME).toBe("/c");
  });
  // AUTOMETTA-CONTRACT-END
});
