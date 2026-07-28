import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { computeFileNames, prepareOutputTarget } from "../output";
import type { SweepConfig } from "../types";

// resumeBatch runs this check before runSynthesisOptimised so a folder that
// already holds output fails free, rather than after the synthesis pass has
// billed. Guarding the check itself keeps that ordering meaningful.
function makeConfig(outputDir: string, overwrite = false): SweepConfig {
  return {
    provider: "openai",
    topic: "Resume preflight test topic",
    fromYear: 2026,
    toYear: 2026,
    lanes: ["financial"],
    depth: "standard",
    outputDir,
    test: false,
    overwrite,
  };
}

describe("resume pre-flight overwrite check", () => {
  it("throws when a summary already exists and overwrite is off", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-preflight-"));
    try {
      const config = makeConfig(outputDir);
      const files = computeFileNames(config.topic);
      writeFileSync(path.join(outputDir, `${files.summaryName}.md`), "# existing", "utf-8");

      expect(() => prepareOutputTarget(config, files, { allowOverwrite: config.overwrite })).toThrow(
        /Refusing to overwrite existing output/
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("throws when only a lane file collides", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-preflight-"));
    try {
      const config = makeConfig(outputDir);
      const files = computeFileNames(config.topic);
      mkdirSync(path.join(outputDir, "lanes"), { recursive: true });
      writeFileSync(path.join(outputDir, "lanes", `lane-financial-${files.slug}.md`), "# existing lane", "utf-8");

      expect(() => prepareOutputTarget(config, files, { allowOverwrite: config.overwrite })).toThrow(
        /Refusing to overwrite existing output/
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("passes on a clean folder, and on a collision when overwrite is on", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-preflight-"));
    try {
      const config = makeConfig(outputDir);
      const files = computeFileNames(config.topic);
      expect(() => prepareOutputTarget(config, files, { allowOverwrite: false })).not.toThrow();

      writeFileSync(path.join(outputDir, `${files.summaryName}.md`), "# existing", "utf-8");
      expect(() => prepareOutputTarget(config, files, { allowOverwrite: true })).not.toThrow();
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("tolerates the stub the submit step already wrote", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-preflight-"));
    try {
      const config = makeConfig(outputDir);
      const files = computeFileNames(config.topic);
      writeFileSync(path.join(outputDir, "_research-sweeper-stub.md"), "# stub", "utf-8");

      expect(() => prepareOutputTarget(config, files, { allowOverwrite: false })).not.toThrow();
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
