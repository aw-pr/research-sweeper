import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import { parseBriefFile } from "../brief";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof fs>("fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

const mockedReadFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedReadFileSync.mockReset();
});

describe("parseBriefFile", () => {
  it("extracts title, topic from fenced block, and briefing", () => {
    const md = [
      "# Research Brief: Agent Orchestration",
      "",
      "## Topic string",
      "",
      "```",
      "How do production agent harnesses compare?",
      "```",
      "",
      "## Sub-questions",
      "",
      "Some preamble paragraph here that should be skipped.",
      "",
      "- What patterns dominate?",
      "- Which tools win?",
      "",
      "## Notes",
      "",
      "irrelevant",
    ].join("\n");
    mockedReadFileSync.mockReturnValue(md);

    const parsed = parseBriefFile("/fake/path/brief.md");
    expect(parsed.title).toBe("Agent Orchestration");
    expect(parsed.topic).toBe("How do production agent harnesses compare?");
    expect(parsed.briefing).toContain("- What patterns dominate?");
    expect(parsed.briefing).toContain("- Which tools win?");
    expect(parsed.briefing).not.toContain("Some preamble paragraph");
    expect(parsed.briefFile).toMatch(/brief\.md$/);
  });

  it("throws with the file path when the file is not found", () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error("ENOENT: no such file or directory, open '/does/not/exist.md'");
      throw err;
    });
    expect(() => parseBriefFile("/does/not/exist.md")).toThrow(/exist\.md/);
  });

  it("returns no topic/briefing for an empty file without throwing", () => {
    mockedReadFileSync.mockReturnValue("");
    const parsed = parseBriefFile("/fake/empty.md");
    expect(parsed.title).toBeUndefined();
    expect(parsed.topic).toBeUndefined();
    expect(parsed.briefing).toBeUndefined();
  });

  it("handles a file with only frontmatter / heading and no sections gracefully", () => {
    mockedReadFileSync.mockReturnValue("# Research Brief: Just A Heading\n");
    const parsed = parseBriefFile("/fake/heading.md");
    expect(parsed.title).toBe("Just A Heading");
    expect(parsed.topic).toBeUndefined();
    expect(parsed.briefing).toBeUndefined();
  });

  it("falls back to raw section text for topic when no fenced block is present", () => {
    const md = "## Topic string\n\nA plain-text topic line.\n\n## Other\n";
    mockedReadFileSync.mockReturnValue(md);
    const parsed = parseBriefFile("/fake/plain.md");
    expect(parsed.topic).toBe("A plain-text topic line.");
  });
});
