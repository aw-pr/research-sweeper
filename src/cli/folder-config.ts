// Reconstructs a SweepConfig from the frontmatter of a previously-written
// summary file, for flows that re-enter a run folder (--re-synthesise,
// --resume without a lanes cache).

import * as fs from "fs";
import * as path from "path";
import { Provider, SweepConfig } from "../types";

export function readFolderConfig(outputDir: string): SweepConfig {
  const files = fs.readdirSync(outputDir).filter((file) => file.startsWith("summary-") && file.endsWith(".md"));
  if (files.length === 0) throw new Error(`No summary file found in: ${outputDir}`);
  const raw = fs.readFileSync(path.join(outputDir, files[0]), "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error("Could not parse frontmatter");
  const frontmatter = fmMatch[1];
  const get = (key: string) => {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : "";
  };

  const provider = (get("provider") || "claude") as Provider;
  const topic = unquoteYamlScalar(get("topic"));
  const briefTitleRaw = get("brief_title");
  const briefFileRaw = get("brief_file");
  const fromYear = parseInt(get("from"), 10) || 2021;
  const toRaw = get("to");
  const toYear = toRaw === "present" ? null : parseInt(toRaw, 10);
  const depth = (get("depth") || "standard") as SweepConfig["depth"];
  const lanes = get("lanes").replace(/[\[\]]/g, "").split(",").map((lane) => lane.trim()).filter(Boolean) as SweepConfig["lanes"];
  return {
    provider,
    topic,
    briefFile: briefFileRaw ? unquoteYamlScalar(briefFileRaw) : undefined,
    briefTitle: briefTitleRaw ? unquoteYamlScalar(briefTitleRaw) : undefined,
    briefing: undefined,
    fromYear,
    toYear,
    lanes,
    depth,
    outputDir,
    test: false,
    overwrite: false,
  };
}

export function unquoteYamlScalar(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  return value;
}
