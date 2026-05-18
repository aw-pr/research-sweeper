import { LaneResult } from "./types";

// Classify outcomes of running all lanes in parallel. A success is any lane
// that returned at least one source; degraded is any lane that returned
// without throwing but produced no usable sources (parse failure, empty list,
// or an in-band "Error during sweep" narrative); rejected covers thrown
// promises that escaped the provider's catch.
export type LaneOutcomeKind = "success" | "degraded" | "rejected";
export interface LaneOutcome {
  lane: string;
  kind: LaneOutcomeKind;
  result?: LaneResult;
  reason?: string;
}

export function classifyLaneOutcomes(lanes: string[], settled: PromiseSettledResult<LaneResult>[]): LaneOutcome[] {
  return settled.map((entry, idx) => {
    const lane = lanes[idx];
    if (entry.status === "rejected") {
      return { lane, kind: "rejected", reason: String(entry.reason) };
    }
    const value = entry.value;
    if (!value.sources || value.sources.length === 0) {
      return {
        lane,
        kind: "degraded",
        result: value,
        reason: value.narrative?.startsWith("Error during sweep") ? value.narrative : "no sources returned",
      };
    }
    return { lane, kind: "success", result: value };
  });
}

export function defaultMinLanes(totalLanes: number): number {
  return Math.ceil(totalLanes / 2);
}
