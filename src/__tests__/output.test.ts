import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { appendUpstreamLaneTruncationWarning, computeFileNames, findDegradedLanes, MIN_NARRATIVE_WORDS, safeBriefFileReference, safeOutputDirReference, UPSTREAM_LANE_TRUNCATION_WARNING, writeLaneFiles, writeOutput } from "../output";
import { TRUNCATION_MARKER } from "../stop-reason";
import type { LaneResult, SweepConfig } from "../types";

describe("writeOutput", () => {
  it("keeps generated brief metadata publish-safe while retaining a useful reference", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-output-"));
    const localBrief = path.join(tmpdir(), "private", "brief's draft.md");
    try {
      const config: SweepConfig = {
        provider: "openai",
        topic: "Code intelligence indexing",
        fromYear: 2025,
        toYear: 2026,
        lanes: ["academic"],
        depth: "standard",
        outputDir,
        briefFile: localBrief,
        test: false,
        overwrite: false,
      };
      const files = computeFileNames(config.topic);
      const laneResults: LaneResult[] = [{
        lane: "academic",
        label: "Academic",
        sources: [],
        narrative: "This lane has enough words to avoid the degraded-output warning while exercising generated metadata safely for publishable research outputs today.",
        rawText: "",
        tokensIn: 1,
        tokensOut: 1,
        model: "gpt-5.6-terra",
      }];

      const output = writeOutput(config, "# Summary\n\nFindings.", laneResults, files);
      const generated = [
        readFileSync(output.summaryPath, "utf8"),
        readFileSync(output.sourcesPath, "utf8"),
        readFileSync(output.lanesPaths[0], "utf8"),
        readFileSync(path.join(outputDir, "lanes", `lanes-${files.slug}.json`), "utf8"),
      ];

      for (const content of generated) {
        expect(content).not.toContain(localBrief);
        expect(content).not.toContain(outputDir);
      }
      expect(generated[0]).toContain("brief_file: 'brief''s draft.md'");
      expect(JSON.parse(generated[3]).config.briefFile).toBe("brief's draft.md");
      expect(JSON.parse(generated[3]).config.outputDir).toBe(path.basename(outputDir));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

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
          narrative:
      "Academic work this period converged on retrieval-augmented indexing, with several benchmarks showing that hybrid symbol-and-embedding approaches outperform either signal alone across large monorepos and long-tail languages.",
          rawText: "",
          tokensIn: 1,
          tokensOut: 1,
          model: "gpt-5.6-luna",
        },
      ];

      const output = writeOutput(config, "# Code intelligence stopped being a search feature\n\nFirst paragraph.", laneResults, files, "gpt-5.6-sol");
      const summary = readFileSync(output.summaryPath, "utf8");

      expect(summary).toContain("# Code intelligence stopped being a search feature\n\n## Overview\n\nFirst paragraph.");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("adds one visible warning to the final summary for truncated upstream lanes", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-output-"));
    try {
      const config: SweepConfig = {
        provider: "openai", topic: "Code intelligence indexing", fromYear: 2025, toYear: 2026,
        lanes: ["financial", "academic"], depth: "standard", outputDir, test: false, overwrite: false,
      };
      const files = computeFileNames(config.topic);
      const laneResults: LaneResult[] = [
        { lane: "financial", label: "Financial Press", sources: [], narrative: "Partial findings with sufficient words to be useful despite the provider limit being reached during this research request.", rawText: "", tokensIn: 1, tokensOut: 1, model: "gpt-5.6-terra", truncated: true },
        { lane: "academic", label: "Academic", sources: [], narrative: `${TRUNCATION_MARKER} Cached partial findings remain visible even when the older lane JSON did not preserve the truncated flag for this result.`, rawText: "", tokensIn: 1, tokensOut: 1, model: "gpt-5.6-terra" },
      ];

      const output = writeOutput(config, "# Summary\n\nFindings.", laneResults, files);
      const summary = readFileSync(output.summaryPath, "utf8");

      expect(summary).toContain(UPSTREAM_LANE_TRUNCATION_WARNING);
      expect(summary).toContain("**Financial Press** (`financial`)");
      expect(summary).toContain("**Academic** (`academic`)");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("appendUpstreamLaneTruncationWarning", () => {
  const lane = (overrides: Partial<LaneResult>): LaneResult => ({
    lane: "academic", label: "Academic", sources: [], narrative: "Complete narrative.", rawText: "", tokensIn: 1, tokensOut: 1, model: "gpt-5.6-terra", ...overrides,
  });

  it("leaves complete lanes unchanged and is idempotent for a truncated lane", () => {
    expect(appendUpstreamLaneTruncationWarning("content", [lane({})])).toBe("content");
    const once = appendUpstreamLaneTruncationWarning("content", [lane({ truncated: true })]);
    expect(appendUpstreamLaneTruncationWarning(once, [lane({ truncated: true })])).toBe(once);
  });
});

describe("safeBriefFileReference", () => {
  it("uses a repo-relative path for an absolute brief within the working tree", () => {
    expect(safeBriefFileReference(path.join(process.cwd(), "prompts", "example.md"))).toBe("prompts/example.md");
  });

  it("removes an absolute path outside the working tree", () => {
    expect(safeBriefFileReference(path.join(tmpdir(), "private", "brief.md"))).toBe("brief.md");
  });

  it("preserves an already-relative brief path", () => {
    expect(safeBriefFileReference("../shared/team's-brief.md")).toBe("../shared/team's-brief.md");
  });
});

describe("safeOutputDirReference", () => {
  it("removes an absolute output path while keeping the folder name", () => {
    expect(safeOutputDirReference(path.join(tmpdir(), "research-sweeper-output-123"))).toBe("research-sweeper-output-123");
  });

  it("preserves a relative output directory", () => {
    expect(safeOutputDirReference("research/agent-reports")).toBe("research/agent-reports");
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
    narrative:
      "Academic work this period converged on retrieval-augmented indexing, with several benchmarks showing that hybrid symbol-and-embedding approaches outperform either signal alone across large monorepos and long-tail languages.",
    rawText: "",
    tokensIn: 1,
    tokensOut: 1,
    model: "gpt-5.6-luna",
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
      expect(page).not.toContain("[!warning]");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("renders a warning callout when a lane has sources but an empty narrative", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "research-sweeper-lanes-"));
    try {
      const config = baseConfig(outputDir);
      const files = computeFileNames(config.topic);
      const lane = baseLane({ narrative: "" });

      const { lanesPaths } = writeLaneFiles(config, [lane], files.summaryName, files.sourcesName, files.slug);
      const page = readFileSync(lanesPaths[0], "utf8");

      expect(page).toContain("> [!warning] Narrative missing or truncated");
      expect(page).toContain("published with 1 source");
      expect(page).toContain("## Sources");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("findDegradedLanes", () => {
  const lane = (overrides: Partial<LaneResult>): LaneResult => ({
    lane: "academic",
    label: "Academic",
    sources: [{ title: "Paper A", significance: "Measured result", outlet: "arXiv", date: "2026" }],
    narrative: Array.from({ length: MIN_NARRATIVE_WORDS + 5 }, () => "word").join(" "),
    rawText: "",
    tokensIn: 1,
    tokensOut: 1,
    model: "gpt-5.6-luna",
    ...overrides,
  });

  it("flags lanes with an empty narrative", () => {
    const flagged = findDegradedLanes([lane({ narrative: "" })]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].lane).toBe("academic");
    expect(flagged[0].words).toBe(0);
  });

  it("flags lanes below the minimum word count and passes healthy lanes", () => {
    const flagged = findDegradedLanes([
      lane({ lane: "financial", label: "Financial Press", narrative: "Too short here." }),
      lane({ lane: "tech", label: "Tech" }),
    ]);
    expect(flagged.map((entry) => entry.lane)).toEqual(["financial"]);
  });
});
