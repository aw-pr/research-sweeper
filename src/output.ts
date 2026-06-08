import * as fs from "fs";
import * as path from "path";
import { LANE_PREFIX } from "./config";
import { FileNames, LaneResult, SweepConfig } from "./types";

const STUB_FILE_NAME = "_research-sweeper-stub.md";

export function computeFileNames(topic: string): FileNames {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return { slug, summaryName: `summary-${slug}`, sourcesName: `sources-${slug}` };
}

function frontmatter(config: SweepConfig, slug: string, date: string, models?: { lane: string; synthesis: string }): string {
  const lines = [
    "---",
    `provider: ${config.provider}`,
    `topic: ${yamlSingleQuoted(config.topic)}`,
    `date: ${date}`,
    `from: ${config.fromYear}`,
    `to: ${config.toYear ?? "present"}`,
    `lanes: [${config.lanes.join(", ")}]`,
    `depth: ${config.depth}`,
  ];
  if (config.briefTitle) lines.push(`brief_title: ${yamlSingleQuoted(config.briefTitle)}`);
  if (config.briefFile) lines.push(`brief_file: ${yamlSingleQuoted(config.briefFile)}`);
  if (models) {
    lines.push(`model_lane: ${models.lane}`);
    lines.push(`model_synthesis: ${models.synthesis}`);
  }
  lines.push(`tags: [research-sweep, ${config.provider}, ${slug}]`, "---", "");
  return lines.join("\n");
}

function plannedOutputPaths(config: SweepConfig, slug: string, summaryName: string, sourcesName: string): string[] {
  const lanesDir = path.join(config.outputDir, "lanes");
  return [
    path.join(config.outputDir, `${summaryName}.md`),
    path.join(config.outputDir, `${sourcesName}.md`),
    ...config.lanes.map((lane) => path.join(lanesDir, `lane-${lane}-${slug}.md`)),
    path.join(lanesDir, `lanes-${slug}.json`),
  ];
}

function buildStubContent(config: SweepConfig, files: FileNames): string {
  const date = new Date().toISOString().split("T")[0];
  return [
    "---",
    "type: research-sweep-stub",
    `provider: ${config.provider}`,
    `topic: ${yamlSingleQuoted(config.topic)}`,
    `date: ${date}`,
    `from: ${config.fromYear}`,
    `to: ${config.toYear ?? "present"}`,
    `lanes: [${config.lanes.join(", ")}]`,
    `depth: ${config.depth}`,
    "status: pending",
    `tags: [research-sweep-stub, ${files.slug}]`,
    "---",
    "",
    `# Research Sweep Stub: ${config.topic}`,
    "",
    "Expected notes:",
    `- [[${files.summaryName}]]`,
    `- [[${files.sourcesName}]]`,
    "",
    "This stub is created before the run starts so the folder exists in Obsidian without overwriting prior outputs.",
    "",
  ].join("\n");
}

export function prepareOutputTarget(
  config: SweepConfig,
  files: FileNames,
  options: { allowOverwrite?: boolean; createStub?: boolean } = {}
): { stubPath: string } {
  const { allowOverwrite = false, createStub = false } = options;
  if (!fs.existsSync(config.outputDir)) fs.mkdirSync(config.outputDir, { recursive: true });
  const collisions = plannedOutputPaths(config, files.slug, files.summaryName, files.sourcesName).filter((filePath) => fs.existsSync(filePath));
  if (collisions.length > 0 && !allowOverwrite) {
    throw new Error(
      `Refusing to overwrite existing output. Re-run with --overwrite to replace these files:\n${collisions.map((filePath) => `- ${filePath}`).join("\n")}`
    );
  }

  const stubPath = path.join(config.outputDir, STUB_FILE_NAME);
  if (createStub && !fs.existsSync(stubPath)) {
    fs.writeFileSync(stubPath, buildStubContent(config, files), "utf-8");
  }

  return { stubPath };
}

export function writeLaneFiles(
  config: SweepConfig,
  laneResults: LaneResult[],
  summaryName: string,
  sourcesName: string,
  slug: string
): { lanesPaths: string[] } {
  const lanesDir = path.join(config.outputDir, "lanes");
  if (!fs.existsSync(lanesDir)) fs.mkdirSync(lanesDir, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const lanesPaths: string[] = [];

  for (const result of laneResults) {
    const prefix = LANE_PREFIX[result.lane];
    const body = [
      `# ${result.label}`,
      "",
      `**Summary:** [[${summaryName}]] | **Sources:** [[${sourcesName}]]`,
      "",
      "---",
      "",
      "## Narrative",
      "",
      formatSummaryCitations(result.narrative.trim(), sourcesName, buildSourceMetaById([result])),
      "",
      "## Sources",
      "",
      "| ID | Title | Outlet | Date | Significance |",
      "|---|---|---|---|---|",
      ...result.sources.map((source, index) => {
        const id = `${prefix}${index + 1}`;
        const titleLink = source.url ? `[${source.title}](${source.url})` : source.title;
        const outlet = (source.outlet || "").replace(/\|/g, "\\|");
        const srcDate = (source.date || "").replace(/\|/g, "\\|");
        const significance = source.significance.replace(/\|/g, "\\|");
        return `| ${id} | ${titleLink} | ${outlet} | ${srcDate} | ${significance} |`;
      }),
      "",
    ].join("\n");

    const lanePath = path.join(lanesDir, `lane-${result.lane}-${slug}.md`);
    const fm = [
      "---",
      `provider: ${config.provider}`,
      `topic: ${yamlSingleQuoted(config.topic)}`,
      `date: ${date}`,
      `lane: ${result.lane}`,
      `label: ${yamlSingleQuoted(result.label)}`,
      `from: ${config.fromYear}`,
      `to: ${config.toYear ?? "present"}`,
      `depth: ${config.depth}`,
      `model: ${result.model || ""}`,
      `sources_count: ${result.sources.length}`,
      `tokens_in: ${result.tokensIn}`,
      `tokens_out: ${result.tokensOut}`,
      `tags: [research-lane, ${config.provider}, ${result.lane}, ${slug}]`,
      "---",
      "",
    ];
    if (config.briefTitle) fm.splice(9, 0, `brief_title: ${yamlSingleQuoted(config.briefTitle)}`);
    if (config.briefFile) fm.splice(config.briefTitle ? 10 : 9, 0, `brief_file: ${yamlSingleQuoted(config.briefFile)}`);
    const frontmatterText = fm.join("\n");

    fs.writeFileSync(lanePath, frontmatterText + body, "utf-8");
    lanesPaths.push(lanePath);
  }

  fs.writeFileSync(path.join(lanesDir, `lanes-${slug}.json`), JSON.stringify({ config, lanes: laneResults }, null, 2), "utf-8");
  return { lanesPaths };
}

export function writeOutput(
  config: SweepConfig,
  markdown: string,
  laneResults: LaneResult[],
  files: FileNames,
  synthesisModel?: string,
  options: { allowOverwrite?: boolean } = {}
): { summaryPath: string; sourcesPath: string; lanesPaths: string[] } {
  prepareOutputTarget(config, files, { allowOverwrite: options.allowOverwrite });

  const date = new Date().toISOString().split("T")[0];
  const laneModel = laneResults.find((r) => r.model)?.model;
  const models = laneModel || synthesisModel ? { lane: laneModel || "", synthesis: synthesisModel || "" } : undefined;
  const fm = frontmatter(config, files.slug, date, models);
  const summaryPath = path.join(config.outputDir, `${files.summaryName}.md`);
  const sourcesPath = path.join(config.outputDir, `${files.sourcesName}.md`);

  let sourcesBody = `**Summary:** [[${files.summaryName}]]\n\n---\n\n`;
  for (const result of laneResults) {
    if (result.sources.length === 0) continue;
    const prefix = LANE_PREFIX[result.lane];
    sourcesBody += `## ${result.label}\n\n`;
    sourcesBody += "| ID | Title | Outlet | Date | Significance |\n";
    sourcesBody += "|---|---|---|---|---|\n";
    result.sources.forEach((source, index) => {
      const id = `${prefix}${index + 1}`;
      const titleLink = source.url ? `[${source.title}](${source.url})` : source.title;
      const outlet = (source.outlet || "").replace(/\|/g, "\\|");
      const dateValue = (source.date || "").replace(/\|/g, "\\|");
      const significance = source.significance.replace(/\|/g, "\\|");
      sourcesBody += `| ${id} | ${titleLink} | ${outlet} | ${dateValue} | ${significance} | ^${id}\n`;
    });
    sourcesBody += "\n";
  }

  const sourceMetaById = buildSourceMetaById(laneResults);
  const { lanesPaths } = writeLaneFiles(config, laneResults, files.summaryName, files.sourcesName, files.slug);
  const summaryMarkdown = ensureOverviewHeading(markdown.trim());
  fs.writeFileSync(
    summaryPath,
    fm + formatSummaryCitations(summaryMarkdown, files.sourcesName, sourceMetaById) + `\n\n---\n\n![[${files.sourcesName}]]`,
    "utf-8"
  );
  fs.writeFileSync(sourcesPath, fm + sourcesBody, "utf-8");
  return { summaryPath, sourcesPath, lanesPaths };
}

function ensureOverviewHeading(markdown: string): string {
  if (/^##\s+Overview\s*$/im.test(markdown)) return markdown;
  const h1 = /^#\s+.+$/m.exec(markdown);
  if (!h1) return `## Overview\n\n${markdown}`;
  const insertAt = h1.index + h1[0].length;
  return `${markdown.slice(0, insertAt)}\n\n## Overview${markdown.slice(insertAt)}`;
}

function buildSourceMetaById(laneResults: LaneResult[]): Map<string, { outlet: string; year: string; url?: string }> {
  const out = new Map<string, { outlet: string; year: string; url?: string }>();
  for (const result of laneResults) {
    const prefix = LANE_PREFIX[result.lane];
    for (let index = 0; index < result.sources.length; index++) {
      const source = result.sources[index];
      const id = `${prefix}${index + 1}`.toLowerCase();
      const outlet = (source.outlet || source.title || "Source").trim();
      const yearMatch = (source.date || "").match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "n.d.";
      out.set(id, { outlet, year, url: source.url });
    }
  }
  return out;
}

function resolveSourceId(idRaw: string, sourceMetaById: Map<string, { outlet: string; year: string; url?: string }>): string {
  const id = idRaw.toLowerCase();
  if (sourceMetaById.has(id)) return id;
  // Back-compat: older summaries sometimes used "l" for frontier IDs; current sources use "t".
  if (id.startsWith("l")) {
    const alt = `t${id.slice(1)}`;
    if (sourceMetaById.has(alt)) return alt;
  }
  return id;
}

function formatSummaryCitations(markdown: string, sourcesName: string, sourceMetaById: Map<string, { outlet: string; year: string; url?: string }>): string {
  const blockRefRegex = /\[\[([^#\]]+)#\^([A-Za-z]\d+)\]\]/g;
  const lines = markdown.split("\n");
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      out.push(rawLine);
      continue;
    }
    if (line.startsWith("Links:")) {
      // Drop stale/plain links lines and regenerate from normalized Sources.
      continue;
    }
    if (line.startsWith("Sources:")) {
      const refs = extractSourceIds(line).map((id) => resolveSourceId(id, sourceMetaById));
      if (refs.length === 0) {
        out.push(rawLine);
        continue;
      }
      const deduped = [...new Set(refs)];
      const combined = deduped.map((id) => {
        const meta = sourceMetaById.get(id);
        const label = meta ? `${meta.outlet} (${meta.year})` : `Source (${id.toUpperCase()})`;
        const tableLink = `[[${sourcesName}#^${id}|${label}]]`;
        return meta?.url ? `${tableLink} ([↗](${meta.url}))` : tableLink;
      });
      out.push(`Sources: ${combined.join("; ")}`);
      continue;
    }

    const refs: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = blockRefRegex.exec(rawLine)) !== null) {
      refs.push(match[2]);
    }

    if (refs.length === 0) {
      out.push(rawLine);
      continue;
    }

    const dedupedRefs = [...new Set(refs)].map((id) => resolveSourceId(id, sourceMetaById));
    const cleaned = rawLine
      .replace(blockRefRegex, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trimEnd();

    out.push(cleaned);
    const combined = dedupedRefs.map((id) => {
      const meta = sourceMetaById.get(id);
      const label = meta ? `${meta.outlet} (${meta.year})` : `Source (${id.toUpperCase()})`;
      const tableLink = `[[${sourcesName}#^${id}|${label}]]`;
      return meta?.url ? `${tableLink} ([↗](${meta.url}))` : tableLink;
    });
    out.push(`Sources: ${combined.join("; ")}`);
  }

  return out.join("\n");
}

function extractSourceIds(line: string): string[] {
  const ids: string[] = [];
  // 1) Already-linked refs: [[sources-...#^f1|...]]
  const linkRef = /#\^([A-Za-z]\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRef.exec(line)) !== null) ids.push(m[1].toLowerCase());
  if (ids.length > 0) return ids;

  // 2) Plain-text refs: sources-... > ^F1
  const plainRef = />\s*\^([A-Za-z]\d+)/g;
  while ((m = plainRef.exec(line)) !== null) ids.push(m[1].toLowerCase());
  return ids;
}

function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
