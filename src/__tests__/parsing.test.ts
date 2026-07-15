import { describe, it, expect } from "vitest";
import { extractText, parseLaneResponse, fallbackLaneResult } from "../parsing";
import type { LaneDefinition } from "../types";

describe("extractText", () => {
  it("concatenates text blocks joined by newlines", () => {
    const blocks = [
      { type: "text", text: "alpha" },
      { type: "tool_use", text: "ignored" },
      { type: "text", text: "beta" },
    ];
    expect(extractText(blocks)).toBe("alpha\nbeta");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("ignores blocks without text property", () => {
    const blocks = [{ type: "text" }, { type: "text", text: "kept" }];
    expect(extractText(blocks as any)).toBe("kept");
  });
});

describe("parseLaneResponse", () => {
  it("parses a valid JSON-embedded lane response", () => {
    const raw = `prelude noise {"sources":[{"title":"Paper A","significance":"matters","url":"https://x","date":"2024-01-01","outlet":"arXiv"}],"narrative":"a summary","model_context":"bg"} trailing`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].title).toBe("Paper A");
    expect(result!.sources[0].outlet).toBe("arXiv");
    expect(result!.narrative).toBe("a summary");
    expect(result!.model_context).toBe("bg");
  });

  it("returns null for empty input", () => {
    expect(parseLaneResponse("")).toBeNull();
  });

  it("returns null when no JSON object is present", () => {
    expect(parseLaneResponse("just prose, no braces here")).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    expect(parseLaneResponse("{ not valid json")).toBeNull();
  });

  it("drops source items missing required fields", () => {
    const raw = `{"sources":[{"title":"keep","significance":"yes"},{"title":"drop"},"string-item"],"narrative":"n"}`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].title).toBe("keep");
  });

  it("returns empty sources / empty narrative when fields are missing entirely", () => {
    const result = parseLaneResponse(`{"foo":"bar"}`);
    expect(result).not.toBeNull();
    expect(result!.sources).toEqual([]);
    expect(result!.narrative).toBe("");
    expect(result!.model_context).toBeUndefined();
  });

  it("recovers sources despite unescaped control characters inside string values", () => {
    // Literal newline inside a JSON string is invalid; the object should still
    // parse once in-string control chars are escaped.
    const raw = `{"sources":[{"title":"T","significance":"why this source matters"}],"narrative":"paragraph one.\nspurious break continues"}`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.narrative).toContain("paragraph one");
  });

  it("recovers sources serialised as an XML <item> string instead of a JSON array", () => {
    const raw = `{"sources":"<item><title>Paper X</title><url>https://x</url><date>2026-01</date><outlet>arXiv</outlet><significance>why this matters and is long enough</significance></item>","narrative":"n"}`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].title).toBe("Paper X");
    expect(result!.sources[0].url).toBe("https://x");
  });

  it("salvages the sources array and clean narrative when unescaped quotes break the object", () => {
    // The inner quotes around "quoted" make the whole object unparseable, but
    // the sources array is valid on its own and the prose is recoverable.
    const raw = `{"lane":"vc","sources":[{"title":"Keep","significance":"a clean significance"}],"narrative":"The phrase "quoted" breaks JSON but the prose is recovered.","model_context":"ctx"}`;
    const result = parseLaneResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].title).toBe("Keep");
    expect(result!.narrative).toContain("quoted");
    expect(result!.narrative).not.toContain('"sources"');
    expect(result!.model_context).toBe("ctx");
  });

  it("recovers a narrative emitted under research_summary or synthesis_signals", () => {
    const financial = parseLaneResponse(
      `{"lane":"financial","sources":[{"title":"A","significance":"x"}],"research_summary":"Enterprise adoption accelerated."}`
    );
    expect(financial!.narrative).toBe("Enterprise adoption accelerated.");

    const tech = parseLaneResponse(
      `{"lane":"tech","sources":[{"title":"B","significance":"y"}],"synthesis_signals":"Practitioners report uneven gains."}`
    );
    expect(tech!.narrative).toBe("Practitioners report uneven gains.");
  });

  it("falls back to a narrative-hinted key only when the lane returned sources", () => {
    const withSources = parseLaneResponse(
      `{"sources":[{"title":"A","significance":"x"}],"key_takeaways":"The throughline of the lane."}`
    );
    expect(withSources!.narrative).toBe("The throughline of the lane.");

    const noSources = parseLaneResponse(`{"sources":[],"key_takeaways":"Should not be used."}`);
    expect(noSources!.narrative).toBe("");
  });

  it("recovers sources whose significance uses a drifted key and an inline URL", () => {
    const result = parseLaneResponse(
      `{"sources":[{"title":"Large Enough","lab_or_evaluator":"Mistral","date":"2024-07-24","core_relevance":"Shows the 2024 push toward larger-context enterprise models and why deployment pressure grew.","core_claim_or_finding":"Mistral Large 2 added a 128k context window. ([mistral.ai](https://mistral.ai/en/news/mistral-large-2407))"}],"narrative":"n"}`
    );
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0]).toMatchObject({
      title: "Large Enough",
      outlet: "Mistral",
      date: "2024-07-24",
      url: "https://mistral.ai/en/news/mistral-large-2407",
    });
    expect(result!.sources[0].significance).toContain("larger-context enterprise models");
  });

  it("normalises OpenAI batch schema drift without discarding sourced output", () => {
    const result = parseLaneResponse(
      `{"sources":[{"title":"Paper A","publication":"arXiv","why_it_matters":"Measured result"}],"synthesis":{"executive_summary":["Finding"]}}`
    );
    expect(result).not.toBeNull();
    expect(result!.sources).toEqual([{ title: "Paper A", outlet: "arXiv", significance: "Measured result", url: undefined, date: undefined }]);
    expect(result!.narrative).toBe("**executive summary:**\n\n- Finding");
    expect(result!.narrative).not.toContain('"executive_summary"');
  });

  it("formats object-shaped lane narratives as markdown instead of raw JSON", () => {
    const result = parseLaneResponse(
      JSON.stringify({
        sources: [{ title: "Paper A", publication: "arXiv", why_it_matters: "Measured result" }],
        narrative: {
          one_paragraph_take: "Hybrid repo intelligence is winning.",
          semantic_vs_syntactic_vs_embedding: {
            semantic: "Best for symbol navigation.",
            syntactic: "Cheap and robust.",
            embedding: "Good for fuzzy discovery.",
          },
          evidence_quality_notes: ["Evidence is uneven.", "Benchmarks are still young."],
        },
      })
    );
    expect(result).not.toBeNull();
    expect(result!.narrative).toContain("**one paragraph take:** Hybrid repo intelligence is winning.");
    expect(result!.narrative).toContain("**semantic vs syntactic vs embedding:**");
    expect(result!.narrative).toContain("- **semantic:** Best for symbol navigation.");
    expect(result!.narrative).toContain("**evidence quality notes:**");
    expect(result!.narrative).toContain("- Evidence is uneven.");
    expect(result!.narrative).not.toContain('"one_paragraph_take"');
  });

  it("normalises lane-specific OpenAI source fields from completed batches", () => {
    const result = parseLaneResponse(
      JSON.stringify({
        sources: [
          {
            outlet: "Martin Fowler / Thoughtworks",
            date: "2025-06-04",
            practice_or_pattern: "Autonomous background coding agents and code-context workflows.",
            empirical_grounding: "Practitioner exploration and hands-on experiments.",
            citation: "([martinfowler.com](https://www.martinfowler.com/articles/example.html?utm_source=openai))",
          },
          {
            lab_or_evaluator: "OpenAI",
            date: "2025-06-03",
            model_or_paper: "Codex update",
            core_claim: "Codex can be given internet access during execution.",
            citation: "([openai.com](https://openai.com/index/example/?utm_source=openai))",
          },
          {
            outlet: "Simon Willison's Weblog",
            headline: "Coding agents require skilled operators",
            claim: "Agents still require a skilled human operator to steer context and verify outputs.",
          },
        ],
        summary: "Independent commentary converges on hybrid indexing.",
      })
    );
    expect(result).not.toBeNull();
    expect(result!.sources).toEqual([
      {
        title: "Autonomous background coding agents and code-context workflows.",
        outlet: "Martin Fowler / Thoughtworks",
        significance: "Autonomous background coding agents and code-context workflows.",
        url: "https://www.martinfowler.com/articles/example.html?utm_source=openai",
        date: "2025-06-04",
      },
      {
        title: "Codex update",
        outlet: "OpenAI",
        significance: "Codex can be given internet access during execution.",
        url: "https://openai.com/index/example/?utm_source=openai",
        date: "2025-06-03",
      },
      {
        title: "Coding agents require skilled operators",
        outlet: "Simon Willison's Weblog",
        significance: "Agents still require a skilled human operator to steer context and verify outputs.",
        url: undefined,
        date: undefined,
      },
    ]);
    expect(result!.narrative).toBe("Independent commentary converges on hybrid indexing.");
  });
});

describe("fallbackLaneResult", () => {
  const definition: LaneDefinition = {
    label: "Frontier",
    outlets: [],
    searchFocus: "f",
    systemPrompt: "p",
  };

  it("packages raw text + counts into a LaneResult", () => {
    const result = fallbackLaneResult("frontier", definition, "raw body", 12, 34, "claude-haiku-4-5-20251001");
    expect(result.lane).toBe("frontier");
    expect(result.label).toBe("Frontier");
    expect(result.sources).toEqual([]);
    expect(result.narrative).toBe("raw body");
    expect(result.rawText).toBe("raw body");
    expect(result.tokensIn).toBe(12);
    expect(result.tokensOut).toBe(34);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("defaults model to empty string", () => {
    const result = fallbackLaneResult("blogs", definition, "", 0, 0);
    expect(result.model).toBe("");
    expect(result.narrative).toBe("");
  });
});
