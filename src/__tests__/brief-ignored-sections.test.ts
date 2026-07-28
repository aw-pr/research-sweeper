import { describe, expect, it } from "vitest";
import { findIgnoredSections } from "../brief";

describe("findIgnoredSections", () => {
  it("stays quiet on a brief using only read and human-facing headings", () => {
    const markdown = [
      "# Research Brief: Example",
      "## Topic string (paste into --topic)",
      "## Sub-questions for synthesis to address",
      "## Suggested command",
      "## Notes",
    ].join("\n\n");

    expect(findIgnoredSections(markdown)).toEqual([]);
  });

  it("reports a directive section that would be silently dropped", () => {
    const markdown = [
      "## Topic string (paste into --topic)",
      "## Timeline requirements",
      "## Sub-questions for synthesis to address",
      "## Publication note",
    ].join("\n\n");

    expect(findIgnoredSections(markdown)).toEqual(["Timeline requirements", "Publication note"]);
  });

  it("does not flag ### subheadings nested inside a read section", () => {
    const markdown = [
      "## Sub-questions for synthesis to address",
      "### Timeline requirements",
      "### Recency requirement",
    ].join("\n\n");

    expect(findIgnoredSections(markdown)).toEqual([]);
  });

  it("flags the real orphaned headings found across existing briefs", () => {
    const markdown = [
      "## Topic string",
      "## Preferred sources (steer for all lanes)",
      "## Anchor events for this run",
      "## Desired Output",
      "## Sub-questions",
      "## Depth guide",
      "## Date anchor guide",
    ].join("\n\n");

    expect(findIgnoredSections(markdown)).toEqual([
      "Preferred sources (steer for all lanes)",
      "Anchor events for this run",
      "Desired Output",
    ]);
  });

  it("tolerates a variant Suggested command heading", () => {
    const markdown = "## Suggested command (Claude OAuth route, no API-key billing)";
    expect(findIgnoredSections(markdown)).toEqual([]);
  });
});
