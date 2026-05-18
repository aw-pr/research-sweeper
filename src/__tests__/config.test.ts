import { describe, it, expect } from "vitest";
import { LANE_CONFIG, DEPTH_CONFIG, LANE_PREFIX } from "../config";

const REQUIRED_LANES = ["financial", "frontier", "academic", "vc", "blogs", "tech"] as const;
const REQUIRED_DEPTHS = ["shallow", "standard", "deep"] as const;

describe("LANE_CONFIG", () => {
  it("loads all six canonical lanes from lanes.json", () => {
    for (const lane of REQUIRED_LANES) {
      expect(LANE_CONFIG[lane]).toBeDefined();
    }
  });

  it("each lane has label, outlets[], searchFocus, systemPrompt fields", () => {
    for (const lane of REQUIRED_LANES) {
      const def = LANE_CONFIG[lane];
      expect(typeof def.label).toBe("string");
      expect(Array.isArray(def.outlets)).toBe(true);
      expect(def.outlets.every((o) => typeof o === "string")).toBe(true);
      expect(typeof def.searchFocus).toBe("string");
      expect(typeof def.systemPrompt).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
    }
  });
});

describe("DEPTH_CONFIG", () => {
  it("loads all three depths", () => {
    for (const depth of REQUIRED_DEPTHS) {
      expect(DEPTH_CONFIG[depth]).toBeDefined();
    }
  });

  it("each depth has numeric searchRounds, sourcesPerLane, laneMaxTokens", () => {
    for (const depth of REQUIRED_DEPTHS) {
      const def = DEPTH_CONFIG[depth];
      expect(typeof def.searchRounds).toBe("number");
      expect(typeof def.sourcesPerLane).toBe("number");
      expect(typeof def.laneMaxTokens).toBe("number");
      expect(def.searchRounds).toBeGreaterThan(0);
      expect(def.sourcesPerLane).toBeGreaterThan(0);
      expect(def.laneMaxTokens).toBeGreaterThan(0);
    }
  });

  it("each depth has description and synthGuide strings", () => {
    for (const depth of REQUIRED_DEPTHS) {
      const def = DEPTH_CONFIG[depth];
      expect(typeof def.description).toBe("string");
      expect(typeof def.synthGuide).toBe("string");
    }
  });

  it("deep depth implies more thorough scanning than shallow", () => {
    expect(DEPTH_CONFIG.deep.sourcesPerLane).toBeGreaterThanOrEqual(DEPTH_CONFIG.shallow.sourcesPerLane);
    expect(DEPTH_CONFIG.deep.laneMaxTokens).toBeGreaterThanOrEqual(DEPTH_CONFIG.shallow.laneMaxTokens);
  });
});

describe("LANE_PREFIX", () => {
  it("has a single-character prefix for each canonical lane", () => {
    for (const lane of REQUIRED_LANES) {
      const prefix = LANE_PREFIX[lane];
      expect(typeof prefix).toBe("string");
      expect(prefix.length).toBe(1);
    }
  });

  it("prefixes are unique across lanes", () => {
    const values = REQUIRED_LANES.map((l) => LANE_PREFIX[l]);
    expect(new Set(values).size).toBe(values.length);
  });
});
