import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { computeFileNames, writeLaneFiles, writeOutput } from "../output";
import type { LaneResult, SweepConfig } from "../types";

describe("writeOutput", () => {
  it("adds an Overview section after the summary H1 for downstream teasers", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-output-"));
    try {
      const config: SweepConfig = {
        provider: "openai",
        topic: "Code intelligence indexing",
        fromYear: 2025,
        toYear: 2026,
        lanes: ["academic"],
        depth: "standard",
        outputDir,
        test: false,
        overwrite: false,
      };
      const files = computeFileNames(config.topic);
      const laneResults: LaneResult[] = [
        {
          lane: "academic",
          label: "Academic",
          sources: [
            {
              title: "Paper A",
              significance: "Measured result",
              outlet: "arXiv",
              date: "2026",
            },
          ],
          narrative: "Academic narrative.",
          rawText: "",
          tokensIn: 1,
          tokensOut: 1,
          model: "gpt-5.4-mini",
        },
      ];

      const output = writeOutput(config, "# Code intelligence stopped being a search feature\n\nFirst paragraph.", laneResults, files, "gpt-5.5");
      const summary = readFileSync(output.summaryPath, "utf8");

      expect(summary).toContain("# Code intelligence stopped being a search feature\n\n## Overview\n\nFirst paragraph.");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("writeLaneFiles", () => {
  const baseConfig = (outputDir: string): SweepConfig => ({
    provider: "openai",
    topic: "Code intelligence indexing",
    fromYear: 2025,
    toYear: 2026,
    lanes: ["academic"],
    depth: "standard",
    outputDir,
    test: false,
    overwrite: false,
  });

  const baseLane = (overrides: Partial<LaneResult>): LaneResult => ({
    lane: "academic",
    label: "Academic",
    sources: [{ title: "Paper A", significance: "Measured result", outlet: "arXiv", date: "2026" }],
    narrative: "Academic narrative.",
    rawText: "",
    tokensIn: 1,
    tokensOut: 1,
    model: "gpt-5.4-mini",
    ...overrides,
  });

  it("titles the lane page with the lane label only and never renders a Context section", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-lanes-"));
    try {
      const config = baseConfig(outputDir);
      const files = computeFileNames(config.topic);
      const lane = baseLane({ model_context: "Background prose about the domain." });

      const { lanesPaths } = writeLaneFiles(config, [lane], files.summaryName, files.sourcesName, files.slug);
      const page = readFileSync(lanesPaths[0], "utf8");

      expect(page).toContain("# Academic\n");
      expect(page).not.toContain(`# Academic — ${config.topic}`);
      expect(page).not.toContain("## Context");
      expect(page).not.toContain("Background prose about the domain.");
      expect(page).toContain("## Narrative");
      expect(page).toContain("## Sources");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
