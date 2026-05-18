import * as fs from "fs";
import * as path from "path";
import { Depth, DepthDefinition, Lane, LaneDefinition } from "./types";

const ROOT = path.resolve(__dirname, "..");

function readJsonFile<T>(filename: string): T {
  const filePath = path.join(ROOT, "config", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function assertLaneDefinition(lane: string, value: unknown): asserts value is LaneDefinition {
  if (!value || typeof value !== "object") throw new Error(`Invalid lane config for "${lane}"`);
  const record = value as Record<string, unknown>;
  if (typeof record.label !== "string") throw new Error(`Lane "${lane}" missing label`);
  if (!Array.isArray(record.outlets) || !record.outlets.every((item) => typeof item === "string")) {
    throw new Error(`Lane "${lane}" outlets must be string[]`);
  }
  if (typeof record.searchFocus !== "string") throw new Error(`Lane "${lane}" missing searchFocus`);
  if (typeof record.systemPrompt !== "string") throw new Error(`Lane "${lane}" missing systemPrompt`);
}

function assertDepthDefinition(depth: string, value: unknown): asserts value is DepthDefinition {
  if (!value || typeof value !== "object") throw new Error(`Invalid depth config for "${depth}"`);
  const record = value as Record<string, unknown>;
  if (typeof record.searchRounds !== "number") throw new Error(`Depth "${depth}" missing searchRounds`);
  if (typeof record.sourcesPerLane !== "number") throw new Error(`Depth "${depth}" missing sourcesPerLane`);
  if (typeof record.laneMaxTokens !== "number") throw new Error(`Depth "${depth}" missing laneMaxTokens`);
  if (typeof record.synthesisMaxTokens !== "number") throw new Error(`Depth "${depth}" missing synthesisMaxTokens`);
  if (typeof record.description !== "string") throw new Error(`Depth "${depth}" missing description`);
  if (typeof record.synthGuide !== "string") throw new Error(`Depth "${depth}" missing synthGuide`);
}

function loadLaneConfig(): Record<Lane, LaneDefinition> {
  const raw = readJsonFile<Record<string, unknown>>("lanes.json");
  const lanes = ["financial", "frontier", "academic", "vc", "blogs", "tech"] as const;
  const config = {} as Record<Lane, LaneDefinition>;
  for (const lane of lanes) {
    assertLaneDefinition(lane, raw[lane]);
    config[lane] = raw[lane];
  }
  return config;
}

function loadDepthConfig(): Record<Depth, DepthDefinition> {
  const raw = readJsonFile<Record<string, unknown>>("depths.json");
  const depths = ["shallow", "standard", "deep"] as const;
  const config = {} as Record<Depth, DepthDefinition>;
  for (const depth of depths) {
    assertDepthDefinition(depth, raw[depth]);
    config[depth] = raw[depth];
  }
  return config;
}

export const LANE_CONFIG = loadLaneConfig();
export const DEPTH_CONFIG = loadDepthConfig();
export const LANE_PREFIX: Record<Lane, string> = { financial: "f", frontier: "t", academic: "a", vc: "v", blogs: "b", tech: "p" };
